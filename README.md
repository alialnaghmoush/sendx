# sently

> Nodemailer hasn't been updated in years, doesn't run on Bun or Deno, and ships at 220KB.
> sently is the modern replacement — same familiar API, runs everywhere, tree-shakes to ~6KB.

```bash
bun add sently
```

[![npm version](https://img.shields.io/npm/v/sently.svg)](https://www.npmjs.com/package/sently)
[![JSR](https://jsr.io/badges/@alialnaghmoush/sently)](https://jsr.io/@alialnaghmoush/sently)
[![bundle size](https://img.shields.io/bundlephobia/minzip/sently)](https://bundlephobia.com/package/sently)
[![license](https://img.shields.io/npm/l/sently.svg)](LICENSE)
[![tests](https://img.shields.io/badge/tests-passing-brightgreen)](#)
[![GitHub](https://img.shields.io/github/stars/alialnaghmoush/sently?style=social&label=GitHub)](https://github.com/alialnaghmoush/sently)

---

## Why not Nodemailer?

| Feature | Nodemailer | sently |
|---------|-----------|--------|
| Bundle size | ~220 KB | ~6 KB core |
| Runtimes | Node.js only | Node, Bun, Deno, CF Workers |
| Module format | CommonJS | ESM only |
| Dependencies | 3 | 0 |
| DKIM signing | ✓ via `nodemailer-dkim` | ✓ built-in (Web Crypto) |
| OAuth2 / XOAUTH2 | ✓ via plugin | ✓ built-in |
| Connection pooling | ✓ | ✓ |
| HTTP transports | ✓ via plugins | ✓ built-in (6 providers) |
| Retry transport | ✗ | ✓ |
| Preview transport | ✗ | ✓ |
| Template engine | ✗ | ✓ |
| `sendBulk()` | ✗ | ✓ |
| TypeScript | via `@types/nodemailer` | ✓ built-in |
| Last release | 2021 | 2026 |

---

## The 30-second tour

```typescript
import { createMailer, type MailOptions } from "sently";
import { ResendTransport } from "sently/transports/resend";
import { PreviewTransport } from "sently/transports/preview";

const addFooter = (options: MailOptions): MailOptions => ({
  ...options,
  html: (options.html ?? "") + '<p style="color:#999">Unsubscribe</p>',
});

// Swap providers without changing send code
const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
  plugins: [addFooter],
});

await mailer.send({
  from: "you@example.com",
  to: "recipient@example.com",
  subject: "Hello from sently",
  html: "<p>Hello!</p>",
});

// Bulk send with concurrency control
await mailer.sendBulk(recipients, { concurrency: 5 });

// Local dev — write to disk instead of sending
const devMailer = await createMailer({
  transport: process.env.CI
    ? new ResendTransport({ apiKey: process.env.RESEND_API_KEY! })
    : new PreviewTransport({ outDir: ".emails", open: true }),
});
```

---

## Installation

**npm** ([sently](https://www.npmjs.com/package/sently)):

```bash
bun add sently
npm install sently
pnpm add sently
```

**JSR** ([@alialnaghmoush/sently](https://jsr.io/@alialnaghmoush/sently)) — Deno, Bun, and other JSR-aware runtimes:

```bash
deno add jsr:@alialnaghmoush/sently
bunx jsr add @alialnaghmoush/sently
```

```typescript
import { createMailer } from "sently";
```

---

## Quick Start

### SMTP with auto-detected adapter

```typescript
import { createMailer } from "sently";

const mailer = await createMailer({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "you@example.com", pass: "secret" },
});

await mailer.send({
  from: "you@example.com",
  to: "recipient@example.com",
  subject: "Hello from sently",
  text: "Plain text body",
  html: "<p>HTML body</p>",
});

await mailer.close();
```

### Resend HTTP transport (Vercel Edge compatible)

```typescript
import { createMailer } from "sently";
import { ResendTransport } from "sently/transports/resend";

const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
});

await mailer.send({
  from: "onboarding@yourdomain.com",
  to: "recipient@example.com",
  subject: "Hello from the edge",
  html: "<p>Sent via Resend + sently</p>",
});
```

### Cloudflare Worker

```typescript
import { createMailer } from "sently";
import { CloudflareAdapter } from "sently/adapters/cf";

export default {
  async fetch() {
    const mailer = await createMailer({
      host: "smtp.example.com",
      port: 587,
      auth: { user: "relay@example.com", pass: "secret" },
      adapter: new CloudflareAdapter(),
    });

    await mailer.send({
      from: "relay@example.com",
      to: "user@example.com",
      subject: "From a Worker",
      text: "Hello from Cloudflare Workers",
    });

    return new Response("Sent");
  },
};
```

---

## Adapters

| Runtime | Import | Notes |
|---------|--------|-------|
| Node.js (auto) | `createMailer(config)` | Auto-detected |
| Node.js (explicit) | `sently/adapters/node` → `NodeAdapter` | Reference implementation |
| Bun (auto) | `createMailer(config)` | Auto-detected |
| Bun (explicit) | `sently/adapters/bun` → `BunAdapter` | Node compat layer |
| Deno | `sently/adapters/deno` → `DenoAdapter` | Native `Deno.startTls` |
| Cloudflare Workers | `sently/adapters/cf` → `CloudflareAdapter` | `cloudflare:sockets` |

```typescript
import { NodeAdapter } from "sently/adapters/node";

const mailer = await createMailer({
  host: "smtp.example.com",
  adapter: new NodeAdapter({ secure: false }),
  auth: { user: "you@example.com", pass: "secret" },
});
```

---

## Transports

### SMTP

```typescript
import { createMailer } from "sently";
import { SMTPTransport } from "sently/transports/smtp";
import { NodeAdapter } from "sently/adapters/node";

const transport = new SMTPTransport({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "you@example.com", pass: "secret" },
  adapter: new NodeAdapter(),
});

const mailer = await createMailer({ transport });
await mailer.verify(); // test connection + auth
```

**AUTH methods:** XOAUTH2, CRAM-MD5, LOGIN, and PLAIN (auto-negotiated from EHLO unless `auth.type` is set).

**`requireTLS` (default `true` when `auth` is set):** sently refuses to send credentials over an unencrypted connection. If the link is not secured by direct TLS (`secure: true`) or a successful `STARTTLS` upgrade, authentication throws an `SMTPError` instead of leaking credentials — this defends against STARTTLS-stripping MITM attacks. Set `requireTLS: false` only if you fully trust the network (not recommended).

#### DKIM signing

```typescript
const mailer = await createMailer({
  host: "smtp.example.com",
  auth: { user: "you@example.com", pass: "secret" },
  dkim: {
    domainName: "example.com",
    keySelector: "2024",
    privateKey: await Bun.file("dkim-private.pem").text(),
  },
});
```

#### Gmail OAuth2 (XOAUTH2)

```typescript
import { OAuth2Client } from "sently/auth/oauth2";

const mailer = await createMailer({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    type: "OAUTH2",
    user: "me@gmail.com",
    oauth2: {
      user: "me@gmail.com",
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
    },
  },
});
```

#### Connection pooling

```typescript
const mailer = await createMailer({
  host: "smtp.example.com",
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 10,
  rateLimit: 1000,
  auth: { user: "you@example.com", pass: "secret" },
});
```

Or use `SMTPPool` directly:

```typescript
import { SMTPPool } from "sently/pool";

const pool = new SMTPPool({
  host: "smtp.example.com",
  adapter: new NodeAdapter(),
  auth: { user: "you@example.com", pass: "secret" },
});
```

### HTTP APIs

| Transport | Import path | Required config |
|-----------|-------------|-----------------|
| Resend | `sently/transports/resend` | `apiKey` |
| SendGrid | `sently/transports/sendgrid` | `apiKey` |
| Postmark | `sently/transports/postmark` | `serverToken` |
| Mailgun | `sently/transports/mailgun` | `apiKey`, `domain` |
| AWS SES | `sently/transports/ses` | `accessKeyId`, `secretAccessKey`, `region` |
| Brevo | `sently/transports/brevo` | `apiKey` |

All transports implement the same interface — swap without changing your send code.

Messages with attachments are sent as raw MIME (`Content.Raw`); simple messages use `Content.Simple`.

### PreviewTransport

Write emails to disk during local development instead of sending them:

```typescript
import { PreviewTransport } from "sently/transports/preview";
import { createMailer } from "sently";

const mailer = await createMailer({
  transport: new PreviewTransport({
    outDir: "./.emails",
    open: true,
    format: "html",
  }),
});

await mailer.send({
  from: "dev@localhost",
  to: "you@example.com",
  subject: "Preview me",
  html: "<h1>Hello</h1>",
});
```

### RetryTransport

Wrap any transport with automatic retries and configurable backoff:

```typescript
import { RetryTransport } from "sently/transports/retry";
import { ResendTransport } from "sently/transports/resend";
import { createMailer } from "sently";

const transport = new RetryTransport(
  new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
  { maxAttempts: 3, backoff: "exponential", retryOn: [429, 503] },
);

const mailer = await createMailer({ transport });
```

### sendBulk()

Send multiple messages with concurrency control and per-message callbacks:

```typescript
const result = await mailer.sendBulk(
  [
    { from: "a@b.com", to: "1@example.com", subject: "One", text: "Hi" },
    { from: "a@b.com", to: "2@example.com", subject: "Two", text: "Hi" },
  ],
  {
    concurrency: 2,
    onSuccess: (_msg, index) => console.log(`Sent #${index}`),
    onError: (_msg, index, err) => console.error(`Failed #${index}`, err),
  },
);

console.log(result.sent, result.failed);
```

---

## Plugin system

Plugins transform `MailOptions` before the transport builds and sends the message. They run sequentially — each receives the output of the previous plugin.

```typescript
import { createMailer, type MailOptions } from "sently";

const addFooter = (options: MailOptions) => ({
  ...options,
  html: (options.html ?? "") + '<p style="color:#999">Unsubscribe</p>',
});

const mailer = await createMailer({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: { user: "resend", pass: process.env.RESEND_API_KEY! },
  plugins: [addFooter],
});
```

Works with SMTP config or custom transports:

```typescript
const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: "re_..." }),
  plugins: [addFooter],
});
```

### TemplatePlugin

Render HTML from named templates with zero dependencies:

```typescript
import { templatePlugin, simpleEngine } from "sently/plugins/template";
import { createMailer } from "sently";
import { ResendTransport } from "sently/transports/resend";

const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: "re_..." }),
  plugins: [
    templatePlugin({
      engine: simpleEngine,
      templates: {
        welcome: "<h1>Hello, {{name}}!</h1>",
      },
    }),
  ],
});

await mailer.send({
  from: "onboarding@yourdomain.com",
  to: "user@example.com",
  subject: "Welcome",
  template: "welcome",
  data: { name: "Ali" },
});
```

Use a custom engine by passing any `(template, data) => string` function to `templatePlugin`.

---

## MailOptions Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | `AddressInput` | *required* | Sender address |
| `to` | `AddressInput` | *required* | Recipients |
| `cc` | `AddressInput` | — | CC recipients (visible in headers) |
| `bcc` | `AddressInput` | — | BCC recipients (envelope only, not in headers) |
| `replyTo` | `AddressInput` | — | Reply-To header |
| `subject` | `string` | *required* | Email subject (RFC 2047 for non-ASCII) |
| `text` | `string` | — | Plain text body |
| `html` | `string` | — | HTML body |
| `attachments` | `Attachment[]` | — | File attachments |
| `headers` | `Record<string, string>` | — | Custom headers |
| `messageId` | `string` | auto | Message-ID header |
| `date` | `Date` | now | Date header |
| `priority` | `'high' \| 'normal' \| 'low'` | — | X-Priority / Importance |
| `encoding` | `'utf-8' \| 'ascii'` | `'utf-8'` | Character encoding hint |

---

## Attachments

> ⚠️ **Security note**: `attachment.path` reads files from disk.
> Never pass user-controlled paths without validation.

### In-memory (all runtimes)

```typescript
await mailer.send({
  from: "you@example.com",
  to: "user@example.com",
  subject: "With attachment",
  text: "See attached",
  attachments: [
    {
      filename: "report.pdf",
      content: pdfBytes, // Uint8Array
      contentType: "application/pdf",
    },
  ],
});
```

### File path (Node.js / Bun / Deno only)

```typescript
attachments: [
  {
    filename: "report.pdf",
    path: "/path/to/report.pdf",
  },
],
```

On Cloudflare Workers and browsers, use `content: Uint8Array` — `attachment.path` is not supported.

---

## Error Handling

```typescript
import { SMTPError } from "sently";
import { ResendError } from "sently/transports/resend";
// Each HTTP transport exports its own error class:
// SendGridError  → sently/transports/sendgrid
// PostmarkError  → sently/transports/postmark
// MailgunError   → sently/transports/mailgun
// SESError       → sently/transports/ses
// BrevoError     → sently/transports/brevo

try {
  await mailer.send({ ... });
} catch (err) {
  if (err instanceof SMTPError) {
    console.error(err.code);     // SMTP response code, e.g. 550
    console.error(err.command);  // failed command, e.g. "RCPT TO"
  }
  if (err instanceof ResendError) {
    console.error(err.statusCode); // HTTP status code
  }
}
```

Import error classes from their transport subpath — not from `sently` core. Each exports a `statusCode` property on HTTP failures.

---

## Security

sently is built to be secure by default — protections are enforced at the library's core chokepoints, so they apply to every transport and every address field without any extra configuration.

### Email header & SMTP command injection

All addresses **and** display names are validated centrally in `parseAddresses()` (and re-asserted when rendering headers), before any normalization:

- Rejects CR, LF, NUL, every other C0 control (`0x00`–`0x1F`), DEL (`0x7F`), and the Unicode line/paragraph separators `U+2028`/`U+2029`.
- **Fails closed:** hostile input throws a clear error (with the offending code point) — it is never stripped, repaired, and then accepted.
- Protects the **display name** too, so an ASCII name like `"Foo\r\nBcc: attacker@evil.com"` can no longer inject a header.
- Enforced consistently across **From, To, Cc, Bcc, and Reply-To**, and across **every transport** (SMTP, SES, Mailgun, Postmark, Resend, SendGrid, Brevo).

```typescript
await mailer.send({
  from: "you@example.com",
  to: { address: "victim@x.com\r\nBcc: attacker@evil.com" },
  subject: "Hi",
  text: "...",
});
// → throws: Email address contains a forbidden control character (0x0d)
```

MIME attachment filenames and custom attachment headers are likewise sanitized against header injection.

### Credential protection

- **`requireTLS`** (default `true` when `auth` is set) refuses to authenticate over a cleartext connection, defeating STARTTLS-stripping downgrade attacks.
- **OAuth2 / XOAUTH2** and DKIM signing are built in via Web Crypto — no plaintext secrets in transit beyond what the protocol requires.

### Attachments

> ⚠️ `attachment.path` reads files from disk. Never pass user-controlled paths without validation.

`resolveAttachments()` accepts an opt-in `basePath` that confines reads to an allowed directory and rejects path-traversal (including sibling-directory prefix tricks like `/var/data-secret` vs `/var/data`). Note: `basePath` does not dereference symlinks — use `fs.realpath()` first if symlink traversal is a concern.

### Supply chain

**Zero runtime dependencies** — there is no transitive dependency tree to audit or to be compromised.

---

## Tree-Shaking

Each import path is a separate build entry point:

```
import { createMailer } from "sently"
+ import { ResendTransport } from "sently/transports/resend"
→ Bundle: core/mime (~8KB) + core/address (~2KB) + transports/resend (~2KB) ≈ ~12KB gzip

vs. full Nodemailer: ~220KB
```

Only code you import is bundled. Adapters and transports you never import are never included.

---

## Migrating from Nodemailer

| Nodemailer | sently |
|------------|-------|
| `nodemailer.createTransport({...})` | `await createMailer({...})` |
| `transporter.sendMail(options)` | `mailer.send(options)` |
| `transporter.verify()` | `mailer.verify()` |
| `options.attachments[].path` | Same (Node/Bun/Deno); use `content` on edge |
| `import nodemailer from 'nodemailer'` | `import { createMailer } from 'sently'` |
| CommonJS | ESM only |
| Node.js only | Node, Bun, Deno, CF Workers |

---

## Bundle Size

Approximate gzip sizes per subpath export:

| Export | ~gzip |
|--------|-------|
| `sently` | ~6 KB |
| `sently/transports/smtp` | ~10 KB |
| `sently/transports/resend` | ~2 KB |
| `sently/transports/sendgrid` | ~2 KB |
| `sently/transports/postmark` | ~2 KB |
| `sently/transports/mailgun` | ~3 KB |
| `sently/transports/ses` | ~5 KB |
| `sently/transports/brevo` | ~2 KB |
| `sently/adapters/node` | ~3 KB |
| `sently/adapters/bun` | ~3 KB |
| `sently/adapters/deno` | ~2 KB |
| `sently/adapters/cf` | ~2 KB |

> **Example:** Resend only = core (~6 KB) + transport (~2 KB) = **~8 KB total**. Nodemailer ships 220 KB regardless of which transport you use.

---

## TypeScript

```typescript
import type {
  MailOptions,
  MailPlugin,
  SendResult,
  Attachment,
  SMTPConfig,
} from "sently";
```

All types ship with the package — no separate `@types/` install needed.

---

## Links

- **Source & issues:** [github.com/alialnaghmoush/sently](https://github.com/alialnaghmoush/sently)
- **npm:** [npmjs.com/package/sently](https://www.npmjs.com/package/sently)
- **JSR:** [jsr.io/@alialnaghmoush/sently](https://jsr.io/@alialnaghmoush/sently)

## License

MIT
