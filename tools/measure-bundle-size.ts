/**
 * Measure minified + gzip bundle sizes for sently subpath exports.
 *
 * Run: bun tools/measure-bundle-size.ts
 * CI:  bun tools/measure-bundle-size.ts --check
 * Docs: bun tools/measure-bundle-size.ts --markdown
 *
 * Each scenario bundles imports in isolation (minify + gzip), matching consumer
 * tree-shaking. Node built-ins and `cloudflare:sockets` are external.
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "bun";

const root = join(import.meta.dir, "..");
const scratch = join(root, ".tmp-size");
const outdir = join(scratch, "bundles");
const checkMode = process.argv.includes("--check");
const markdownMode = process.argv.includes("--markdown");

const budgets = JSON.parse(
  readFileSync(join(import.meta.dir, "bundle-size-budgets.json"), "utf8"),
) as Record<string, number>;

const external = [
  "node:net",
  "node:tls",
  "node:dns",
  "node:dns/promises",
  "node:fs/promises",
  "node:path",
  "node:child_process",
  "cloudflare:sockets",
];

type ScenarioCategory = "stack" | "core" | "transport" | "adapter" | "optional";

interface Scenario {
  /** Budget key — must match tools/bundle-size-budgets.json when enforced. */
  id: string;
  category: ScenarioCategory;
  /** Short label for tables. */
  label: string;
  /** What this scenario represents. */
  description: string;
  code: string;
  /** When false, measured but not enforced in CI (informational). */
  budget?: boolean;
}

const scenarios: Scenario[] = [
  // ─── Common stacks (what most apps import together) ───
  {
    id: "stack: http-resend",
    category: "stack",
    label: "HTTP — Resend",
    description: "`sently/mailer` + `sently/transports/resend`",
    code: `import { createMailer } from "../src/mailer.ts"; import { ResendTransport } from "../src/transports/resend.ts"; export const keep = async () => createMailer({ transport: new ResendTransport({ apiKey: "x" }) });`,
  },
  {
    id: "stack: http-sendgrid",
    category: "stack",
    label: "HTTP — SendGrid",
    description: "`sently/mailer` + `sently/transports/sendgrid`",
    code: `import { createMailer } from "../src/mailer.ts"; import { SendGridTransport } from "../src/transports/sendgrid.ts"; export const keep = async () => createMailer({ transport: new SendGridTransport({ apiKey: "x" }) });`,
    budget: false,
  },
  {
    id: "stack: http-transport-only",
    category: "stack",
    label: "HTTP — transport only",
    description: "`sently/transports/resend` (no `createMailer` wrapper)",
    code: `import { ResendTransport } from "../src/transports/resend.ts"; export const keep = ResendTransport;`,
    budget: false,
  },
  {
    id: "stack: smtp-relay",
    category: "stack",
    label: "SMTP relay",
    description: "`sently` with `{ host, port, auth }`",
    code: `import { createMailer } from "../src/detect.ts"; export const keep = () => createMailer({ host: "smtp.example.com", port: 587, auth: { user: "u", pass: "p" } });`,
    budget: false,
  },
  {
    id: "stack: smtp-explicit-adapter",
    category: "stack",
    label: "SMTP + Node adapter",
    description: "`sently` + `sently/adapters/node`",
    code: `import { createMailer } from "../src/detect.ts"; import { NodeAdapter } from "../src/adapters/node.ts"; export const keep = () => createMailer({ host: "smtp.example.com", port: 587, adapter: new NodeAdapter() });`,
    budget: false,
  },
  {
    id: "sently + ResendTransport",
    category: "stack",
    label: "Main entry + HTTP (avoid)",
    description: "`sently` + `sently/transports/resend` — pulls SMTP graph in flat bundles",
    code: `import { createMailer } from "../src/detect.ts"; import { ResendTransport } from "../src/transports/resend.ts"; export const keep = { createMailer, ResendTransport };`,
  },
  // ─── Core entries ───
  {
    id: "sently/mailer",
    category: "core",
    label: "sently/mailer",
    description: "Transport-only `createMailer` (plugins, sendBulk)",
    code: `import { createMailer } from "../src/mailer.ts"; export const keep = createMailer;`,
  },
  {
    id: "sently (createMailer)",
    category: "core",
    label: "sently",
    description: "Full `createMailer` — SMTP-capable main entry",
    code: `import { createMailer } from "../src/detect.ts"; export const keep = createMailer;`,
  },
  {
    id: "sently/dkim",
    category: "optional",
    label: "sently/dkim",
    description: "DKIM signing (lazy-loaded by MIME when `dkim` option set)",
    code: `import { signDKIM } from "../src/dkim.ts"; export const keep = signDKIM;`,
    budget: false,
  },
  // ─── Transports ───
  {
    id: "sently/transports/resend",
    category: "transport",
    label: "transports/resend",
    description: "Resend HTTP API",
    code: `import { ResendTransport } from "../src/transports/resend.ts"; export const keep = ResendTransport;`,
  },
  {
    id: "sently/transports/sendgrid",
    category: "transport",
    label: "transports/sendgrid",
    description: "SendGrid v3 API",
    code: `import { SendGridTransport } from "../src/transports/sendgrid.ts"; export const keep = SendGridTransport;`,
  },
  {
    id: "sently/transports/postmark",
    category: "transport",
    label: "transports/postmark",
    description: "Postmark API",
    code: `import { PostmarkTransport } from "../src/transports/postmark.ts"; export const keep = PostmarkTransport;`,
  },
  {
    id: "sently/transports/mailgun",
    category: "transport",
    label: "transports/mailgun",
    description: "Mailgun API",
    code: `import { MailgunTransport } from "../src/transports/mailgun.ts"; export const keep = MailgunTransport;`,
  },
  {
    id: "sently/transports/brevo",
    category: "transport",
    label: "transports/brevo",
    description: "Brevo API",
    code: `import { BrevoTransport } from "../src/transports/brevo.ts"; export const keep = BrevoTransport;`,
  },
  {
    id: "sently/transports/ses",
    category: "transport",
    label: "transports/ses",
    description: "AWS SES v2 + SigV4",
    code: `import { SESTransport } from "../src/transports/ses.ts"; export const keep = SESTransport;`,
  },
  {
    id: "sently/transports/smtp",
    category: "transport",
    label: "transports/smtp",
    description: "SMTP protocol + MIME builder",
    code: `import { SMTPTransport } from "../src/transports/smtp.ts"; export const keep = SMTPTransport;`,
  },
  {
    id: "sently/transports/preview",
    category: "transport",
    label: "transports/preview",
    description: "Dev preview to disk",
    code: `import { PreviewTransport } from "../src/transports/preview.ts"; export const keep = PreviewTransport;`,
  },
  // ─── Adapters (SMTP socket layer; loaded at runtime by default) ───
  {
    id: "sently/adapters/node",
    category: "adapter",
    label: "adapters/node",
    description: "Node.js `node:net` / `node:tls`",
    code: `import { NodeAdapter } from "../src/adapters/node.ts"; export const keep = NodeAdapter;`,
  },
  {
    id: "sently/adapters/bun",
    category: "adapter",
    label: "adapters/bun",
    description: "Bun TCP/TLS",
    code: `import { BunAdapter } from "../src/adapters/bun.ts"; export const keep = BunAdapter;`,
  },
  {
    id: "sently/adapters/deno",
    category: "adapter",
    label: "adapters/deno",
    description: "Deno `Deno.connect` / `Deno.startTls`",
    code: `import { DenoAdapter } from "../src/adapters/deno.ts"; export const keep = DenoAdapter;`,
  },
  {
    id: "sently/adapters/cf",
    category: "adapter",
    label: "adapters/cf",
    description: "Cloudflare Workers `cloudflare:sockets`",
    code: `import { CloudflareAdapter } from "../src/adapters/cf.ts"; export const keep = CloudflareAdapter;`,
  },
];

/** Bundle `code` and return gzip size in bytes. */
async function measureGzipBytes(slug: string, code: string): Promise<number> {
  mkdirSync(scratch, { recursive: true });
  const entry = join(scratch, `${slug}.ts`);
  writeFileSync(entry, code);

  const result = await build({
    entrypoints: [entry],
    outdir,
    root,
    minify: true,
    format: "esm",
    naming: `${slug}.[ext]`,
    external,
  });

  if (!result.success) {
    throw new Error(`Bundle failed for ${slug}`);
  }

  const output = result.outputs[0]?.path;
  if (!output) {
    throw new Error(`No output for ${slug}`);
  }

  return gzipSync(readFileSync(output)).length;
}

function toKb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function slug(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

interface Result extends Scenario {
  bytes: number;
}

rmSync(scratch, { recursive: true, force: true });

const results: Result[] = [];
for (const scenario of scenarios) {
  const bytes = await measureGzipBytes(slug(scenario.id), scenario.code);
  results.push({ ...scenario, bytes });
}

const violations: string[] = [];

for (const r of results) {
  const budgetKey = r.id.startsWith("stack:") ? undefined : r.id;
  const budget = budgetKey ? budgets[budgetKey] : undefined;
  if (r.budget === false || budget === undefined) {
    continue;
  }
  if (bytesExceeds(r.bytes, budget)) {
    violations.push(`${r.id}: ${r.bytes} bytes gzip exceeds budget ${budget} (+${r.bytes - budget})`);
  }
}

function bytesExceeds(bytes: number, budget: number): boolean {
  return bytes > budget;
}

function budgetFor(r: Result): number | undefined {
  if (r.budget === false) {
    return undefined;
  }
  if (r.id.startsWith("stack:")) {
    return budgets[r.id];
  }
  return budgets[r.id];
}

const categoryTitles: Record<ScenarioCategory, string> = {
  stack: "Common stacks",
  core: "Core entries",
  transport: "Transports",
  adapter: "Adapters",
  optional: "Optional add-ons",
};

function printTable(rows: Result[], title: string): void {
  console.log(`\n### ${title}\n`);
  console.log("| What | Imports | ~gzip |");
  console.log("|------|---------|-------|");
  for (const r of rows) {
    const budget = budgetFor(r);
    const fail = budget !== undefined && bytesExceeds(r.bytes, budget) ? " ⚠" : "";
    console.log(`| ${r.label} | ${r.description} | ~${toKb(r.bytes)} KB${fail} |`);
  }
}

if (markdownMode) {
  console.log("<!-- Generated by: bun tools/measure-bundle-size.ts --markdown -->");
  console.log("<!-- Do not edit sizes by hand — re-run the command and paste, or copy tables from CLI output. -->\n");

  for (const cat of ["stack", "core", "transport", "adapter", "optional"] as ScenarioCategory[]) {
    const rows = results.filter((r) => r.category === cat);
    if (rows.length === 0) {
      continue;
    }
    console.log(`#### ${categoryTitles[cat]}\n`);
    console.log("| What | Imports | ~gzip |");
    console.log("|------|---------|-------|");
    for (const r of rows) {
      console.log(`| ${r.label} | ${r.description} | ~${toKb(r.bytes)} KB |`);
    }
    console.log("");
  }
} else {
  console.log("sently bundle sizes (minified + gzip)\n");

  for (const cat of ["stack", "core", "transport", "adapter", "optional"] as ScenarioCategory[]) {
    const rows = results.filter((r) => r.category === cat);
    if (rows.length === 0) {
      continue;
    }
    printTable(rows, categoryTitles[cat]);
  }

  console.log("\n| id | bytes | budget |");
  console.log("|----|-------|--------|");
  for (const r of results) {
    const budget = budgetFor(r);
    const budgetLabel = budget !== undefined ? String(budget) : "—";
    const status = budget !== undefined && bytesExceeds(r.bytes, budget) ? " FAIL" : "";
    console.log(`| \`${r.id}\` | ${r.bytes} | ${budgetLabel}${status} |`);
  }
}

if (violations.length > 0) {
  console.error("\nBundle size budget exceeded:\n");
  for (const v of violations) {
    console.error(`  • ${v}`);
  }
  if (checkMode) {
    process.exit(1);
  }
} else if (checkMode) {
  console.log("\n✓ All bundle size budgets passed");
} else if (!markdownMode) {
  console.log("\nRun with --check to enforce budgets (CI), --markdown for doc tables.");
}

if (!markdownMode) {
  console.log("Update tools/bundle-size-budgets.json when sizes change intentionally.");
}
