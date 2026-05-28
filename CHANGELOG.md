# Changelog

## [0.2.0] — 2026-05-29

### Added

- DKIM signing (RSA-SHA256 and Ed25519-SHA256) via `SMTPConfig.dkim`
- OAuth2 / XOAUTH2 authentication via `SMTPAuth.type = 'OAUTH2'`
- Connection pooling via `SMTPConfig.pool` and `SMTPPool`
- Rate limiting via `PoolConfig.rateDelta` / `PoolConfig.rateLimit`
- CRAM-MD5 authentication (pure-JS HMAC-MD5)

### Changed

- `SMTPAuth.pass` is now optional (was required in v0.1)
- `buildMIME()` is now `async` when DKIM config is provided
- `selectAuthMethod` priority: XOAUTH2 > CRAM-MD5 > LOGIN > PLAIN
- `createMailer()` uses `SMTPPool` automatically when `pool: true`

### Fixed

- CRAM-MD5 stub now fully implemented

## [0.1.0] — 2026-05-29

Initial release.
