/**
 * @module
 * AWS Signature Version 4 signing using Web Crypto (HMAC-SHA256).
 * Works on Node.js, Bun, Deno, and Cloudflare Workers.
 * No external dependencies.
 *
 * @example
 * ```ts
 * import { signRequest } from "sently/core/sigv4";
 * const signed = await signRequest({
 *   method: "POST",
 *   url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails",
 *   headers: { "content-type": "application/json" },
 *   body: '{"..."}',
 *   credentials: { accessKeyId, secretAccessKey, region: "us-east-1", service: "ses" },
 * });
 * ```
 */

/** AWS credentials and signing scope for SigV4. */
export interface SigV4Credentials {
  /** AWS access key ID. */
  accessKeyId: string;
  /** AWS secret access key. */
  secretAccessKey: string;
  /** AWS region (e.g. `us-east-1`). */
  region: string;
  /** AWS service name (e.g. `ses`, `s3`). */
  service: string;
  /** Optional STS session token for temporary credentials. */
  sessionToken?: string;
}

/** HTTP request to sign with AWS Signature Version 4. */
export interface SigV4Request {
  /** HTTP method (e.g. `POST`). */
  method: string;
  /** Full request URL including path and query. */
  url: string;
  /** Request headers to include in the signature. */
  headers: Record<string, string>;
  /** Request body as a string (empty for GET). */
  body: string;
  /** AWS credentials and signing scope. */
  credentials: SigV4Credentials;
  /** Override datetime for testing. Full 'YYYYMMDDTHHMMSSZ' when provided. */
  _date?: string;
}

/** Signed request headers including Authorization. */
export interface SigV4Result {
  /** All headers including Authorization, x-amz-date, and x-amz-security-token */
  headers: Record<string, string>;
}

const encoder = new TextEncoder();

/**
 * Compute SHA-256 hash of a string using Web Crypto.
 * Returns lowercase hex string.
 * @internal
 */
export async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Compute HMAC-SHA256 using Web Crypto.
 * @internal
 */
export async function hmacSHA256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const keyBytes = typeof key === "string" ? encoder.encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
}

/**
 * Sign an HTTP request with AWS Signature Version 4.
 * Returns the complete set of headers to include in the request.
 */
export async function signRequest(request: SigV4Request): Promise<SigV4Result> {
  const { method, url, body, credentials } = request;
  const parsed = new URL(url);
  const amzDate = request._date ?? `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value.trim()]),
    ),
    host: parsed.host,
    "x-amz-date": amzDate,
  };

  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const signedHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = `${signedHeaderNames.map((name) => `${name}:${headers[name]}`).join("\n")}\n`;
  const canonicalQuery = normalizeQuery(parsed.searchParams);
  const payloadHash = await sha256Hex(body);
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri(parsed.pathname),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    credentials.secretAccessKey,
    dateStamp,
    credentials.region,
    credentials.service,
  );
  const signature = bytesToHex(await hmacSHA256(signingKey, stringToSign));
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}

async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmacSHA256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return hmacSHA256(kService, "aws4_request");
}

function canonicalUri(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
}

function normalizeQuery(searchParams: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    pairs.push(`${encodeRfc3986(key)}=${encodeRfc3986(value)}`);
  }
  pairs.sort();
  return pairs.join("&");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
