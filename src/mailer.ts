/**
 * @module
 * Lightweight mailer factory for custom transports — no SMTP code in the bundle.
 *
 * Use this entry instead of `sently` when you pass a transport explicitly
 * (Resend, SendGrid, etc.) and want the smallest bundle size.
 *
 * @example
 * ```ts
 * import { createMailer } from "sently/mailer";
 * import { ResendTransport } from "sently/transports/resend";
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
import { runPlugins } from "./core/plugin.js";
import type {
  BulkSendOptions,
  BulkSendResult,
  Mailer,
  MailOptions,
  MailPlugin,
  SendResult,
  Transport,
  TransportMailerOptions,
  VerifyResult,
} from "./core/types.js";

export type { TransportMailerOptions };

/**
 * Create a mailer that wraps a custom {@link Transport} (HTTP API, preview, retry, etc.).
 */
export async function createMailer(options: TransportMailerOptions): Promise<Mailer> {
  return new MailerImpl(options.transport, options.plugins ?? []);
}

/** Internal mailer implementation shared with the full `sently` entry. */
export class MailerImpl implements Mailer {
  constructor(
    private readonly transport: Transport,
    private readonly plugins: MailPlugin[] = [],
  ) {}

  async send(options: MailOptions): Promise<SendResult> {
    const processed = await runPlugins(options, this.plugins);
    return this.transport.send(processed);
  }

  async sendBulk(messages: MailOptions[], options?: BulkSendOptions): Promise<BulkSendResult> {
    const concurrency = options?.concurrency ?? 1;
    const results: BulkSendResult["results"] = new Array(messages.length);
    const queue = [...messages.entries()];
    let active = 0;

    await new Promise<void>((resolve) => {
      if (messages.length === 0) {
        resolve();
        return;
      }

      const maybeDone = (): void => {
        if (queue.length === 0 && active === 0) {
          resolve();
        }
      };

      const processNext = (): void => {
        if (queue.length === 0) {
          maybeDone();
          return;
        }

        const entry = queue.shift();
        if (entry === undefined) {
          maybeDone();
          return;
        }

        const [index, message] = entry;
        active++;

        void this.send(message)
          .then((result) => {
            results[index] = { status: "sent", result };
            options?.onSuccess?.(message, index, result);
          })
          .catch((error: unknown) => {
            results[index] = { status: "failed", error };
            options?.onError?.(message, index, error);
          })
          .finally(() => {
            active--;
            processNext();
            maybeDone();
          });
      };

      for (let i = 0; i < concurrency; i++) {
        processNext();
      }
    });

    let sent = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "sent") {
        sent++;
      } else {
        failed++;
      }
    }

    return {
      total: messages.length,
      sent,
      failed,
      results,
    };
  }

  verify(): Promise<VerifyResult> {
    if (this.transport.verify) {
      return this.transport.verify();
    }
    return Promise.resolve({ ok: true, provider: "mailer" });
  }

  close(): Promise<void> {
    if (this.transport.close) {
      return this.transport.close();
    }
    return Promise.resolve();
  }
}
