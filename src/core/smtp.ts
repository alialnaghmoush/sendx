// src/core/smtp.ts
import { encodeBase64, encodeUtf8 } from "./base64.js";

export { computeCRAMMD5 } from "./cram-md5.js";

/** SMTP command to send to the server. */
export type SMTPCommand =
  | { type: "EHLO"; domain: string }
  | { type: "STARTTLS" }
  | { type: "AUTH_LOGIN"; user: string; pass: string }
  | { type: "AUTH_PLAIN"; user: string; pass: string }
  | { type: "AUTH_CRAM_MD5_INIT" }
  | { type: "AUTH_CRAM_MD5_RESPONSE"; response: string }
  | { type: "AUTH_XOAUTH2"; xoauth2String: string }
  | { type: "MAIL_FROM"; address: string }
  | { type: "RCPT_TO"; address: string }
  | { type: "DATA" }
  | { type: "DATA_BODY"; content: Uint8Array }
  | { type: "QUIT" }
  | { type: "RSET" }
  | { type: "NOOP" };

/** Parsed SMTP server response. */
export interface SMTPResponse {
  /** Three-digit SMTP status code. */
  code: number;
  /** Human-readable response text after the status code. */
  message: string;
  /** True when the code is in the 2xx success range. */
  isSuccess: boolean;
  /** True when the code is 354 (ready for message data). */
  isReady: boolean;
  /** True when the code is 4xx or 5xx. */
  isError: boolean;
}

/** SMTP protocol error with server response details. */
export class SMTPError extends Error {
  /** Creates an SMTP protocol error. */
  constructor(
    message: string,
    public readonly code: number,
    public readonly command: string,
    public readonly response: string,
  ) {
    super(message);
    this.name = "SMTPError";
  }
}

/**
 * Encode an SMTPCommand into a Uint8Array for sending over the socket.
 */
export function encodeCommand(cmd: SMTPCommand): Uint8Array {
  let line: string;

  switch (cmd.type) {
    case "EHLO": {
      const safeDomain = cmd.domain.replace(/[\r\n]/g, "");
      line = `EHLO ${safeDomain}`;
      break;
    }
    case "STARTTLS":
      line = "STARTTLS";
      break;
    case "AUTH_LOGIN":
      line = "AUTH LOGIN";
      break;
    case "AUTH_PLAIN":
      line = `AUTH PLAIN ${encodeBase64(`\0${cmd.user}\0${cmd.pass}`).replace(/\r\n/g, "")}`;
      break;
    case "AUTH_CRAM_MD5_INIT":
      line = "AUTH CRAM-MD5";
      break;
    case "AUTH_CRAM_MD5_RESPONSE":
      return encodeUtf8(`${cmd.response}\r\n`);
    case "AUTH_XOAUTH2":
      line = `AUTH XOAUTH2 ${cmd.xoauth2String}`;
      break;
    case "MAIL_FROM":
      if (/[\r\n]/.test(cmd.address)) {
        throw new SMTPError(`Invalid address: contains CRLF`, 0, "MAIL FROM", cmd.address);
      }
      line = `MAIL FROM:<${cmd.address}>`;
      break;
    case "RCPT_TO":
      if (/[\r\n]/.test(cmd.address)) {
        throw new SMTPError(`Invalid address: contains CRLF`, 0, "RCPT TO", cmd.address);
      }
      line = `RCPT TO:<${cmd.address}>`;
      break;
    case "DATA":
      line = "DATA";
      break;
    case "DATA_BODY":
      return encodeUtf8(applyDotStuffing(cmd.content));
    case "QUIT":
      line = "QUIT";
      break;
    case "RSET":
      line = "RSET";
      break;
    case "NOOP":
      line = "NOOP";
      break;
  }

  return encodeUtf8(`${line}\r\n`);
}

/**
 * Parse raw bytes from the server into an SMTPResponse.
 */
export function parseResponse(data: Uint8Array): SMTPResponse {
  const text = new TextDecoder().decode(data).trim();
  const lines = text.split(/\r?\n/);
  const lastLine = lines[lines.length - 1] ?? "";
  const match = lastLine.match(/^(\d{3})([\s-])(.*)$/);

  if (!match) {
    throw new SMTPError("Invalid SMTP response", 0, "PARSE", text);
  }

  const code = Number.parseInt(match[1] ?? "0", 10);
  const message = lines.map((l) => l.replace(/^\d{3}[\s-]/, "")).join(" ");

  return {
    code,
    message,
    isSuccess: code >= 200 && code < 300,
    isReady: code >= 300 && code < 400,
    isError: code >= 400,
  };
}

/**
 * Accumulate byte chunks until a complete SMTP response is received.
 */
export function accumulateResponse(chunks: Uint8Array[]): Uint8Array | null {
  if (chunks.length === 0) {
    return null;
  }

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(combined);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const lastLine = lines[lines.length - 1] ?? "";
  if (/^\d{3} /.test(lastLine)) {
    return combined;
  }

  return null;
}

/**
 * Select the best AUTH method from EHLO capability lines.
 * Priority: XOAUTH2 > CRAM-MD5 > LOGIN > PLAIN.
 */
export function selectAuthMethod(
  capabilities: string[],
): "LOGIN" | "PLAIN" | "CRAM-MD5" | "OAUTH2" {
  const upper = capabilities.map((c) => c.toUpperCase());
  if (upper.some((c) => c.includes("AUTH") && c.includes("XOAUTH2"))) {
    return "OAUTH2";
  }
  if (upper.some((c) => c.includes("AUTH") && c.includes("CRAM-MD5"))) {
    return "CRAM-MD5";
  }
  if (upper.some((c) => c.includes("AUTH") && c.includes("LOGIN"))) {
    return "LOGIN";
  }
  if (upper.some((c) => c.includes("AUTH") && c.includes("PLAIN"))) {
    return "PLAIN";
  }
  throw new SMTPError("No supported AUTH method", 0, "EHLO", capabilities.join(" "));
}

/**
 * Parse an EHLO multi-line response and extract capability keywords.
 */
export function parseEHLO(response: SMTPResponse): string[] {
  return response.message
    .split(/\s+/)
    .flatMap((part) => part.split(/\r?\n/))
    .filter(Boolean);
}

/**
 * Assert that an SMTPResponse code is within the expected set.
 */
export function assertResponse(
  response: SMTPResponse,
  expectedCodes: number[],
  command: string,
): void {
  if (!expectedCodes.includes(response.code)) {
    throw new SMTPError(
      `Unexpected SMTP response for ${command}`,
      response.code,
      command,
      response.message,
    );
  }
}

function applyDotStuffing(content: Uint8Array): string {
  const text = new TextDecoder().decode(content);
  const lines = text.split(/\r?\n/);
  const stuffed = lines.map((line) => (line.startsWith(".") ? `.${line}` : line));
  return `${stuffed.join("\r\n")}\r\n.\r\n`;
}

/** Encode AUTH LOGIN password step (second base64 chunk). */
export function encodeAuthLoginPass(pass: string): Uint8Array {
  return encodeUtf8(`${encodeBase64(pass).replace(/\r\n/g, "")}\r\n`);
}

/** Encode AUTH LOGIN user step when sent separately after 334. */
export function encodeAuthLoginUser(user: string): Uint8Array {
  return encodeUtf8(`${encodeBase64(user).replace(/\r\n/g, "")}\r\n`);
}

/** Encode CRAM-MD5 response after challenge. */
export function encodeAuthCramResponse(response: string): Uint8Array {
  return encodeUtf8(`${response}\r\n`);
}

/** Encode raw SMTP line with CRLF. */
export function encodeLine(line: string): Uint8Array {
  return encodeUtf8(`${line}\r\n`);
}
