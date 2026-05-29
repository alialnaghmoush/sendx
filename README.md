# sently

**Runtime-agnostic email library for Node.js, Bun, Deno, and Cloudflare Workers.**

[![npm version](https://img.shields.io/npm/v/sently.svg)](https://www.npmjs.com/package/sently)
[![JSR](https://jsr.io/badges/@sently/sently)](https://jsr.io/@sently/sently)
[![bundle size](https://img.shields.io/bundlephobia/minzip/sently)](https://bundlephobia.com/package/sently)
[![license](https://img.shields.io/npm/l/sently.svg)](LICENSE)
[![tests](https://img.shields.io/badge/tests-passing-brightgreen)](#)
[![GitHub](https://img.shields.io/github/stars/alialnaghmoush/sently?style=social&label=GitHub)](https://github.com/alialnaghmoush/sently)

---

## Why sently

- **Works everywhere** — Node.js, Bun, Deno, Cloudflare Workers, and any environment with Web APIs
- **True tree-shaking** — import only what you need; unused adapters and transports stay out of your bundle
- **Zero dependencies in core** — MIME, SMTP protocol, and encoding use pure Web APIs only
- **DKIM signing** — RSA-SHA256 and Ed25519-SHA256 via Web Crypto
- **OAuth2 / XOAUTH2** — Gmail and Microsoft 365 SMTP auth with automatic token refresh
- **Connection pooling** — reuse SMTP sessions with optional rate limiting
- **TypeScript-first** — strict types, subpath exports, and full IDE support

---

## Installation

**npm** ([sently](https://www.npmjs.com/package/sently)):

```bash
bun add sently
npm install sently
pnpm add sently
```

**JSR** ([@sently/sently](https://jsr.io/@sently/sently)) — Deno, Bun, and other JSR-aware runtimes:

```bash
deno add jsr:@sently/sently
bunx jsr add @sently/sently
```

```typescript
import { createMailer } from "sently";
```

---

## Quick Start

### SMTP with auto-detected adapter

```typescript
import { createMailer } from "sently";

const mailer = await createMailer({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "you@example.com", pass: "secret" },
});

await mailer.send({
  from: "you@example.com",
  to: "recipient@example.com",
  subject: "Hello from sently",
  text: "Plain text body",
  html: "<p>HTML body</p>",
});

await mailer.close();
```

### Resend HTTP transport (Vercel Edge compatible)

```typescript
import { createMailer } from "sently";
import { ResendTransport } from "sently/transports/resend";

const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
});

await mailer.send({
  from: "onboarding@yourdomain.com",
  to: "recipient@example.com",
  subject: "Hello from the edge",
  html: "<p>Sent via Resend + sently</p>",
});
```

### Cloudflare Worker

```typescript
import { createMailer } from "sently";
import { CloudflareAdapter } from "sently/adapters/cf";

export default {
  async fetch() {
    const mailer = await createMailer({
      host: "smtp.example.com",
      port: 587,
      auth: { user: "relay@example.com", pass: "secret" },
      adapter: new CloudflareAdapter(),
    });

    await mailer.send({
      from: "relay@example.com",
      to: "user@example.com",
      subject: "From a Worker",
      text: "Hello from Cloudflare Workers",
    });

    return new Response("Sent");
  },
};
```

---

## Adapters

| Runtime | Import | Notes |
|---------|--------|-------|
| Node.js (auto) | `createMailer(config)` | Auto-detected |
| Node.js (explicit) | `sently/adapters/node` → `NodeAdapter` | Reference implementation |
| Bun (auto) | `createMailer(config)` | Auto-detected |
| Bun (explicit) | `sently/adapters/bun` → `BunAdapter` | Node compat layer |
| Deno | `sently/adapters/deno` → `DenoAdapter` | Native `Deno.startTls` |
| Cloudflare Workers | `sently/adapters/cf` → `CloudflareAdapter` | `cloudflare:sockets` |

```typescript
import { NodeAdapter } from "sently/adapters/node";

const mailer = await createMailer({
  host: "smtp.example.com",
  adapter: new NodeAdapter({ secure: false }),
  auth: { user: "you@example.com", pass: "secret" },
});
```

---

## Transports

### SMTP

```typescript
import { createMailer } from "sently";
import { SMTPTransport } from "sently/transports/smtp";
import { NodeAdapter } from "sently/adapters/node";

const transport = new SMTPTransport({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "you@example.com", pass: "secret" },
  adapter: new NodeAdapter(),
});

const mailer = await createMailer({ transport });
await mailer.verify(); // test connection + auth
```

**AUTH methods:** XOAUTH2, CRAM-MD5, LOGIN, and PLAIN (auto-negotiated from EHLO unless `auth.type` is set).

#### DKIM signing

```typescript
const mailer = await createMailer({
  host: "smtp.example.com",
  auth: { user: "you@example.com", pass: "secret" },
  dkim: {
    domainName: "example.com",
    keySelector: "2024",
    privateKey: await Bun.file("dkim-private.pem").text(),
  },
});
```

#### Gmail OAuth2 (XOAUTH2)

```typescript
import { OAuth2Client } from "sently/auth/oauth2";

const mailer = await createMailer({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    type: "OAUTH2",
    user: "me@gmail.com",
    oauth2: {
      user: "me@gmail.com",
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
    },
  },
});
```

#### Connection pooling

```typescript
const mailer = await createMailer({
  host: "smtp.example.com",
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 10,
  rateLimit: 1000,
  auth: { user: "you@example.com", pass: "secret" },
});
```

Or use `SMTPPool` directly:

```typescript
import { SMTPPool } from "sently/pool";

const pool = new SMTPPool({
  host: "smtp.example.com",
  adapter: new NodeAdapter(),
  auth: { user: "you@example.com", pass: "secret" },
});
```

### HTTP APIs

#### Resend

```typescript
import { ResendTransport } from "sently/transports/resend";

const transport = new ResendTransport({ apiKey: "re_..." });
```

#### SendGrid

```typescript
import { SendGridTransport } from "sently/transports/sendgrid";

const transport = new SendGridTransport({ apiKey: "SG...." });
```

#### Postmark

```typescript
import { PostmarkTransport } from "sently/transports/postmark";

const transport = new PostmarkTransport({ serverToken: "..." });
```

---

## MailOptions Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | `AddressInput` | *required* | Sender address |
| `to` | `AddressInput` | *required* | Recipients |
| `cc` | `AddressInput` | — | CC recipients (visible in headers) |
| `bcc` | `AddressInput` | — | BCC recipients (envelope only, not in headers) |
| `replyTo` | `AddressInput` | — | Reply-To header |
| `subject` | `string` | *required* | Email subject (RFC 2047 for non-ASCII) |
| `text` | `string` | — | Plain text body |
| `html` | `string` | — | HTML body |
| `attachments` | `Attachment[]` | — | File attachments |
| `headers` | `Record<string, string>` | — | Custom headers |
| `messageId` | `string` | auto | Message-ID header |
| `date` | `Date` | now | Date header |
| `priority` | `'high' \| 'normal' \| 'low'` | — | X-Priority / Importance |
| `encoding` | `'utf-8' \| 'ascii'` | `'utf-8'` | Character encoding hint |

---

## Attachments

### In-memory (all runtimes)

```typescript
await mailer.send({
  from: "you@example.com",
  to: "user@example.com",
  subject: "With attachment",
  text: "See attached",
  attachments: [
    {
      filename: "report.pdf",
      content: pdfBytes, // Uint8Array
      contentType: "application/pdf",
    },
  ],
});
```

### File path (Node.js / Bun / Deno only)

```typescript
attachments: [
  {
    filename: "report.pdf",
    path: "/path/to/report.pdf",
  },
],
```

On Cloudflare Workers and browsers, use `content: Uint8Array` — `attachment.path` is not supported.

---

## Tree-Shaking

Each import path is a separate build entry point:

```
import { createMailer } from "sently"
+ import { ResendTransport } from "sently/transports/resend"
→ Bundle: core/mime (~8KB) + core/address (~2KB) + transports/resend (~2KB) ≈ ~12KB gzip

vs. full Nodemailer: ~220KB
```

Only code you import is bundled. Adapters and transports you never import are never included.

---

## Migrating from Nodemailer

| Nodemailer | sently |
|------------|-------|
| `nodemailer.createTransport({...})` | `await createMailer({...})` |
| `transporter.sendMail(options)` | `mailer.send(options)` |
| `transporter.verify()` | `mailer.verify()` |
| `options.attachments[].path` | Same (Node/Bun/Deno); use `content` on edge |
| `import nodemailer from 'nodemailer'` | `import { createMailer } from 'sently'` |
| CommonJS | ESM only |
| Node.js only | Node, Bun, Deno, CF Workers |

---

## Bundle Size

Approximate gzip sizes per subpath export:

| Export | ~gzip |
|--------|-------|
| `sently` | ~6 KB |
| `sently/transports/smtp` | ~10 KB |
| `sently/transports/resend` | ~2 KB |
| `sently/transports/sendgrid` | ~2 KB |
| `sently/transports/postmark` | ~2 KB |
| `sently/adapters/node` | ~3 KB |
| `sently/adapters/bun` | ~3 KB |
| `sently/adapters/deno` | ~2 KB |
| `sently/adapters/cf` | ~2 KB |

---

## Links

- **Source & issues:** [github.com/alialnaghmoush/sently](https://github.com/alialnaghmoush/sently)
- **npm:** [npmjs.com/package/sently](https://www.npmjs.com/package/sently)
- **JSR:** [jsr.io/@sently/sently](https://jsr.io/@sently/sently)

## License

MIT
