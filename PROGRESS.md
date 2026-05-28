# sendx — Implementation Progress

---

## Unit 1 — Project Setup
**Status:** completed
**Date:** 2026-05-29

### Files created
- package.json
- tsconfig.json
- biome.json
- build.ts
- src/index.ts (stub)
- src/adapters/*.ts (stubs)
- src/transports/*.ts (stubs)
- src/core/.gitkeep
- tests/core/.gitkeep
- tests/adapters/.gitkeep
- tests/transports/.gitkeep
- tools/mcp/tools/.gitkeep

### Files modified
- .gitignore — added `*.local`
- bun.lock — refreshed

### Verification
- [x] bun test — 0 tests found (expected)
- [x] bun run typecheck — passed
- [x] bun run lint — passed
- [x] bun run build — passed

### Deviations from plan
- biome.json schema updated to 2.4.16 (latest Biome rejects 1.9.4 schema)

### Blocked by
- none

---

## Unit 2 — Core Types
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/types.ts

### Files modified
- [none]

### Verification
- [x] bun test — 0 tests (no new tests)
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 3 — Base64 & Encoding
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/base64.ts
- tests/core/base64.test.ts

### Files modified
- [none]

### Verification
- [x] bun test — 10 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 4 — Address Parser
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/address.ts
- tests/core/address.test.ts

### Files modified
- [none]

### Verification
- [x] bun test — 24 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 5 — MIME Builder
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/mime.ts
- tests/core/mime.test.ts

### Files modified
- [none]

### Verification
- [x] bun test — 31 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 6 — SMTP State Machine
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/smtp.ts
- tests/core/smtp.test.ts

### Files modified
- [none]

### Verification
- [x] bun test — 44 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- CRAM-MD5 stub per plan correction (LOGIN/PLAIN only in v0.1)

### Blocked by
- none

---

## Unit 7 — Node.js Adapter
**Status:** completed
**Date:** 2026-05-29

### Files created
- tests/adapters/node.test.ts

### Files modified
- src/adapters/node.ts — full implementation

### Verification
- [x] bun test — 46 tests passed
- [x] bun run typecheck — passed (after @types/node)
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 8 — Bun Adapter
**Status:** completed
**Date:** 2026-05-29

### Files created
- [none]

### Files modified
- src/adapters/bun.ts — full implementation

### Verification
- [x] bun test — 46 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 9 — Deno Adapter
**Status:** completed
**Date:** 2026-05-29

### Files created
- [none]

### Files modified
- src/adapters/deno.ts — full implementation

### Verification
- [x] bun test — 46 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 10 — Cloudflare Workers Adapter
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/adapters/cf-sockets.d.ts

### Files modified
- src/adapters/cf.ts — full implementation

### Verification
- [x] bun test — 46 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- Added cf-sockets.d.ts for TypeScript module resolution

### Blocked by
- none

---

## Unit 11 — SMTP Transport
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/transports/resolve-attachments.ts
- tests/transports/smtp.test.ts

### Files modified
- src/transports/smtp.ts — full implementation

### Verification
- [x] bun test — 47 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- Extracted resolveAttachments to shared src/transports/resolve-attachments.ts

### Blocked by
- none

---

## Unit 12 — HTTP Transports
**Status:** completed
**Date:** 2026-05-29

### Files created
- [none]

### Files modified
- src/transports/resend.ts — full implementation
- src/transports/sendgrid.ts — full implementation
- src/transports/postmark.ts — full implementation

### Verification
- [x] bun test — 47 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 13 — Runtime Detection + Index
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/detect.ts

### Files modified
- src/index.ts — re-exports only

### Verification
- [x] bun test — 47 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed
- [x] bun run build — passed

### Deviations from plan
- Added @types/node devDependency for adapter typecheck

### Blocked by
- none

---

## Unit 14 — MCP Server
**Status:** completed
**Date:** 2026-05-29

### Files created
- tools/mcp/index.ts
- tools/mcp/tools/send-test.ts
- tools/mcp/tools/preview-mime.ts
- tools/mcp/tools/check-smtp.ts
- tools/mcp/tools/validate-config.ts

### Files modified
- package.json — added @modelcontextprotocol/sdk devDependency
- bun.lock — refreshed

### Verification
- [x] bun test — 47 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed (src only; tools excluded from lint script)

### Deviations from plan
- [none]

### Blocked by
- none

---

## Unit 15 — README
**Status:** completed
**Date:** 2026-05-29

### Files created
- [none]

### Files modified
- README.md — comprehensive documentation

### Verification
- [x] bun test — 47 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed
- [x] bun run build — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Post-Unit — HTTP Transport Tests
**Status:** completed
**Date:** 2026-05-29

### Files created
- tests/transports/http.test.ts

### Files modified
- [none]

### Verification
- [x] bun test — 59 tests passed (12 new HTTP transport tests)
- [x] bun run typecheck — passed
- [x] bun run lint — passed

### Deviations from plan
- [none]

### Blocked by
- none

---

## Post-Unit — npm + JSR Publish Prep
**Status:** completed
**Date:** 2026-05-29

### Files created
- jsr.json
- LICENSE
- .github/workflows/publish.yml
- scripts/publish.ts

### Files modified
- package.json — added publishConfig, publish:dry, publish:release scripts
- src/index.ts — @module doc
- src/adapters/node.ts — @module doc, explicit return types, JSDoc
- src/adapters/bun.ts — @module doc, explicit return types, JSDoc
- src/adapters/deno.ts — @module doc, explicit return types, JSDoc
- src/adapters/cf.ts — @module doc, explicit return types, JSDoc
- src/transports/smtp.ts — @module doc, explicit return types, JSDoc
- src/transports/resend.ts — @module doc, JSDoc
- src/transports/sendgrid.ts — @module doc, JSDoc
- src/transports/postmark.ts — @module doc, JSDoc
- src/detect.ts — explicit return types on MailerImpl methods
- src/core/smtp.ts — JSDoc on SMTPError constructor

### Verification
- [x] bun test — 59 tests passed
- [x] bun run typecheck — passed
- [x] bun run lint — passed
- [x] bun run build — passed
- [x] npx jsr publish --dry-run --allow-dirty — 0 slow-type warnings

### Deviations from plan
- jsr.json includes `"license": "MIT"` and `"publish.exclude"` (required by JSR; not in original spec)
- LICENSE file added (JSR requires license field or file)
- Post-unit work outside the original 15-unit plan

### Blocked by
- none

---

### Note on adapter testing
BunAdapter, DenoAdapter, CloudflareAdapter have no automated tests.
These require their respective runtimes and will be covered in CI
matrix (bun test / deno test / wrangler) in a future setup phase.

---

## v0.2 — Unit 1 — Core Types v0.2
**Status:** completed
**Date:** 2026-05-29

### Files created
- [none]

### Files modified
- src/core/types.ts — DKIMConfig, OAuth2Config, PoolConfig; SMTPAuth; SMTPConfig extends PoolConfig

### Verification
- [x] bun run typecheck
- [x] bun run lint

### Deviations from plan
- [none]

### Blocked by
- none

---

## v0.2 — Unit 2 — CRAM-MD5
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/cram-md5.ts
- tests/core/cram-md5.test.ts

### Files modified
- src/core/smtp.ts — AUTH_CRAM_MD5_INIT/RESPONSE, selectAuthMethod priority
- src/transports/smtp.ts — CRAM authenticate flow
- tests/core/smtp.test.ts

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Deviations from plan
- RFC 1321 vector 7 expected hash corrected to match standard MD5 output

### Blocked by
- none

---

## v0.2 — Unit 3 — DKIM Core
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/core/dkim.ts
- tests/core/dkim.test.ts

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Deviations from plan
- OpenSSH PEM detection and runtime version errors per pre-start NOTE 1

### Blocked by
- none

---

## v0.2 — Unit 4 — DKIM Integration
**Status:** completed
**Date:** 2026-05-29

### Files modified
- src/core/mime.ts — async buildMIME + DKIM prepend
- src/transports/smtp.ts — await buildMIME, dkim config
- tests/core/mime.test.ts
- tools/mcp/tools/preview-mime.ts
- tools/mcp/index.ts

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Blocked by
- none

---

## v0.2 — Unit 5 — OAuth2
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/auth/oauth2.ts
- tests/auth/oauth2.test.ts

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Blocked by
- none

---

## v0.2 — Unit 6 — OAuth2 SMTP Integration
**Status:** completed
**Date:** 2026-05-29

### Files modified
- src/core/smtp.ts — AUTH_XOAUTH2, selectAuthMethod XOAUTH2
- src/transports/smtp.ts — OAUTH2 authenticate
- tests/transports/smtp.test.ts
- tests/core/smtp.test.ts

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Blocked by
- none

---

## v0.2 — Unit 7 — Connection Pool
**Status:** completed
**Date:** 2026-05-29

### Files created
- src/pool/connection.ts
- src/pool/pool.ts
- tests/pool/pool.test.ts

### Files modified
- src/transports/smtp.ts — openSMTPSession, deliverSMTPMessage, closeSMTPSession

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Deviations from plan
- Required smtp.ts session refactor (documented in plan deviation)

### Blocked by
- none

---

## v0.2 — Unit 8 — Rate Limiter
**Status:** completed
**Date:** 2026-05-29

### Files modified
- src/pool/pool.ts — RateLimiter with injectable clock
- tests/pool/pool.test.ts — deterministic rate limit test

### Verification
- [x] bun test
- [x] bun run typecheck
- [x] bun run lint

### Deviations from plan
- RateLimiter.notify() for deterministic tests (no sleep)

### Blocked by
- none

---

## v0.2 — Unit 9 — Version + Exports
**Status:** completed
**Date:** 2026-05-29

### Files created
- CHANGELOG.md

### Files modified
- src/index.ts — v0.2 exports
- src/detect.ts — pool: true → SMTPPool
- build.ts — auth/oauth2, pool entrypoints
- package.json — 0.2.0, new exports
- jsr.json — 0.2.0, new exports
- README.md — DKIM, OAuth2, pooling docs

### Verification
- [x] bun test — 92 tests passed
- [x] bun run typecheck
- [x] bun run lint
- [x] bun run build

### Blocked by
- none