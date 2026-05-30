/**
 * @module
 * Bun socket adapter for SMTP connections via the Node.js compatibility layer.
 *
 * @example
 * ```ts
 * import { BunAdapter } from "sently/adapters/bun";
 * import { createMailer } from "sently";
 *
 * const mailer = await createMailer({
 *   host: "smtp.example.com",
 *   adapter: new BunAdapter(),
 *   auth: { user: "you@example.com", pass: "secret" },
 * });
 * ```
 */
import net from "node:net";
import tls from "node:tls";
import type { SocketAdapter, TLSOptions } from "../core/types.js";

function warnRejectUnauthorizedDisabled(tls: TLSOptions): void {
  if (tls.rejectUnauthorized === false) {
    console.warn(
      "[sently] TLS certificate verification is disabled. " +
        "Never use rejectUnauthorized: false in production.",
    );
  }
}

declare const Bun: { version: string } | undefined;

/** Configuration options for {@link BunAdapter}. */
export interface BunAdapterOptions {
  /** Use implicit TLS on connect (port 465). Default: false. */
  secure?: boolean;
  /** Socket connect timeout in milliseconds. Default: 30_000. */
  connectionTimeout?: number;
  /** TLS options passed to node:tls (Bun Node compat layer). */
  tls?: TLSOptions;
}

/**
 * Bun socket adapter using node:net and node:tls (Node compat layer).
 */
export class BunAdapter implements SocketAdapter {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private _secure: boolean;
  private _connected = false;
  private readonly connectionTimeout: number;
  private readonly tlsOptions: TLSOptions;

  /** Creates a Bun socket adapter (requires the Bun runtime). */
  constructor(options: BunAdapterOptions = {}) {
    if (typeof Bun === "undefined") {
      throw new Error("BunAdapter requires the Bun runtime");
    }
    this._secure = options.secure ?? false;
    this.connectionTimeout = options.connectionTimeout ?? 30_000;
    this.tlsOptions = options.tls ?? {};
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
    if (this._secure) {
      await this.connectTls(host, port);
    } else {
      await this.connectPlain(host, port);
    }
    this._connected = true;
  }

  /** Upgrades a plain connection to TLS via STARTTLS. */
  async startTLS(options?: TLSOptions): Promise<void> {
    if (!this.socket || this._secure) {
      throw new Error("Cannot STARTTLS: no plain socket available");
    }

    const plain = this.socket;
    const merged = { ...this.tlsOptions, ...options };
    warnRejectUnauthorizedDisabled(merged);

    await new Promise<void>((resolve, reject) => {
      const tlsSocket = tls.connect({
        socket: plain,
        servername: merged.servername,
        rejectUnauthorized: merged.rejectUnauthorized ?? true,
        minVersion: merged.minVersion,
      });

      tlsSocket.once("secureConnect", () => {
        this.socket = tlsSocket;
        this._secure = true;
        resolve();
      });
      tlsSocket.once("error", reject);
    });
  }

  /** Writes raw bytes to the socket. */
  async write(data: Uint8Array): Promise<void> {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }

    await new Promise<void>((resolve, reject) => {
      this.socket?.write(Buffer.from(data), (err: Error | null | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Reads incoming socket data as an async iterable of byte chunks. */
  async *read(): AsyncGenerator<Uint8Array, void, unknown> {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }

    const socket = this.socket;
    const queue: Uint8Array[] = [];
    let resolveNext: ((value: IteratorResult<Uint8Array>) => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const onData = (chunk: Buffer): void => {
      const data = new Uint8Array(chunk);
      if (resolveNext) {
        resolveNext({ value: data, done: false });
        resolveNext = null;
      } else {
        queue.push(data);
      }
    };

    const onError = (err: Error): void => {
      error = err;
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as Uint8Array, done: true });
        resolveNext = null;
      }
    };

    const onClose = (): void => {
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as Uint8Array, done: true });
        resolveNext = null;
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);

    try {
      while (!done || queue.length > 0) {
        if (error) {
          throw error;
        }
        if (queue.length > 0) {
          yield queue.shift() as Uint8Array;
          continue;
        }
        if (done) {
          break;
        }
        const chunk = await new Promise<IteratorResult<Uint8Array>>((resolve) => {
          resolveNext = resolve;
        });
        if (chunk.done) {
          break;
        }
        yield chunk.value;
      }
    } finally {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }
  }

  /** Closes the socket connection. */
  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.socket?.end(() => resolve());
    });
    this.socket = null;
    this._connected = false;
  }

  private connectPlain(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port }, () => resolve());
      socket.setTimeout(this.connectionTimeout);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("Connection timeout"));
      });
      socket.once("error", reject);
      this.socket = socket;
    });
  }

  private connectTls(host: string, port: number): Promise<void> {
    warnRejectUnauthorizedDisabled(this.tlsOptions);
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: this.tlsOptions.servername ?? host,
          rejectUnauthorized: this.tlsOptions.rejectUnauthorized ?? true,
          minVersion: this.tlsOptions.minVersion,
        },
        () => resolve(),
      );
      socket.setTimeout(this.connectionTimeout);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("Connection timeout"));
      });
      socket.once("error", reject);
      this.socket = socket;
    });
  }
}
