/**
 * @module
 * SMTP connection pool with optional rate limiting.
 *
 * @example
 * ```ts
 * import { SMTPPool } from "sently/pool";
 * import { NodeAdapter } from "sently/adapters/node";
 *
 * const pool = new SMTPPool({
 *   host: "smtp.example.com",
 *   auth: { user: "you@example.com", pass: "secret" },
 *   adapter: new NodeAdapter(),
 *   pool: true,
 *   maxConnections: 5,
 * });
 *
 * await pool.send({
 *   from: "you@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello",
 *   text: "Pooled send",
 * });
 * ```
 */
import type {
  MailOptions,
  PoolConfig,
  SendResult,
  SMTPConfig,
  SocketAdapter,
  Transport,
  VerifyResult,
} from "../core/types.js";
import { resolveSMTPConfig } from "../transports/smtp.js";
import { createPooledConnection, type PooledConnection } from "./connection.js";

/** Options for {@link SMTPPool}. */
export interface SMTPPoolOptions {
  /** Factory for a new socket adapter per pooled connection. */
  createAdapter?: () => Promise<SocketAdapter> | SocketAdapter;
  /** Injectable clock for rate limiting (testing). */
  now?: () => number;
}

interface QueueEntry {
  options: MailOptions;
  resolve: (result: SendResult) => void;
  reject: (error: unknown) => void;
}

/**
 * Token bucket rate limiter with lazy refill on acquire.
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly rateDelta: number,
    private readonly rateLimit: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = rateDelta;
    this.lastRefill = now();
  }

  /** Wait until a token is available, then consume one. */
  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens > 0) {
        this.tokens -= 1;
        return;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  /** Wake waiters after the clock advances (for testing). */
  notify(): void {
    this.refill();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = t - this.lastRefill;
    if (elapsed >= this.rateLimit) {
      const periods = Math.floor(elapsed / this.rateLimit);
      this.tokens = Math.min(this.rateDelta, this.tokens + periods * this.rateDelta);
      this.lastRefill += periods * this.rateLimit;
      while (this.tokens > 0 && this.waiters.length > 0) {
        this.tokens -= 1;
        const next = this.waiters.shift();
        next?.();
      }
    }
  }
}

/**
 * SMTP connection pool with optional rate limiting.
 */
export class SMTPPool implements Transport {
  private readonly config: SMTPConfig & PoolConfig;
  private readonly maxConnections: number;
  private readonly maxMessages: number;
  private readonly createAdapterFn: () => Promise<SocketAdapter>;
  private readonly rateLimiter: RateLimiter | null;
  private readonly connections: PooledConnection[] = [];
  private readonly queue: QueueEntry[] = [];
  private draining = false;
  private closed = false;
  private processChain: Promise<void> = Promise.resolve();

  /** Creates an SMTP connection pool. */
  constructor(config: SMTPConfig & PoolConfig, options?: SMTPPoolOptions) {
    this.config = config;
    this.maxConnections = config.maxConnections ?? 5;
    this.maxMessages = config.maxMessages ?? 100;

    if (options?.createAdapter) {
      const factory = options.createAdapter;
      this.createAdapterFn = async () => factory();
    } else if (config.adapter) {
      this.createAdapterFn = async () => config.adapter as SocketAdapter;
    } else {
      throw new Error("SMTPPool requires config.adapter or options.createAdapter");
    }

    if (config.rateDelta !== undefined && config.rateDelta > 0) {
      this.rateLimiter = new RateLimiter(config.rateDelta, config.rateLimit ?? 1000, options?.now);
    } else {
      this.rateLimiter = null;
    }
  }

  /** Sends a message through the pool. */
  async send(options: MailOptions): Promise<SendResult> {
    if (this.draining) {
      throw new Error("SMTPPool is closing — no new messages accepted");
    }
    if (this.closed) {
      throw new Error("SMTPPool is closed");
    }
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }
    return new Promise<SendResult>((resolve, reject) => {
      this.queue.push({ options, resolve, reject });
      this.scheduleProcess();
    });
  }

  private scheduleProcess(): void {
    this.processChain = this.processChain.then(() => this.processQueue()).catch(() => undefined);
  }

  /** Verifies connectivity using a temporary connection. */
  async verify(): Promise<VerifyResult> {
    try {
      const conn = await this.spawnConnection();
      try {
        return { ok: true, provider: "smtp-pool" };
      } finally {
        await conn.close();
        this.removeConnection(conn);
      }
    } catch (err) {
      return {
        ok: false,
        provider: "smtp-pool",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Drains the queue and closes all connections. */
  async close(): Promise<void> {
    this.draining = true;
    await this.drainQueue();
    await Promise.allSettled(this.connections.map((c) => c.close()));
    this.connections.length = 0;
    this.closed = true;
  }

  /** Current number of open pooled connections. */
  get connectionCount(): number {
    return this.connections.length;
  }

  /** Number of messages waiting in the send queue. */
  get queueSize(): number {
    return this.queue.length;
  }

  private async processQueue(): Promise<void> {
    if (this.draining) {
      return;
    }

    while (this.queue.length > 0) {
      const idleConn = this.connections.find((c) => c.idle && c.usable);
      if (idleConn) {
        const entry = this.queue.shift();
        if (!entry) {
          break;
        }
        try {
          const result = await idleConn.send(entry.options);
          entry.resolve(result);
          if (!idleConn.usable) {
            await idleConn.close();
            this.removeConnection(idleConn);
          }
        } catch (err) {
          entry.reject(err);
          await idleConn.close().catch(() => undefined);
          this.removeConnection(idleConn);
        }
        continue;
      }

      if (this.connections.length < this.maxConnections) {
        const entry = this.queue.shift();
        if (!entry) {
          break;
        }
        const conn = await this.spawnConnection();
        try {
          const result = await conn.send(entry.options);
          entry.resolve(result);
          if (!conn.usable) {
            await conn.close();
            this.removeConnection(conn);
          }
        } catch (err) {
          entry.reject(err);
          await conn.close().catch(() => undefined);
          this.removeConnection(conn);
        }
        continue;
      }

      break;
    }
  }

  private async spawnConnection(): Promise<PooledConnection> {
    const resolved = resolveSMTPConfig(this.config);
    const conn = await createPooledConnection({
      config: this.config,
      maxMessages: this.maxMessages,
      connectHost: resolved.host,
      createAdapter: this.createAdapterFn,
    });
    this.connections.push(conn);
    return conn;
  }

  private removeConnection(conn: PooledConnection): void {
    const index = this.connections.indexOf(conn);
    if (index >= 0) {
      this.connections.splice(index, 1);
    }
  }

  private async drainQueue(): Promise<void> {
    while (this.queue.length > 0 || this.connections.some((c) => !c.idle)) {
      await this.processQueue();
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }
}

/** @internal Exposed for deterministic rate limiter tests. */
export { RateLimiter };
