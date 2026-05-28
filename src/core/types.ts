// src/core/types.ts

// ─── Address ──────────────────────────────────────────────

/** A single email address with optional display name. */
export interface Address {
  name?: string;
  address: string;
}

/** Flexible address input accepted by mail APIs. */
export type AddressInput = string | Address | (string | Address)[];

// ─── Attachment ───────────────────────────────────────────

/** Email attachment (in-memory or file path on supported runtimes). */
export interface Attachment {
  filename: string;
  content?: Uint8Array | string;
  path?: string;
  contentType?: string;
  encoding?: "base64" | "7bit" | "8bit" | "binary" | "quoted-printable";
  contentId?: string;
  inline?: boolean;
  headers?: Record<string, string>;
}

// ─── Mail Options ─────────────────────────────────────────

/** Options for composing and sending an email message. */
export interface MailOptions {
  from: AddressInput;
  to: AddressInput;
  cc?: AddressInput;
  bcc?: AddressInput;
  replyTo?: AddressInput;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  messageId?: string;
  date?: Date;
  priority?: "high" | "normal" | "low";
  encoding?: "utf-8" | "ascii";
}

// ─── Send Result ──────────────────────────────────────────

/** Result returned after a message is accepted for delivery. */
export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
  envelope: Envelope;
}

// ─── Envelope ─────────────────────────────────────────────

/** SMTP envelope addresses (MAIL FROM / RCPT TO). */
export interface Envelope {
  from: string;
  to: string[];
}

// ─── Socket Adapter ───────────────────────────────────────

/** Runtime-specific TCP/TLS socket abstraction for SMTP. */
export interface SocketAdapter {
  connect(host: string, port: number): Promise<void>;
  startTLS(options?: TLSOptions): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  read(): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
  readonly secure: boolean;
  readonly connected: boolean;
}

// ─── TLS Options ──────────────────────────────────────────

/** TLS connection options for STARTTLS and direct TLS. */
export interface TLSOptions {
  rejectUnauthorized?: boolean;
  servername?: string;
}

// ─── Transport ────────────────────────────────────────────

/** Pluggable mail delivery backend (SMTP, HTTP API, etc.). */
export interface Transport {
  send(options: MailOptions): Promise<SendResult>;
  verify?(): Promise<boolean>;
  close?(): Promise<void>;
}

// ─── DKIM ─────────────────────────────────────────────────

/** DKIM signing configuration for outbound messages. */
export interface DKIMConfig {
  /** Your domain name. e.g. "example.com" */
  domainName: string;
  /** Key selector. e.g. "2024" → looks up 2024._domainkey.example.com */
  keySelector: string;
  /**
   * DKIM private key in PEM format.
   * Supports RSA (minimum 1024-bit, 2048 recommended) and Ed25519.
   */
  privateKey: string;
  /** Algorithm. Default: "rsa-sha256". Use "ed25519-sha256" for Ed25519 keys. */
  algorithm?: "rsa-sha256" | "ed25519-sha256";
  /**
   * Header fields to sign (colon-separated).
   * Default follows RFC 6376 §5.4 recommendations.
   */
  headerFieldNames?: string;
  /**
   * Skip signing these header fields even if listed in headerFieldNames.
   * Useful to exclude "message-id" and "date" for privacy.
   */
  skipFields?: string;
}

// ─── OAuth2 ───────────────────────────────────────────────

/** OAuth2 credentials for XOAUTH2 SMTP authentication. */
export interface OAuth2Config {
  /** The authenticated user's email address */
  user: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Refresh token for automatic access token renewal */
  refreshToken: string;
  /** Current access token (optional — will be fetched if absent) */
  accessToken?: string;
  /** Token endpoint URL. Default: Google's token endpoint */
  tokenUrl?: string;
  /**
   * Custom token provider function.
   * If provided, clientId / clientSecret / refreshToken are ignored.
   * The function must return a valid access token string.
   */
  getToken?: () => Promise<string>;
}

// ─── Pool Config ──────────────────────────────────────────

/** Connection pool and rate limiting options for SMTP. */
export interface PoolConfig {
  /** Use connection pooling. Default: false */
  pool?: boolean;
  /** Maximum number of simultaneous SMTP connections. Default: 5 */
  maxConnections?: number;
  /**
   * Maximum number of messages per connection before it is recycled.
   * Default: 100
   */
  maxMessages?: number;
  /**
   * Maximum send rate in messages per second across all connections.
   * Default: unlimited
   */
  rateDelta?: number;
  /**
   * The time window in milliseconds for rate limiting.
   * Default: 1000 (1 second)
   */
  rateLimit?: number;
}

// ─── SMTP Config ──────────────────────────────────────────

/** Configuration for SMTP transport and relay connections. */
export interface SMTPConfig extends PoolConfig {
  host: string;
  port?: number;
  secure?: boolean;
  auth?: SMTPAuth;
  tls?: TLSOptions;
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  direct?: boolean;
  adapter?: SocketAdapter;
  dkim?: DKIMConfig;
}

/** SMTP authentication credentials and method hint. */
export interface SMTPAuth {
  user: string;
  pass?: string;
  type?: "LOGIN" | "PLAIN" | "CRAM-MD5" | "OAUTH2";
  oauth2?: OAuth2Config;
}

// ─── Mailer ───────────────────────────────────────────────

/** High-level mailer API wrapping a transport. */
export interface Mailer {
  send(options: MailOptions): Promise<SendResult>;
  verify(): Promise<boolean>;
  close(): Promise<void>;
}

// ─── createMailer Options ─────────────────────────────────

/** Options for {@link createMailer} — custom transport or SMTP config. */
export type CreateMailerOptions = ({ transport: Transport } & Partial<SMTPConfig>) | SMTPConfig;

// ─── Runtime ──────────────────────────────────────────────

/** Detected JavaScript runtime environment. */
export type Runtime = "node" | "bun" | "deno" | "cf-workers" | "browser" | "unknown";
