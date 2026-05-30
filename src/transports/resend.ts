/**
 * @module
 * Resend HTTP API transport for sending email via api.resend.com.
 *
 * @example
 * ```ts
 * import { ResendTransport } from "sently/transports/resend";
 * import { createMailer } from "sently";
 *
 * const mailer = await createMailer({
 *   transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
 * });
 *
 * await mailer.send({
 *   from: "onboarding@yourdomain.com",
 *   to: "recipient@example.com",
 *   subject: "Hello",
 *   html: "<p>Sent via Resend</p>",
 * });
 * ```
 */
import { extractEmails, parseAddresses, toMIMEHeader } from "../core/address.js";
import { encodeBase64 } from "../core/base64.js";
import type { MailOptions, SendResult, Transport, VerifyResult } from "../core/types.js";
import { resolveAttachments } from "./resolve-attachments.js";

/** Resend API configuration. */
export interface ResendConfig {
  /** Resend API key (starts with `re_`). */
  apiKey: string;
  /** API base URL. Default: `https://api.resend.com`. */
  baseUrl?: string;
}

/** Error thrown when the Resend API returns a non-success response. */
export class ResendError extends Error {
  /** Creates a Resend API error with status code and response payload. */
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly apiError: unknown,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

/**
 * Resend HTTP API transport.
 */
export class ResendTransport implements Transport {
  /** Resend API key for Bearer authentication. */
  private readonly apiKey: string;
  /** Resend API base URL. */
  private readonly baseUrl: string;

  /** Creates a Resend transport with the given API key. */
  constructor(config: ResendConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.resend.com";
  }

  /** Sends an email via the Resend HTTP API. */
  async send(options: MailOptions): Promise<SendResult> {
    const attachments = await resolveAttachments(options.attachments);
    const from = parseAddresses(options.from)[0];
    const body = {
      from: from ? toMIMEHeader(from) : "",
      to: extractEmails(options.to),
      subject: options.subject,
      ...(options.cc ? { cc: extractEmails(options.cc) } : {}),
      ...(options.bcc ? { bcc: extractEmails(options.bcc) } : {}),
      ...(options.replyTo ? { reply_to: extractEmails(options.replyTo) } : {}),
      ...(options.text ? { text: options.text } : {}),
      ...(options.html ? { html: options.html } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((att) => ({
              filename: att.filename,
              content:
                att.content instanceof Uint8Array
                  ? encodeBase64(att.content).replace(/\r\n/g, "")
                  : att.content,
              ...(att.contentType ? { content_type: att.contentType } : {}),
            })),
          }
        : {}),
    };

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      throw new ResendError(payload.message ?? "Resend API error", response.status, payload);
    }

    const accepted = extractEmails(options.to);
    return {
      messageId: payload.id ?? options.messageId ?? "",
      accepted,
      rejected: [],
      response: payload.message ?? "Email sent",
      envelope: {
        from: from?.address ?? "",
        to: [
          ...extractEmails(options.to),
          ...(options.cc ? extractEmails(options.cc) : []),
          ...(options.bcc ? extractEmails(options.bcc) : []),
        ],
      },
    };
  }

  /** Verifies the Resend API key by listing domains. */
  async verify(): Promise<VerifyResult> {
    try {
      const response = await fetch(`${this.baseUrl}/domains`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        return {
          ok: false,
          provider: "resend",
          message: payload.message ?? `HTTP ${response.status}`,
        };
      }

      return { ok: true, provider: "resend", message: "API key is valid" };
    } catch (err) {
      return {
        ok: false,
        provider: "resend",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
