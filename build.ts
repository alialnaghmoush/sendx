import { execSync } from 'node:child_process'
import { build } from 'bun'

const entrypoints = [
  'src/detect.ts',
  'src/mailer.ts',
  'src/dkim.ts',
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
  minify: true,
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

execSync('bun scripts/generate-index-js.ts', { stdio: 'inherit' })

console.log('✓ sently built successfully')
