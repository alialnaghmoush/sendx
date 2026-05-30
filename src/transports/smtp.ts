/**
 * @module
 * SMTP transport — orchestrates socket adapter, MIME builder, and protocol logic.
 *
 * @example
 * ```ts
 * import { SMTPTransport } from "sently/transports/smtp";
 * import { NodeAdapter } from "sently/adapters/node";
 * import { createMailer } from "sently";
 *
 * const mailer = await createMailer({
 *   transport: new SMTPTransport({
 *     host: "smtp.example.com",
 *     auth: { user: "you@example.com", pass: "secret" },
 *     adapter: new NodeAdapter(),
 *   }),
 * });
 * ```
 */
import { OAuth2Client } from "../auth/oauth2.js";
import { buildMIME, type MIMEBuildResult } from "../core/mime.js";
import type { SMTPResponse } from "../core/smtp.js";
import {
  accumulateResponse,
  assertResponse,
  computeCRAMMD5,
  encodeAuthLoginPass,
  encodeAuthLoginUser,
  encodeCommand,
  encodeLine,
  parseEHLO,
  parseResponse,
  SMTPError,
  selectAuthMethod,
} from "../core/smtp.js";
import type {
  MailOptions,
  SendResult,
  SMTPConfig,
  SocketAdapter,
  Transport,
  VerifyResult,
} from "../core/types.js";
import { resolveAttachments } from "./resolve-attachments.js";

/**
 * SMTP transport orchestrating adapter, MIME builder, and protocol logic.
 */
export class SMTPTransport implements Transport {
  private readonly config: ResolvedSMTPConfig;
  private adapter: SocketAdapter | null = null;

  /** Creates an SMTP transport with the given configuration. */
  constructor(config: SMTPConfig) {
    this.config = resolveSMTPConfig(config);
  }

  /** Sends an email via SMTP using the configured adapter. */
  async send(options: MailOptions): Promise<SendResult> {
    const resolvedOptions = {
      ...options,
      attachments: await resolveAttachments(options.attachments),
    };
    const mime = await buildMIME(resolvedOptions, this.config.dkim);
    const adapter = await this.getAdapter();

    const host = this.config.direct
      ? await resolveMX(mime.envelope.from.split("@")[1] ?? this.config.host)
      : this.config.host;

    await adapter.connect(host, this.config.port);
    this.adapter = adapter;

    try {
      await openSMTPSession(adapter, this.config);
      return await deliverSMTPMessage(adapter, mime);
    } finally {
      await closeSMTPSession(adapter);
      this.adapter = null;
    }
  }

  /** Verifies SMTP connectivity and authentication without sending mail. */
  async verify(): Promise<VerifyResult> {
    try {
      const adapter = await this.getAdapter();
      await adapter.connect(this.config.host, this.config.port);

      try {
        await openSMTPSession(adapter, this.config);
        return { ok: true, provider: "smtp" };
      } finally {
        await closeSMTPSession(adapter);
      }
    } catch (err) {
      return {
        ok: false,
        provider: "smtp",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Closes the underlying socket adapter if connected. */
  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = null;
    }
  }

  private async getAdapter(): Promise<SocketAdapter> {
    if (!this.config.adapter) {
      throw new SMTPError("No socket adapter configured", 0, "CONNECT", "");
    }
    return this.config.adapter;
  }
}

/** Resolved SMTP transport configuration with defaults applied. */
export interface ResolvedSMTPConfig {
  /** SMTP server hostname. */
  host: string;
  /** SMTP port with secure/default applied. */
  port: number;
  /** Whether implicit TLS is used. */
  secure: boolean;
  /** Resolved authentication credentials, if any. */
  auth?: SMTPConfig["auth"];
  /** Whether AUTH requires an encrypted connection. */
  requireTLS?: boolean;
  /** TLS options for STARTTLS and direct TLS. */
  tls?: SMTPConfig["tls"];
  /** DKIM signing configuration. */
  dkim?: SMTPConfig["dkim"];
  /** Socket connect timeout in milliseconds. */
  connectionTimeout?: number;
  /** Timeout waiting for the SMTP greeting in milliseconds. */
  greetingTimeout?: number;
  /** Idle socket timeout in milliseconds. */
  socketTimeout?: number;
  /** Direct-to-MX delivery mode. */
  direct?: boolean;
  /** Runtime socket adapter. */
  adapter?: SocketAdapter;
}

/** Apply defaults to SMTP configuration. */
export function resolveSMTPConfig(config: SMTPConfig): ResolvedSMTPConfig {
  const secure = config.secure ?? false;
  return {
    host: config.host,
    port: config.port ?? (secure ? 465 : 587),
    secure,
    ...(config.auth !== undefined ? { auth: config.auth } : {}),
    ...(config.requireTLS !== undefined ? { requireTLS: config.requireTLS } : {}),
    ...(config.dkim !== undefined ? { dkim: config.dkim } : {}),
    ...(config.tls !== undefined ? { tls: config.tls } : {}),
    ...(config.connectionTimeout !== undefined
      ? { connectionTimeout: config.connectionTimeout }
      : {}),
    ...(config.greetingTimeout !== undefined ? { greetingTimeout: config.greetingTimeout } : {}),
    ...(config.socketTimeout !== undefined ? { socketTimeout: config.socketTimeout } : {}),
    ...(config.direct !== undefined ? { direct: config.direct } : {}),
    ...(config.adapter !== undefined ? { adapter: config.adapter } : {}),
  };
}

/**
 * Connect greeting, EHLO, optional STARTTLS, and AUTH on an open adapter.
 */
export async function openSMTPSession(
  adapter: SocketAdapter,
  config: ResolvedSMTPConfig,
): Promise<void> {
  const greeting = await readSMTPResponse(adapter);
  assertResponse(greeting, [220], "greeting");

  let capabilities = await ehlo(adapter, config.host);
  const supportsStartTls = capabilities.some((cap) => cap.toUpperCase() === "STARTTLS");
  if (!config.secure && !adapter.secure && supportsStartTls) {
    await sendRaw(adapter, encodeCommand({ type: "STARTTLS" }));
    const starttlsResp = await readSMTPResponse(adapter);
    assertResponse(starttlsResp, [220], "STARTTLS");
    await adapter.startTLS(config.tls);
    capabilities = await ehlo(adapter, config.host);
  }

  if (config.auth) {
    const tlsRequired = config.requireTLS ?? true;
    const encrypted = adapter.secure || config.secure;
    if (tlsRequired && !encrypted) {
      throw new SMTPError(
        "Refusing to authenticate over unencrypted connection. " +
          "Set requireTLS: false to disable this check (not recommended).",
        0,
        "AUTH",
        "",
      );
    }
    await authenticate(adapter, config.auth, capabilities);
  }
}

/**
 * MAIL FROM, RCPT TO, and DATA for a built MIME message on an authenticated session.
 */
export async function deliverSMTPMessage(
  adapter: SocketAdapter,
  mime: MIMEBuildResult,
): Promise<SendResult> {
  await sendCommand(adapter, { type: "MAIL_FROM", address: mime.envelope.from });
  const mailResp = await readSMTPResponse(adapter);
  assertResponse(mailResp, [250], "MAIL FROM");

  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const recipient of mime.envelope.to) {
    await sendRaw(adapter, encodeCommand({ type: "RCPT_TO", address: recipient }));
    const rcptResp = await readSMTPResponse(adapter);
    if (rcptResp.isSuccess) {
      accepted.push(recipient);
    } else {
      rejected.push(recipient);
    }
  }

  await sendCommand(adapter, { type: "DATA" });
  const dataResp = await readSMTPResponse(adapter);
  assertResponse(dataResp, [354], "DATA");

  let finalResp: SMTPResponse;
  try {
    await sendRaw(adapter, encodeCommand({ type: "DATA_BODY", content: mime.raw }));
    finalResp = await readSMTPResponse(adapter);
  } catch (err) {
    await sendRaw(adapter, encodeCommand({ type: "DATA_BODY", content: mime.raw }));
    finalResp = await readSMTPResponse(adapter);
    if (finalResp.isError) {
      throw err;
    }
  }
  assertResponse(finalResp, [250], "DATA end");

  return {
    messageId: mime.messageId,
    accepted,
    rejected,
    response: finalResp.message,
    envelope: mime.envelope,
  };
}

/**
 * QUIT and close an SMTP session adapter.
 */
export async function closeSMTPSession(adapter: SocketAdapter): Promise<void> {
  try {
    await sendCommand(adapter, { type: "QUIT" });
    await readSMTPResponse(adapter);
  } catch {
    // ignore errors during shutdown
  } finally {
    await adapter.close();
  }
}

async function ehlo(adapter: SocketAdapter, host: string): Promise<string[]> {
  await sendCommand(adapter, { type: "EHLO", domain: host });
  const response = await readSMTPResponse(adapter);
  assertResponse(response, [250], "EHLO");
  return parseEHLO(response);
}

async function authenticate(
  adapter: SocketAdapter,
  auth: NonNullable<SMTPConfig["auth"]>,
  capabilities: string[],
): Promise<void> {
  if (auth.type === "OAUTH2" && auth.oauth2) {
    const client = new OAuth2Client(auth.oauth2);
    const xoauth2 = await client.buildXOAUTH2();
    await sendCommand(adapter, { type: "AUTH_XOAUTH2", xoauth2String: xoauth2 });
    let resp = await readSMTPResponse(adapter);
    if (resp.code === 334) {
      await sendRaw(adapter, encodeLine(""));
      resp = await readSMTPResponse(adapter);
    }
    assertResponse(resp, [235], "AUTH XOAUTH2");
    return;
  }

  const method = auth.type ?? selectAuthMethod(capabilities);

  if (method === "CRAM-MD5") {
    const pass = requirePassword(auth, "CRAM-MD5");
    await sendCommand(adapter, { type: "AUTH_CRAM_MD5_INIT" });
    let resp = await readSMTPResponse(adapter);
    assertResponse(resp, [334], "AUTH CRAM-MD5");
    const challenge = resp.message.trim();
    const response = await computeCRAMMD5(challenge, auth.user, pass);
    await sendCommand(adapter, { type: "AUTH_CRAM_MD5_RESPONSE", response });
    resp = await readSMTPResponse(adapter);
    assertResponse(resp, [235], "AUTH CRAM-MD5 response");
    return;
  }

  if (method === "PLAIN") {
    const pass = requirePassword(auth, "PLAIN");
    await sendRaw(adapter, encodeCommand({ type: "AUTH_PLAIN", user: auth.user, pass }));
    const resp = await readSMTPResponse(adapter);
    assertResponse(resp, [235], "AUTH PLAIN");
    return;
  }

  const pass = requirePassword(auth, "LOGIN");
  await sendRaw(adapter, encodeCommand({ type: "AUTH_LOGIN", user: auth.user, pass }));
  let resp = await readSMTPResponse(adapter);
  assertResponse(resp, [334], "AUTH LOGIN");

  await sendRaw(adapter, encodeAuthLoginUser(auth.user));
  resp = await readSMTPResponse(adapter);
  assertResponse(resp, [334], "AUTH LOGIN user");

  await sendRaw(adapter, encodeAuthLoginPass(pass));
  resp = await readSMTPResponse(adapter);
  assertResponse(resp, [235], "AUTH LOGIN pass");
}

function requirePassword(auth: NonNullable<SMTPConfig["auth"]>, method: string): string {
  if (!auth.pass) {
    throw new SMTPError(`Password required for ${method} authentication`, 0, `AUTH ${method}`, "");
  }
  return auth.pass;
}

async function sendCommand(
  adapter: SocketAdapter,
  command: Parameters<typeof encodeCommand>[0],
): Promise<void> {
  await sendRaw(adapter, encodeCommand(command));
}

async function sendRaw(adapter: SocketAdapter, data: Uint8Array): Promise<void> {
  await adapter.write(data);
}

/** Reads and parses a complete SMTP response from the adapter. */
async function readSMTPResponse(adapter: SocketAdapter): Promise<SMTPResponse> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of adapter.read()) {
    chunks.push(chunk);
    const complete = accumulateResponse(chunks);
    if (complete) {
      return parseResponse(complete);
    }
  }
  throw new SMTPError("Connection closed while reading SMTP response", 0, "READ", "");
}

async function resolveMX(domain: string): Promise<string> {
  const dns = await import("node:dns/promises");
  const records = await dns.resolveMx(domain);
  if (records.length === 0) {
    throw new SMTPError(`No MX records for ${domain}`, 0, "MX", "");
  }
  records.sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority);
  return records[0]?.exchange ?? domain;
}

/** @internal Test helper for raw line writes. */
export { encodeLine, readSMTPResponse };
