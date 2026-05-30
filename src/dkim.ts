/**
 * @module
 * DKIM (DomainKeys Identified Mail) signing per RFC 6376.
 * Supports RSA-SHA256 and Ed25519-SHA256 using Web Crypto.
 *
 * Import from this entry when signing mail explicitly. MIME building lazy-loads
 * DKIM only when a `dkim` option is passed to {@link buildMIME}.
 *
 * @example
 * ```ts
 * import { signDKIM } from "sently/dkim";
 *
 * const { header } = await signDKIM(rawMessage, {
 *   domainName: "example.com",
 *   keySelector: "2024",
 *   privateKey: process.env.DKIM_PRIVATE_KEY!,
 * });
 * ```
 */
export type { DKIMSignResult } from "./core/dkim.js";
export {
  canonicalizeBodyRelaxed,
  canonicalizeHeadersRelaxed,
  importPrivateKey,
  signDKIM,
} from "./core/dkim.js";
