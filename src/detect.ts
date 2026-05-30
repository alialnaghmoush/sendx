// src/detect.ts
import type {
  CreateMailerOptions,
  Mailer,
  Runtime,
  SMTPConfig,
  SocketAdapter,
  TLSOptions,
} from "./core/types.js";
import { createMailer as createTransportMailer, MailerImpl } from "./mailer.js";

/** Detect the current JavaScript runtime. */
export function detectRuntime(): Runtime {
  if (typeof Bun !== "undefined") {
    return "bun";
  }
  if (typeof Deno !== "undefined") {
    return "deno";
  }
  if (typeof caches !== "undefined" && globalThis.navigator?.userAgent === "Cloudflare-Workers") {
    return "cf-workers";
  }
  if (typeof window !== "undefined") {
    return "browser";
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }
  return "unknown";
}

/**
 * Dynamically import and instantiate the correct adapter for the current runtime.
 */
export async function createDefaultAdapter(options?: {
  secure?: boolean;
  connectionTimeout?: number;
  tls?: TLSOptions;
}): Promise<SocketAdapter> {
  const runtime = detectRuntime();

  switch (runtime) {
    case "node": {
      const { NodeAdapter } = await import("./adapters/node.js");
      return new NodeAdapter(options);
    }
    case "bun": {
      const { BunAdapter } = await import("./adapters/bun.js");
      return new BunAdapter(options);
    }
    case "deno": {
      const { DenoAdapter } = await import("./adapters/deno.js");
      return new DenoAdapter(options);
    }
    case "cf-workers": {
      const { CloudflareAdapter } = await import("./adapters/cf.js");
      return new CloudflareAdapter(options);
    }
    default:
      throw new Error(`No socket adapter available for runtime: ${runtime}`);
  }
}

/**
 * Create a ready-to-use Mailer instance.
 *
 * For HTTP transports and smallest bundles, prefer `import { createMailer } from "sently/mailer"`.
 */
export async function createMailer(options: CreateMailerOptions): Promise<Mailer> {
  if ("transport" in options) {
    return createTransportMailer({
      transport: options.transport,
      ...(options.plugins !== undefined ? { plugins: options.plugins } : {}),
    });
  }

  const smtpConfig = options as SMTPConfig;
  const adapterOptions = {
    ...(smtpConfig.secure !== undefined ? { secure: smtpConfig.secure } : {}),
    ...(smtpConfig.connectionTimeout !== undefined
      ? { connectionTimeout: smtpConfig.connectionTimeout }
      : {}),
    ...(smtpConfig.tls !== undefined ? { tls: smtpConfig.tls } : {}),
  };

  if (smtpConfig.pool) {
    const { SMTPPool } = await import("./pool/pool.js");
    return new MailerImpl(
      new SMTPPool(smtpConfig, {
        createAdapter: async () =>
          smtpConfig.adapter ?? (await createDefaultAdapter(adapterOptions)),
      }),
      smtpConfig.plugins,
    );
  }

  const adapter = smtpConfig.adapter ?? (await createDefaultAdapter(adapterOptions));
  const { SMTPTransport } = await import("./transports/smtp.js");

  return new MailerImpl(new SMTPTransport({ ...smtpConfig, adapter }), smtpConfig.plugins);
}

declare const Bun: unknown;
declare const Deno: unknown;
