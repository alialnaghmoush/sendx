import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { build } from 'bun'

const entrypoints = [
  'src/detect.ts',
  'src/core/smtp.ts',
  'src/adapters/node.ts',
  'src/adapters/bun.ts',
  'src/adapters/deno.ts',
  'src/adapters/cf.ts',
  'src/transports/smtp.ts',
  'src/transports/resend.ts',
  'src/transports/sendgrid.ts',
  'src/transports/postmark.ts',
  'src/transports/mailgun.ts',
  'src/transports/ses.ts',
  'src/transports/brevo.ts',
  'src/transports/preview.ts',
  'src/transports/retry.ts',
  'src/plugins/template.ts',
  'src/auth/oauth2.ts',
  'src/pool/pool.ts',
]

await build({
  entrypoints,
  outdir: './dist',
  root: './src',
  target: 'node',
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  minify: false,
  external: [
    'node:net',
    'node:tls',
    'node:dns',
    'node:dns/promises',
    'node:fs/promises',
    'node:path',
    'node:child_process',
    'cloudflare:sockets',
  ],
})

execSync('./node_modules/.bin/tsc --emitDeclarationOnly --outDir dist', {
  stdio: 'inherit',
})

// Bun's code-splitting barrel for src/index.ts emits broken re-exports; write the entry manually.
writeFileSync(
  './dist/index.js',
  `export { GOOGLE_TOKEN_URL, MICROSOFT_TOKEN_URL, OAuth2Client } from "./auth/oauth2.js";
export { SMTPError } from "./core/smtp.js";
export { createMailer, detectRuntime } from "./detect.js";
export { simpleEngine, templatePlugin } from "./plugins/template.js";
export { SMTPPool } from "./pool/pool.js";
export { BrevoError, BrevoTransport } from "./transports/brevo.js";
export { MailgunError, MailgunTransport } from "./transports/mailgun.js";
export { PostmarkError, PostmarkTransport } from "./transports/postmark.js";
export { PreviewTransport } from "./transports/preview.js";
export { ResendError, ResendTransport } from "./transports/resend.js";
export { RetryTransport } from "./transports/retry.js";
export { SendGridError, SendGridTransport } from "./transports/sendgrid.js";
export { SESError, SESTransport } from "./transports/ses.js";
export { SMTPTransport } from "./transports/smtp.js";
`,
)

console.log('✓ sently built successfully')
