/**
 * @module
 * Pure-JS HMAC-MD5 implementation for SMTP CRAM-MD5 authentication.
 * Web Crypto does not support MD5, so this is implemented in pure TypeScript
 * with no external dependencies.
 *
 * @example
 * ```ts
 * import { computeCRAMMD5 } from "sendx/core/cram-md5";
 * const response = await computeCRAMMD5("<challenge>", "user", "pass");
 * ```
 */
import { decodeBase64, encodeBase64, encodeUtf8 } from "./base64.js";

/** MD5 block size in bytes (HMAC block size per RFC 2104). */
const BLOCK_SIZE = 64;

/** Coerce to unsigned 32-bit integer. */
function u32(x: number): number {
  return x >>> 0;
}

/**
 * Compute an MD5 hash of the given data (RFC 1321).
 */
export function md5(data: Uint8Array): Uint8Array {
  const padded = padMessage(data);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const block = padded.subarray(i, i + 64);
    const m = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      const o = j * 4;
      m[j] = u32(
        (block[o] ?? 0) |
          ((block[o + 1] ?? 0) << 8) |
          ((block[o + 2] ?? 0) << 16) |
          ((block[o + 3] ?? 0) << 24),
      );
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let k = 0; k < 64; k++) {
      let f: number;
      let g: number;
      if (k < 16) {
        f = u32((b & c) | (~b & d));
        g = k;
      } else if (k < 32) {
        f = u32((b & d) | (c & ~d));
        g = u32((5 * k + 1) % 16);
      } else if (k < 48) {
        f = u32(b ^ c ^ d);
        g = u32((3 * k + 5) % 16);
      } else {
        f = u32(c ^ (b | ~d));
        g = u32((7 * k) % 16);
      }

      const temp = d;
      d = c;
      c = b;
      b = u32(b + leftRotate(u32(a + f + u32((K[k] ?? 0) + (m[g] ?? 0))), S[k] ?? 0));
      a = temp;
    }

    a0 = u32(a0 + a);
    b0 = u32(b0 + b);
    c0 = u32(c0 + c);
    d0 = u32(d0 + d);
  }

  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, a0, true);
  view.setUint32(4, b0, true);
  view.setUint32(8, c0, true);
  view.setUint32(12, d0, true);
  return out;
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

function leftRotate(value: number, shift: number): number {
  return u32((value << shift) | (value >>> (32 - shift)));
}

function padMessage(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padLen = (56 - ((data.length + 1) % 64) + 64) % 64;
  const totalLen = data.length + 1 + padLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(data);
  padded[data.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000), true);
  return padded;
}

/**
 * Compute HMAC-MD5(key, data) per RFC 2104.
 */
export function hmacMD5(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > BLOCK_SIZE) {
    k = md5(k);
  }
  const paddedKey = new Uint8Array(BLOCK_SIZE);
  paddedKey.set(k);

  const ipad = new Uint8Array(BLOCK_SIZE);
  const opad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    ipad[i] = (paddedKey[i] ?? 0) ^ 0x36;
    opad[i] = (paddedKey[i] ?? 0) ^ 0x5c;
  }

  const inner = new Uint8Array(ipad.length + data.length);
  inner.set(ipad);
  inner.set(data, ipad.length);
  const innerHash = md5(inner);

  const outer = new Uint8Array(opad.length + innerHash.length);
  outer.set(opad);
  outer.set(innerHash, opad.length);
  return md5(outer);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute the CRAM-MD5 response string for SMTP authentication.
 *
 * @param challenge - base64-encoded challenge from server
 * @param user - SMTP username
 * @param pass - SMTP password
 * @returns base64-encoded CRAM-MD5 response
 */
export async function computeCRAMMD5(
  challenge: string,
  user: string,
  pass: string,
): Promise<string> {
  const challengeBytes = decodeBase64(challenge.trim());
  const passBytes = encodeUtf8(pass);
  const digest = hmacMD5(passBytes, challengeBytes);
  const hex = bytesToHex(digest);
  return encodeBase64(`${user} ${hex}`).replace(/\r\n/g, "");
}
