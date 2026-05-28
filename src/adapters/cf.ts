/**
 * @module
 * Cloudflare Workers socket adapter for SMTP via cloudflare:sockets.
 *
 * @example
 * ```ts
 * import { CloudflareAdapter } from "@alialnaghmoush/sendx/adapters/cf";
 * import { createMailer } from "@alialnaghmoush/sendx";
 *
 * const mailer = await createMailer({
 *   host: "smtp.example.com",
 *   adapter: new CloudflareAdapter(),
 *   auth: { user: "relay@example.com", pass: "secret" },
 * });
 * ```
 */
import type { SocketAdapter, TLSOptions } from "../core/types.js";

interface CFSocket {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly closed: Promise<void>;
  close(): Promise<void>;
  startTls(): CFSocket;
}

type CFConnect = (
  address: { hostname: string; port: number },
  options?: { secureTransport?: "off" | "on" | "starttls"; allowHalfOpen?: boolean },
) => CFSocket;

/** Configuration options for {@link CloudflareAdapter}. */
export interface CloudflareAdapterOptions {
  secure?: boolean;
  starttls?: boolean;
  tls?: TLSOptions;
}

/**
 * Cloudflare Workers socket adapter via cloudflare:sockets.
 *
 * Limitations:
 * - No connection pooling (isolate lifecycle)
 * - No file system access for attachment.path
 * - No DNS MX lookup — explicit SMTP relay host required
 */
export class CloudflareAdapter implements SocketAdapter {
  private socket: CFSocket | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private _secure: boolean;
  private _connected = false;
  private readonly directTls: boolean;
  private readonly starttls: boolean;

  /** Creates a Cloudflare Workers socket adapter. */
  constructor(options: CloudflareAdapterOptions = {}) {
    this._secure = options.secure ?? false;
    this.directTls = options.secure ?? false;
    this.starttls = options.starttls ?? !this.directTls;
  }

  /** Whether the connection uses TLS. */
  get secure(): boolean {
    return this._secure;
  }

  /** Whether the socket is currently connected. */
  get connected(): boolean {
    return this._connected;
  }

  /** Opens a TCP or TLS connection to the given host and port. */
  async connect(host: string, port: number): Promise<void> {
    const { connect } = (await import("cloudflare:sockets")) as { connect: CFConnect };

    const secureTransport = this.directTls ? "on" : this.starttls ? "starttls" : "off";
    this.socket = connect({ hostname: host, port }, { secureTransport });
    this.writer = this.socket.writable.getWriter();
    this._connected = true;
    this._secure = secureTransport === "on";
  }

  /** Upgrades a plain connection to TLS via STARTTLS. */
  async startTLS(_options?: TLSOptions): Promise<void> {
    if (!this.socket || this._secure) {
      throw new Error("Cannot STARTTLS: no plain socket available");
    }

    await this.writer?.close();
    this.socket = this.socket.startTls();
    this.writer = this.socket.writable.getWriter();
    this._secure = true;
  }

  /** Writes raw bytes to the socket. */
  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error("Socket not connected");
    }
    await this.writer.write(data);
  }

  /** Reads incoming socket data as an async iterable of byte chunks. */
  async *read(): AsyncGenerator<Uint8Array, void, unknown> {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }

    const reader = this.socket.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Closes the socket connection. */
  async close(): Promise<void> {
    await this.writer?.close();
    await this.socket?.close();
    this.writer = null;
    this.socket = null;
    this._connected = false;
  }
}
