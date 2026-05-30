/**
 * Deno smoke test — imports built dist subpaths (no Node-only APIs).
 * Run: deno run --allow-read scripts/smoke-deno.ts
 */
import { createMailer } from "../dist/mailer.js";
import { ResendTransport } from "../dist/transports/resend.js";
import { detectRuntime } from "../dist/detect.js";

const runtime = detectRuntime();
if (runtime !== "deno") {
  console.warn(`Expected detectRuntime() === "deno", got "${runtime}"`);
}

const mailer = await createMailer({
  transport: new ResendTransport({ apiKey: "re_smoke_test" }),
});

if (typeof mailer.send !== "function") {
  throw new Error("mailer.send is not a function");
}

console.log(`✓ Deno smoke test passed (runtime: ${runtime})`);
