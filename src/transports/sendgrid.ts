/**
 * @module
 * SendGrid v3 HTTP API transport for sending email via api.sendgrid.com.
 *
 * @example
 * ```ts
 * import { SendGridTransport } from "sently/transports/sendgrid";
 * import { createMailer } from "sently";
 *
 * const mailer = await createMailer({
 *   transport: new SendGridTransport({ apiKey: process.env.SENDGRID_API_KEY! }),
 * });
 *
 * await mailer.send({
 *   from: "sender@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello",
 *   text: "Plain text body",
 * });
 * ```
 */
import { extractEmails, parseAddresses } from "../core/address.js";
import { encodeBase64 } from "../core/base64.js";
import type { MailOptions, SendResult, Transport, VerifyResult } from "../core/types.js";
import { resolveAttachments } from "./resolve-attachments.js";

/** SendGrid API configuration. */
export interface SendGridConfig {
  /** SendGrid API key (Bearer token). */
  apiKey: string;
}

/** Error thrown when the SendGrid API returns a non-success response. */
export class SendGridError extends Error {
  /** Creates a SendGrid API error with status code and response payload. */
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly apiError: unknown,
  ) {
    super(message);
    this.name = "SendGridError";
  }
}

/**
 * SendGrid v3 HTTP API transport.
 */
export class SendGridTransport implements Transport {
  private readonly apiKey: string;

  /** Creates a SendGrid transport with the given API key. */
  constructor(config: SendGridConfig) {
    this.apiKey = config.apiKey;
  }

  /** Sends an email via the SendGrid v3 HTTP API. */
  async send(options: MailOptions): Promise<SendResult> {
    const attachments = await resolveAttachments(options.attachments);
    const from = parseAddresses(options.from)[0];

    const personalization = {
      to: parseAddresses(options.to).map((addr) => ({ email: addr.address, name: addr.name })),
      ...(options.cc
        ? {
            cc: parseAddresses(options.cc).map((addr) => ({
              email: addr.address,
              name: addr.name,
            })),
          }
        : {}),
      ...(options.bcc
        ? {
            bcc: parseAddresses(options.bcc).map((addr) => ({
              email: addr.address,
              name: addr.name,
            })),
          }
        : {}),
    };

    const body = {
      personalizations: [personalization],
      from: from
        ? { email: from.address, ...(from.name ? { name: from.name } : {}) }
        : { email: "" },
      subject: options.subject,
      ...(options.replyTo
        ? {
            reply_to: parseAddresses(options.replyTo).map((addr) => ({
              email: addr.address,
              name: addr.name,
            }))[0],
          }
        : {}),
      content: [
        ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
        ...(options.html ? [{ type: "text/html", value: options.html }] : []),
      ],
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((att) => ({
              filename: att.filename,
              type: att.contentType ?? "application/octet-stream",
              content:
                att.content instanceof Uint8Array
                  ? encodeBase64(att.content).replace(/\r\n/g, "")
                  : att.content,
              ...(att.contentId ? { content_id: att.contentId } : {}),
              disposition: att.inline ? "inline" : "attachment",
            })),
          }
        : {}),
    };

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const apiError = await response.text();
      throw new SendGridError("SendGrid API error", response.status, apiError);
    }

    const messageId = response.headers.get("x-message-id") ?? options.messageId ?? "";

    return {
      messageId,
      accepted: extractEmails(options.to),
      rejected: [],
      response: "Accepted",
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

  /** Verifies the SendGrid API key by fetching the user profile. */
  async verify(): Promise<VerifyResult> {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/user/profile", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const apiError = await response.text().catch(() => "");
        return {
          ok: false,
          provider: "sendgrid",
          message: apiError || `HTTP ${response.status}`,
        };
      }

      const payload = (await response.json()) as { username?: string };
      return {
        ok: true,
        provider: "sendgrid",
        ...(payload.username ? { message: payload.username } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        provider: "sendgrid",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
