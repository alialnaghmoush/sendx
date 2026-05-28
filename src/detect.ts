// src/detect.ts
import type {
  CreateMailerOptions,
  Mailer,
  MailOptions,
  Runtime,
  SendResult,
  SMTPConfig,
  SocketAdapter,
  Transport,
} from "./core/types.js";
import { SMTPPool } from "./pool/pool.js";
import { SMTPTransport } from "./transports/smtp.js";

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
 */
export async function createMailer(options: CreateMailerOptions): Promise<Mailer> {
  if ("transport" in options) {
    return new MailerImpl(options.transport);
  }

  const smtpConfig = options as SMTPConfig;

  if (smtpConfig.pool) {
    return new MailerImpl(
      new SMTPPool(smtpConfig, {
        createAdapter: async () =>
          smtpConfig.adapter ??
          (await createDefaultAdapter({
            ...(smtpConfig.secure !== undefined ? { secure: smtpConfig.secure } : {}),
            ...(smtpConfig.connectionTimeout !== undefined
              ? { connectionTimeout: smtpConfig.connectionTimeout }
              : {}),
          })),
      }),
    );
  }

  const adapter =
    smtpConfig.adapter ??
    (await createDefaultAdapter({
      ...(smtpConfig.secure !== undefined ? { secure: smtpConfig.secure } : {}),
      ...(smtpConfig.connectionTimeout !== undefined
        ? { connectionTimeout: smtpConfig.connectionTimeout }
        : {}),
    }));

  return new MailerImpl(new SMTPTransport({ ...smtpConfig, adapter }));
}

class MailerImpl implements Mailer {
  constructor(private readonly transport: Transport) {}

  send(options: MailOptions): Promise<SendResult> {
    return this.transport.send(options);
  }

  verify(): Promise<boolean> {
    if (this.transport.verify) {
      return this.transport.verify();
    }
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    if (this.transport.close) {
      return this.transport.close();
    }
    return Promise.resolve();
  }
}

declare const Bun: unknown;
declare const Deno: unknown;
