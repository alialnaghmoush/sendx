---
name: sendx v0.2 implementation
overview: "Implement sendx v0.2 in nine sequential units on top of v0.1 (59 passing tests): types, CRAM-MD5, DKIM, OAuth2/XOAUTH2, connection pooling with rate limiting, and public API/docs. One necessary deviation: real pooling requires refactoring SMTP session lifecycle in the transport."
todos:
  - id: unit-1-types
    content: "Unit 1: Add DKIMConfig, OAuth2Config, PoolConfig; update SMTPAuth + extend SMTPConfig in types.ts"
    status: completed
  - id: unit-2-cram
    content: "Unit 2: cram-md5.ts + smtp re-export/priority; fix AUTH CRAM command; transport authenticate CRAM path; tests"
    status: completed
  - id: unit-3-dkim
    content: "Unit 3: dkim.ts (canonicalize, importPrivateKey, signDKIM) + dkim.test.ts with RFC vectors"
    status: completed
  - id: unit-4-dkim-mime
    content: "Unit 4: async buildMIME + DKIM prepend; await all callers; mime DKIM test"
    status: completed
  - id: unit-5-oauth2
    content: "Unit 5: auth/oauth2.ts OAuth2Client + mocked fetch tests"
    status: completed
  - id: unit-6-oauth-smtp
    content: "Unit 6: AUTH_XOAUTH2 command + transport auth + smtp transport test"
    status: completed
  - id: unit-7-pool
    content: "Unit 7: Refactor smtp session helpers; pool/connection.ts + pool.ts + pool tests"
    status: completed
  - id: unit-8-rate
    content: "Unit 8: RateLimiter with injectable clock; deterministic pool test (no sleep/timing)"
    status: completed
  - id: unit-9-release
    content: "Unit 9: index exports, build/package/jsr 0.2.0, createMailer pool:auto, CHANGELOG, README, PROGRESS"
    status: completed
isProject: false
---

# sendx v0.2 — Implementation Plan

## Current baseline

| Area | State |
|------|--------|
| Tests | **59 pass** across 7 files (`bun test`) |
| Version | `0.1.1` in [package.json](package.json) and [jsr.json](jsr.json) (spec says 0.2.0 target) |
| Types | [src/core/types.ts](src/core/types.ts) — `SMTPAuth.pass` required; no DKIM/OAuth2/Pool |
| CRAM-MD5 | Stub in [src/core/smtp.ts](src/core/smtp.ts); transport [authenticate()](src/transports/smtp.ts) throws on CRAM-MD5 |
| `buildMIME` | Sync in [src/core/mime.ts](src/core/mime.ts); 7 call sites in tests + transport + MCP tool |
| Pooling | **Not possible today** — `SMTPTransport.send()` always QUITs and `close()`s adapter in `finally` |
| New dirs | `src/auth/`, `src/pool/` do not exist |

```mermaid
flowchart LR
  subgraph v01 [v0.1 send path]
    A[resolveAttachments] --> B[buildMIME sync]
    B --> C[connect EHLO TLS AUTH]
    C --> D[MAIL RCPT DATA QUIT close]
  end
  subgraph v02 [v0.2 additions]
    B2[buildMIME async + DKIM]
    C2[OAuth2 XOAUTH2]
    C3[CRAM-MD5 live]
    P[SMTPPool persistent sessions]
    R[RateLimiter token bucket]
  end
  B --> B2
  C --> C2
  C --> C3
  D --> P
  P --> R
```

---

## Pre-start notes (read before Unit 1)

### NOTE 1 — Ed25519 PKCS#8 across runtimes (Unit 3)

`crypto.subtle.importKey` for Ed25519 expects **PKCS#8 DER** (`-----BEGIN PRIVATE KEY-----`). OpenSSH format (`-----BEGIN OPENSSH PRIVATE KEY-----`) is **not** supported by Web Crypto.

In `importPrivateKey()` when `algorithm === 'ed25519-sha256'`:

1. If PEM header contains `OPENSSH PRIVATE KEY`, throw a clear error:
   > Ed25519 keys must be in PKCS#8 PEM format (-----BEGIN PRIVATE KEY-----). Convert with: `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key_pkcs8.pem`
2. On `DOMException` from `importKey('Ed25519', ...)`, rethrow with:
   > Ed25519 DKIM requires Node.js ≥ 18.4, Bun ≥ 1.0, or Cloudflare Workers

**Tests:** never use hardcoded OpenSSH PEM fixtures. Generate Ed25519 keys in-test:

```ts
const { privateKey } = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey)
// wrap DER as PEM for importPrivateKey round-trip
```

RSA tests may use embedded PKCS#8 PEM fixtures as today.

### NOTE 2 — CRAM-MD5 command types (Unit 2)

Remove `{ type: 'AUTH_CRAM_MD5'; user; pass; challenge }` entirely (never worked). Replace with two explicit `SMTPCommand` variants:

| Type | Encodes to |
|------|------------|
| `{ type: 'AUTH_CRAM_MD5_INIT' }` | `AUTH CRAM-MD5\r\n` |
| `{ type: 'AUTH_CRAM_MD5_RESPONSE'; response: string }` | `<response>\r\n` (response already base64) |

**Transport `authenticate()` CRAM flow:**

1. `sendCommand(adapter, { type: 'AUTH_CRAM_MD5_INIT' })`
2. `assertResponse(reply, [334], 'AUTH CRAM-MD5')`
3. `challenge =` base64-decode `reply.message` (strip SMTP prefix if needed)
4. `response = await computeCRAMMD5(challenge, auth.user, auth.pass!)`
5. `sendCommand(adapter, { type: 'AUTH_CRAM_MD5_RESPONSE', response })`
6. `assertResponse(reply, [235], 'AUTH CRAM-MD5 response')`

Remove or stop using `encodeAuthCramResponse` if redundant — prefer `encodeCommand` for the response step. Add `encodeCommand` tests for both new types in [tests/core/smtp.test.ts](tests/core/smtp.test.ts).

### NOTE 3 — Rate limiter test reliability (Unit 8)

Do **not** use real-time timing (`performance.now()`, `Bun.sleep`) in rate limiter tests — flaky in CI.

Make `RateLimiter` testable via injectable clock (private class in [src/pool/pool.ts](src/pool/pool.ts)):

```ts
class RateLimiter {
  constructor(
    rateDelta: number,
    rateLimit: number,
    private readonly now: () => number = Date.now,
  ) {}
}
```

**Deterministic test pattern** (export clock injection only for tests via package-internal test hook, or test `RateLimiter` by exporting `@internal` / testing through `SMTPPool` with injected clock constructor param on pool):

```ts
let t = 0
const clock = () => t
const limiter = new RateLimiter(2, 1000, clock)

void limiter.acquire() // immediate
void limiter.acquire() // immediate
let resolved = false
limiter.acquire().then(() => { resolved = true })
expect(resolved).toBe(false)

t = 1001
await limiter.acquire() // or flush pending via next acquire — document exact refill trigger
expect(resolved).toBe(true)
```

Zero `sleep()` in tests.

---

## Critical deviation: pooling needs transport session refactor

Unit 7 boundary says *"No changes to existing transport files"*, but [SMTPTransport.send()](src/transports/smtp.ts) (lines 56–135) opens a **new** TCP session per message and closes in `finally`. A pool that only calls `transport.send()` would serialize concurrency without reusing connections.

**Required minimal refactor in Unit 7** ([src/transports/smtp.ts](src/transports/smtp.ts)):

1. Extract session phases into exported or `@internal` helpers (same file):
   - `openSession(adapter, config)` → greeting, EHLO, STARTTLS, AUTH, return `capabilities`
   - `deliverMessage(adapter, mime)` → MAIL / RCPT / DATA (no connect/auth)
   - `closeSession(adapter)` → QUIT + `adapter.close()`
2. `SMTPTransport.send()` = connect + `openSession` + `deliverMessage` + `closeSession` (preserves v0.1 behavior).
3. [src/pool/connection.ts](src/pool/connection.ts) holds one adapter + calls `openSession` once, `deliverMessage` per message, `RSET` optional on failure, `closeSession` on recycle/`maxMessages`.

Also replace broken **CRAM-MD5 command** (see NOTE 2): remove `AUTH_CRAM_MD5` case; add `AUTH_CRAM_MD5_INIT` + `AUTH_CRAM_MD5_RESPONSE`. Full `authenticate()` CRAM path lands in **Unit 2**.

---

## Unit 1 — Core Types v0.2

**File:** [src/core/types.ts](src/core/types.ts)

- **Append** (new interfaces, no edits to unrelated types): `DKIMConfig`, `OAuth2Config`, `PoolConfig`
- **Replace in place** `SMTPAuth` (spec’s “updated” interface — intentional breaking-soft change):
  - `pass?: string`
  - `type?: 'LOGIN' | 'PLAIN' | 'CRAM-MD5' | 'OAUTH2'`
  - `oauth2?: OAuth2Config`
- **Extend** `SMTPConfig`:
  - `dkim?: DKIMConfig`
  - `pool?: boolean`
  - Spread `PoolConfig` fields (`maxConnections`, `maxMessages`, `rateDelta`, `rateLimit`) — use `interface SMTPConfig extends PoolConfig` or inline optional fields to match existing style (semicolons, double quotes per Biome)

**Verify:** `bun run typecheck` only (no new tests).

---

## Unit 2 — CRAM-MD5

**Create:** [src/core/cram-md5.ts](src/core/cram-md5.ts)

- `md5(Uint8Array): Uint8Array` — RFC 1321, ~80 lines bitwise
- `hmacMD5(key, data): Uint8Array` — RFC 2104
- `computeCRAMMD5(challenge, user, pass): string` — decode challenge base64, HMAC-MD5, hex digest, `base64("${user} ${hex}")`

**Update:** [src/core/smtp.ts](src/core/smtp.ts)

- Remove stub; re-export `computeCRAMMD5` from `./cram-md5.js`
- **Remove** `{ type: 'AUTH_CRAM_MD5'; ... }` from `SMTPCommand` union
- **Add** `AUTH_CRAM_MD5_INIT` and `AUTH_CRAM_MD5_RESPONSE` (NOTE 2)
- `encodeCommand` cases per NOTE 2 table
- `selectAuthMethod`: **CRAM-MD5 > LOGIN > PLAIN** (XOAUTH2 in Unit 6)
- Tests for both `encodeCommand` variants

**Update:** [src/transports/smtp.ts](src/transports/smtp.ts) `authenticate()`:

- Six-step CRAM flow (NOTE 2); use `sendCommand` + new command types, not `encodeAuthCramResponse` unless kept as thin wrapper
- Guard `auth.pass` required for LOGIN / PLAIN / CRAM-MD5

**Create:** [tests/core/cram-md5.test.ts](tests/core/cram-md5.test.ts)

- 7 RFC 1321 MD5 vectors
- RFC 2202 HMAC-MD5 vectors
- Known CRAM-MD5 challenge/response fixture

**Update:** [tests/core/smtp.test.ts](tests/core/smtp.test.ts) — replace “throws in v0.1” with priority, `computeCRAMMD5` success, `AUTH_CRAM_MD5_INIT` / `RESPONSE` encoding

---

## Unit 3 — DKIM core

**Create:** [src/core/dkim.ts](src/core/dkim.ts)

- `canonicalizeHeadersRelaxed`, `canonicalizeBodyRelaxed` (RFC 6376 §3.4.2 / §3.4.4)
- `importPrivateKey(pem, algorithm)`:
  - RSA: PKCS#8 PEM → `RSASSA-PKCS1-v1_5` + SHA-256
  - Ed25519: **PKCS#8 only** (NOTE 1) — detect OpenSSH header → throw conversion instructions; catch `DOMException` → runtime version message
- `signDKIM(rawMessage, config)`:
  - Default `headerFieldNames`: `from:to:subject:date:message-id:mime-version:content-type`
  - `skipFields` filter
  - Split headers/body at first `\r\n\r\n`
  - `bh=` = base64(SHA-256(canonical body))
  - Build `DKIM-Signature` with empty `b=`, canonicalize headers + DKIM header, sign, fill `b=`
  - Algorithms: `rsa-sha256` (default), `ed25519-sha256`

**Create:** [tests/core/dkim.test.ts](tests/core/dkim.test.ts)

- Appendix B canonicalization vectors
- `bh=` fixture
- RSA sign + `crypto.subtle.verify` round-trip (PKCS#8 PEM fixture OK)
- Ed25519 round-trip using `generateKey` + `exportKey('pkcs8')` only (NOTE 1)
- Test: OpenSSH PEM header → clear error message
- Document minimum runtimes in module TSDoc (Node ≥ 18.4, Bun ≥ 1.0, Workers)

**Boundary:** Web Crypto only; no `node:crypto`.

---

## Unit 4 — DKIM integration

**Update:** [src/core/mime.ts](src/core/mime.ts)

- `export async function buildMIME(options, dkim?: DKIMConfig): Promise<MIMEBuildResult>`
- After building `raw`, if `dkim`: `signDKIM` → prepend `header + '\r\n'` to bytes; update `size`

**Update callers to `await`:**

- [src/transports/smtp.ts](src/transports/smtp.ts): `const mime = await buildMIME(resolvedOptions, this.config.dkim)` — extend `ResolvedSMTPConfig` with `dkim?`
- [tests/core/mime.test.ts](tests/core/mime.test.ts) — all 7 tests `await buildMIME(...)`
- [tools/mcp/tools/preview-mime.ts](tools/mcp/tools/preview-mime.ts) — `await buildMIME`
- Add mime test: with test DKIM key, raw starts with `DKIM-Signature:`

**Do not** change [src/core/dkim.ts](src/core/dkim.ts) in this unit.

---

## Unit 5 — OAuth2 / XOAUTH2

**Create:** [src/auth/oauth2.ts](src/auth/oauth2.ts)

- `OAuth2Client` with in-memory cache + 30s expiry buffer
- `refreshAccessToken()` via `fetch` POST to `tokenUrl` (default `GOOGLE_TOKEN_URL`)
- `getToken()` override skips client credentials flow
- `buildXOAUTH2()` → base64 of `user=<user>\x01auth=Bearer <token>\x01\x01` (use [encodeBase64](src/core/base64.ts))

**Create:** [tests/auth/oauth2.test.ts](tests/auth/oauth2.test.ts)

- Mock `globalThis.fetch`
- Fixtures for XOAUTH2 string, cache hit/miss, `getToken` override

---

## Unit 6 — OAuth2 SMTP integration

**Update:** [src/core/smtp.ts](src/core/smtp.ts)

- `SMTPCommand`: `{ type: 'AUTH_XOAUTH2'; xoauth2String: string }`
- `encodeCommand`: `AUTH XOAUTH2 <string>\r\n`
- `selectAuthMethod`: **XOAUTH2 > CRAM-MD5 > LOGIN > PLAIN** when EHLO advertises `AUTH` + `XOAUTH2`
- Return type union includes `'OAUTH2'` or handle via explicit `auth.type === 'OAUTH2'`

**Update:** [src/transports/smtp.ts](src/transports/smtp.ts) `authenticate()`:

```ts
if (auth.type === 'OAUTH2' && auth.oauth2) {
  const client = new OAuth2Client(auth.oauth2)
  const xoauth2 = await client.buildXOAUTH2()
  await sendRaw(adapter, encodeCommand({ type: 'AUTH_XOAUTH2', xoauth2String: xoauth2 }))
  // On 334: send encodeLine('') for error detail per spec
  ...
}
```

**Update:** [tests/transports/smtp.test.ts](tests/transports/smtp.test.ts) — mock EHLO with `AUTH XOAUTH2`, mock fetch for token, assert `AUTH XOAUTH2` in command log

---

## Unit 7 — Connection pool (+ session refactor)

**Create:** [src/pool/connection.ts](src/pool/connection.ts)

- `PooledConnection` wrapping adapter + session state
- `send(options)`: `resolveAttachments` → `await buildMIME(..., dkim)` → `deliverMessage` → increment `messageCount`
- `usable`: `messageCount < maxMessages`
- `close()`: `closeSession`

**Create:** [src/pool/pool.ts](src/pool/pool.ts)

- `SMTPPool` implements `Transport` (`send`, `verify`, `close`, getters `connectionCount`, `queueSize`)
- Defaults: `maxConnections=5`, `maxMessages=100`
- Promise queue when all connections busy
- Recycle connection when `messageCount >= maxMessages`

**Refactor:** [src/transports/smtp.ts](src/transports/smtp.ts) — extract `openSession` / `deliverMessage` / `closeSession` (see deviation above)

**Create:** [tests/pool/pool.test.ts](tests/pool/pool.test.ts)

- Mock adapter + transport factory injection (constructor option `createConnection?: () => PooledConnection` or mock `SMTPTransport` at adapter layer — follow v0.1 [MockAdapter](tests/transports/smtp.test.ts) pattern)
- Tests: max connections cap, queue drain, recycle at `maxMessages`, `close()` drains queue

---

## Unit 8 — Rate limiter

**Update:** [src/pool/pool.ts](src/pool/pool.ts) only

- Private `RateLimiter` class (token bucket): refill `rateDelta` tokens every `rateLimit` ms on lazy `acquire()` in `send()`
- Constructor accepts injectable `now: () => number = Date.now` (NOTE 3) — used by tests; production uses default
- Skip limiter entirely when `rateDelta` unset
- `SMTPPool` constructor may accept optional `now` forwarded to `RateLimiter` for testability (or export test-only factory — prefer optional ctor param on pool)

**Update:** [tests/pool/pool.test.ts](tests/pool/pool.test.ts)

- **Deterministic** rate limit test with controlled clock (NOTE 3): two immediate `acquire()`, third pending until `t` advanced past `rateLimit`, zero `sleep()`
- No `performance.now()` thresholds

---

## Unit 9 — Version, exports, docs, createMailer pool

**Exports:** [src/index.ts](src/index.ts)

```ts
export type { DKIMConfig, OAuth2Config, PoolConfig } from './core/types.js'
export { OAuth2Client, GOOGLE_TOKEN_URL, MICROSOFT_TOKEN_URL } from './auth/oauth2.js'
export { SMTPPool } from './pool/pool.js'
// Do NOT export computeCRAMMD5
```

**Build / package:**

- [build.ts](build.ts): add `src/auth/oauth2.ts`, `src/pool/pool.ts`
- [package.json](package.json) + [jsr.json](jsr.json): version `0.2.0`, exports:
  - `./auth/oauth2`
  - `./pool`

**createMailer (user choice: auto pool):** [src/detect.ts](src/detect.ts)

```ts
if (smtpConfig.pool) {
  return new MailerImpl(new SMTPPool({ ...smtpConfig, adapter }))
}
return new MailerImpl(new SMTPTransport({ ...smtpConfig, adapter }))
```

`SMTPPool` must satisfy `Transport`.

**Docs:**

- Create [CHANGELOG.md](CHANGELOG.md) per spec
- Update [README.md](README.md): DKIM, Gmail OAuth2, pooling + `pool: true` with `createMailer`, remove “CRAM-MD5 planned” line
- Append Units 1–9 sections to [PROGRESS.md](PROGRESS.md) after each unit

**Final verify:**

```bash
bun test && bun run typecheck && bun run lint && bun run build
bun run publish:dry   # or jsr dry-run per project script
```

---

## Cross-cutting constraints (every unit)

- No `node:crypto` in `src/core/` or `src/auth/`
- No `import *` in `src/`
- Explicit return types on all **exported** functions (JSR slow-types)
- Match existing code style (Biome: 2-space, double quotes, semicolons)
- Only modify files listed in each unit’s OUTPUT (+ necessary deviation files noted above)

---

## Expected test growth (approximate)

| Unit | New tests |
|------|-----------|
| 2 | ~15 (MD5 + HMAC + CRAM + smtp updates) |
| 3 | ~10–15 (canonicalization + sign/verify) |
| 4 | +1 mime DKIM |
| 5 | ~6 oauth2 |
| 6 | +1 transport OAuth2 |
| 7–8 | ~8 pool + rate |
| **Total** | ~59 + 40–50 → **~100+** |

---

## Execution order (unchanged)

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Units 4 and 6 can run after their dependencies; 7 depends on stable `buildMIME` + auth from 2/6.
