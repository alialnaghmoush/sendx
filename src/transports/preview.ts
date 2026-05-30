/**
 * @module
 * PreviewTransport — development transport that writes emails to disk
 * instead of sending them. Optionally opens in the default browser.
 * Use in place of a real transport during local development.
 *
 * @example
 * ```ts
 * import { PreviewTransport } from 'sently/transports/preview'
 * const transport = new PreviewTransport({ outDir: './.emails', open: true })
 * ```
 */
import { extractEmails } from "../core/address.js";
import { buildMIME } from "../core/mime.js";
import type {
  MailOptions,
  PreviewConfig,
  SendResult,
  Transport,
  VerifyResult,
} from "../core/types.js";
import { resolveAttachments } from "./resolve-attachments.js";

function sanitizeSubject(subject: string): string {
  const sanitized = subject.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return sanitized.slice(0, 40) || "no-subject";
}

function getOpenCommand(platform: string): string {
  if (platform === "darwin") {
    return "open";
  }
  if (platform === "win32") {
    return "start";
  }
  return "xdg-open";
}

/**
 * Development transport that writes emails to disk instead of sending them.
 */
export class PreviewTransport implements Transport {
  /** Directory where preview `.eml` or `.html` files are written. */
  private readonly outDir: string;
  /** Whether to open the written file in the default browser. */
  private readonly open: boolean;
  /** Output format: full MIME (`.eml`) or HTML body only. */
  private readonly format: "eml" | "html";

  /** Creates a preview transport with optional output directory and format. */
  constructor(config?: PreviewConfig) {
    this.outDir = config?.outDir ?? "./.emails";
    this.open = config?.open ?? false;
    this.format = config?.format ?? "eml";
  }

  /** Writes the message to disk and returns a synthetic SendResult. */
  async send(options: MailOptions): Promise<SendResult> {
    const attachments = await resolveAttachments(options.attachments);
    const resolvedOptions = { ...options, attachments };
    const mime = await buildMIME(resolvedOptions);

    const fs = await import("node:fs/promises");
    await fs.mkdir(this.outDir, { recursive: true });

    const filename = `${Date.now()}-${sanitizeSubject(options.subject)}.${this.format}`;
    const filepath = `${this.outDir}/${filename}`;

    if (this.format === "html") {
      const html =
        options.html ??
        (options.text
          ? `<pre>${options.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`
          : "");
      await fs.writeFile(filepath, html, "utf8");
    } else {
      await fs.writeFile(filepath, mime.raw);
    }

    console.log(`[sently preview] Written: ${filepath}`);

    if (this.open) {
      const { spawn } = await import("node:child_process");
      const command = getOpenCommand(process.platform);
      spawn(command, [filepath], { detached: true, stdio: "ignore" }).unref();
    }

    return {
      messageId: mime.messageId,
      accepted: extractEmails(options.to),
      rejected: [],
      response: `preview: ${filepath}`,
      envelope: mime.envelope,
    };
  }

  /** Always succeeds — preview transport requires no external connectivity. */
  async verify(): Promise<VerifyResult> {
    return { ok: true, provider: "preview" };
  }
}
