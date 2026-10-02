/**
 * Regenerates skills/gistui/reference.md and packages/catalog/src/render.ts (the catalog without
 * prompt text, for browsers) from the catalog. reference.md holds the exact component signatures, design
 * guide and example that go into the model's system prompt. Run: `bun run skill`.
 * A catalog test fails when the file is stale, so the skill never drifts from the real prompt.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderCatalogSource } from "../packages/catalog/src/render-gen";
import { skillReference } from "../packages/catalog/src/skill";

const out = join(import.meta.dir, "../skills/gistui/reference.md");
writeFileSync(out, skillReference());
console.log(`wrote ${out}`);
const render = join(import.meta.dir, "../packages/catalog/src/render.ts");
writeFileSync(render, renderCatalogSource());
console.log(`wrote ${render}`);
