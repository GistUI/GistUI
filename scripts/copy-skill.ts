/**
 * Copies the agent skill (skills/gistui: SKILL.md and the generated reference.md) into
 * packages/catalog/skills, so `@gistui/catalog` ships it and a coding agent can read it from
 * node_modules after an install. Runs as the catalog's `prepack`; the copy is git-ignored.
 */

import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const from = join(import.meta.dir, "../skills");
const to = join(import.meta.dir, "../packages/catalog/skills");
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`copied ${from} to ${to}`);
