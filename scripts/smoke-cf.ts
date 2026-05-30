/**
 * Cloudflare Workers adapter smoke test — verifies the built CF adapter loads.
 * Run: bun scripts/smoke-cf.ts (after build)
 */
import { CloudflareAdapter } from "../dist/adapters/cf.js";

const adapter = new CloudflareAdapter({ secure: false, starttls: true });

if (adapter.secure !== false) {
  throw new Error("CloudflareAdapter secure flag not applied");
}

console.log("✓ Cloudflare adapter smoke test passed");
