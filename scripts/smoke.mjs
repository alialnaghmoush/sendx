// ESM top-level await — works reliably with Node.js 16+
const mod = await import('../dist/index.js')
const exports = Object.keys(mod)
if (exports.length === 0) throw new Error('No exports found')
console.log(`✓ smoke test passed — ${exports.length} exports: ${exports.join(', ')}`)
