import { build } from 'bun'

const entrypoints = [
  'src/index.ts',
  'src/adapters/node.ts',
  'src/adapters/bun.ts',
  'src/adapters/deno.ts',
  'src/adapters/cf.ts',
  'src/transports/smtp.ts',
  'src/transports/resend.ts',
  'src/transports/sendgrid.ts',
  'src/transports/postmark.ts',
  'src/auth/oauth2.ts',
  'src/pool/pool.ts',
]

await build({
  entrypoints,
  outdir: './dist',
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
    'cloudflare:sockets',
  ],
})

console.log('✓ sendx built successfully')
