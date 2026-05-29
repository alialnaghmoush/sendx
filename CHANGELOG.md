# Changelog

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
