#!/usr/bin/env bun
/**
 * Publish sendx to npm and/or JSR.
 *
 * Usage:
 *   bun scripts/publish.ts [--dry-run]           # npm + JSR
 *   bun scripts/publish.ts --npm [--dry-run]     # npm only
 *   bun scripts/publish.ts --jsr [--dry-run]   # JSR only
 *
 * Dry runs pass --allow-dirty to JSR automatically (uncommitted tree OK).
 * Real publishes require a clean git state unless you pass --allow-dirty.
 */

const dryRun = process.argv.includes("--dry-run");
const allowDirty = process.argv.includes("--allow-dirty") || dryRun;
const npmOnly = process.argv.includes("--npm");
const jsrOnly = process.argv.includes("--jsr");
const npmFlags = [dryRun ? "--dry-run" : ""].filter(Boolean).join(" ");
const jsrFlags = [dryRun ? "--dry-run" : "", allowDirty ? "--allow-dirty" : ""]
  .filter(Boolean)
  .join(" ");

if (npmOnly && jsrOnly) {
  console.error("Use only one of --npm or --jsr, or omit both to publish to both registries.");
  process.exit(1);
}

const publishNpm = !jsrOnly;
const publishJsr = !npmOnly;

const steps = 2 + (publishNpm ? 1 : 0) + (publishJsr ? 1 : 0);
let step = 1;

console.log(`${step}/${steps}  Running tests...`);
await run("bun test");
step += 1;

console.log(`${step}/${steps}  Building...`);
await run("bun run build");
step += 1;

if (publishNpm) {
  console.log(`${step}/${steps}  Publishing to npm...`);
  await run(`npm publish --access public ${npmFlags}`.trim());
  step += 1;
}

if (publishJsr) {
  console.log(`${step}/${steps}  Publishing to JSR...`);
  await run(`npx jsr publish ${jsrFlags}`.trim());
}

/** Spawn a shell command and exit if it fails. */
async function run(cmd: string): Promise<void> {
  const proc = Bun.spawn(cmd.trim().split(" "), { stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Command failed: ${cmd}`);
  }
}
