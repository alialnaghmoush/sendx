/**
 * Generate dist/index.js from src/index.ts — pure ESM re-exports without types or JSDoc.
 *
 * Bun's bundler collapses barrel re-exports incorrectly when code-splitting is enabled,
 * so we emit the runtime entry from source instead of hand-maintaining export lists.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const src = readFileSync(join(root, "src/index.ts"), "utf8");

const js = src
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/m, "")
  .replace(/export type \{[\s\S]*?\} from [^;]+;/g, "")
  .replace(/\/\*\*[\s\S]*?\*\//g, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

writeFileSync(join(root, "dist/index.js"), `${js}\n`);
