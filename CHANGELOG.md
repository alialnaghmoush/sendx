# Changelog

## [0.4.5] — 2026-05-30

### Documentation

- Added `@module` documentation to the `./pool` entrypoint
- Documented exported interface properties and public API methods across
  core types, adapters, and transports to meet JSR symbol documentation
  requirements (80%+ threshold)

## [0.4.4] — 2026-05-30

### Security

- Fixed SigV4 date format: slice(0,15) not slice(0,16) — all real
  SES requests were producing malformed x-amz-date headers
- Added requireTLS guard before SMTP AUTH (default: true when auth
  is set) — prevents credential exposure on STARTTLS-stripping attacks
- Hardened email address validation against header and SMTP command
  injection, enforced centrally in `parseAddresses()` (and re-asserted
  at render time in `toMIMEHeader()`):
  - Rejects CR, LF, NUL, all other C0 control characters (0x00–0x1F),
    DEL (0x7F), and the Unicode line/paragraph separators U+2028/U+2029
  - Fails closed: hostile input throws a clear error with the offending
    code point instead of being accepted
  - No repair or normalization of malicious input — addresses are never
    transformed (e.g. CR/LF stripped) and then accepted
  - Protects the display name as well as the address; an ASCII display
    name such as `"Foo\r\nBcc: ..."` can no longer inject a header
  - Enforced consistently across every address field (From, To, Cc, Bcc,
    Reply-To) and every transport (SMTP, SES, Mailgun, Postmark, Resend,
    SendGrid, Brevo), since all of them route through `parseAddresses()`
- Sanitized attachment filenames and custom attachment headers
  against MIME header injection
- Fixed basePath startsWith sibling-directory bypass in
  resolve-attachments (now appends path separator before comparison)
- Added CRLF guard on EHLO domain for consistency

## [0.4.3] — 2026-05-30

### Added

- `llms.txt` for LLM/agent discovery (install, quick example, subpath
  exports, and when-to-use guidance)
- README: Nodemailer comparison table, 30-second tour, error handling,
  and TypeScript sections
- `CLAUDE.md` repository map for agents (core entry, adapters,
  transports, tests, build)

### Changed

- README positioning, HTTP transport reference table, plugin docs
  reorder, and tree-shaking callout
- `package.json` description and npm keywords for discoverability

## [0.4.2] — 2026-05-30

### Fixed

- CI: replaced node -e dynamic import with scripts/smoke.mjs
  (top-level await ESM) for reliable Node.js smoke testing
- CI: integration test now imports from dist/index.js directly
  instead of relying on package self-reference resolution
- CI: updated GitHub Actions to latest patch versions

## [0.4.1] — 2026-05-30

### Fixed

- CI: use locally installed tsc (node_modules/.bin/tsc) in build.ts
  instead of bunx tsc to avoid runtime npm downloads in CI
- CI: add bun run build step to SMTP integration job so dist/ exists
  before the integration test imports from 'sently'
- CI: improved smoke test error output with explicit .catch() handler
- CI: added FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to all workflow jobs

## [0.4.0] — 2026-05-30

### Added

- `PreviewTransport` — writes emails to disk as .eml or HTML for local development
- `RetryTransport` — decorator transport with exponential/linear/fixed backoff
- `mailer.sendBulk()` — batch send with concurrency control and per-message callbacks
- `templatePlugin` + `simpleEngine` — zero-dependency {{variable}} template rendering
- `verify()` on all HTTP transports (Resend, SendGrid, Postmark, Mailgun, SES, Brevo)
  returns typed `VerifyResult` instead of `boolean`
- `MailOptions.template` and `MailOptions.data` fields for template plugin integration
- `SESTransport` now accepts `dkim` config for signing raw MIME messages
- `attachment.path` basePath guard (opt-in) in resolveAttachments
- GitHub Actions CI matrix: unit tests (Bun), smoke test (Node 22), SMTP integration (Mailpit)

### Fixed

- `detectRuntime()` priority hardened: Bun checked before Node.js process globals
- Cloudflare Workers detection uses positive signature (caches + UA), not absence of other runtimes

## [0.3.4] — 2026-05-30

### Fixed

- Stale `sendx` references in package.json, build.ts, PROGRESS.md
- JSR badge URL now matches jsr.json scope exactly
- OAuth2 refresh deduplication: `refreshPromise` cleared in `.finally()`
  to correctly handle rejected refresh attempts
- SMTPPool.close() now sets draining flag, rejects new sends,
  and uses Promise.allSettled to drain in-flight messages
- Audited all buildMIME() call sites — await confirmed present

### Added

- `engines` field in package.json (Node >= 18, Bun >= 1.0)

## [0.3.3] — 2026-05-29

### Fixed

- Corrected JSR package name in README from `@sently/sently` to `@alialnaghmoush/sently`

## [0.3.2] — 2026-05-29

### Fixed

- Biome formatting in MIME header builder (`src/core/mime.ts`) so `bun lint` passes

## [0.3.1] — 2026-05-29

### Security

- Fixed CRLF header injection: `sanitizeHeaderValue()` strips CR/LF
  from Subject, display names, and custom headers in MIME builder
- Fixed SMTP command injection: `MAIL FROM` and `RCPT TO` throw
  `SMTPError` when address contains CR or LF
- Fixed email address validation: `isValidEmail()` rejects strings
  containing CR, LF, or TAB
- Fixed OAuth2 refresh race condition: concurrent `getAccessToken()`
  calls now share a single in-flight refresh Promise
- Added `console.warn` when `rejectUnauthorized: false` is set
  in Node.js and Bun adapters
- Added security note in README for `attachment.path`

## [0.3.0] — 2026-05-29

### Added

- Plugin system: `plugins` array in `createMailer()` config
  Plugins are `(options: MailOptions) => MailOptions | Promise<MailOptions>` functions
  that run sequentially before message construction
- `MailgunTransport` — Mailgun HTTP API (multipart/form-data)
- `SESTransport` — AWS SES v2 HTTP API with SigV4 signing (Web Crypto)
- `BrevoTransport` — Brevo (formerly Sendinblue) HTTP API
- `TLSOptions.minVersion` — set minimum TLS version for legacy SMTP servers

### Parity milestone

sently now covers ~98% of Nodemailer feature parity for modern use cases.
Remaining gaps (SOCKS proxy, iCal) are out of scope by design.

## [0.2.0] — 2026-05-29

### Added

- DKIM signing (RSA-SHA256 and Ed25519-SHA256) via `SMTPConfig.dkim`
- OAuth2 / XOAUTH2 authentication via `SMTPAuth.type = 'OAUTH2'`
- Connection pooling via `SMTPConfig.pool` and `SMTPPool`
- Rate limiting via `PoolConfig.rateDelta` / `PoolConfig.rateLimit`
- CRAM-MD5 authentication (pure-JS HMAC-MD5)

### Changed

- npm package name is `sently`; JSR package name is `@sently/sently`
- `SMTPAuth.pass` is now optional (was required in v0.1)
- `buildMIME()` is now `async` when DKIM config is provided
- `selectAuthMethod` priority: XOAUTH2 > CRAM-MD5 > LOGIN > PLAIN
- `createMailer()` uses `SMTPPool` automatically when `pool: true`

### Fixed

- CRAM-MD5 stub now fully implemented

## [0.1.0] — 2026-05-29

Initial release.
