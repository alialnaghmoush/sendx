/**
 * @module
 * Main sendx entrypoint — runtime detection, mailer factory, and shared types.
 *
 * @example
 * ```ts
 * import { createMailer } from "@alialnaghmoush/sendx";
 *
 * const mailer = await createMailer({
 *   host: "smtp.example.com",
 *   auth: { user: "you@example.com", pass: "secret" },
 * });
 *
 * await mailer.send({
 *   from: "you@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello",
 *   text: "Plain text body",
 * });
 * ```
 */

export { GOOGLE_TOKEN_URL, MICROSOFT_TOKEN_URL, OAuth2Client } from "./auth/oauth2.js";
export { SMTPError } from "./core/smtp.js";
export type {
  Address,
  AddressInput,
  Attachment,
  CreateMailerOptions,
  DKIMConfig,
  Envelope,
  Mailer,
  MailOptions,
  OAuth2Config,
  PoolConfig,
  Runtime,
  SendResult,
  SMTPAuth,
  SMTPConfig,
  SocketAdapter,
  TLSOptions,
  Transport,
} from "./core/types.js";
export { createMailer, detectRuntime } from "./detect.js";
export { SMTPPool } from "./pool/pool.js";
