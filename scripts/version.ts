/**
 * Sets one version on every package (they release together) and on the README badge.
 *
 *   bun run bump 0.2.0
 *
 * Then update CHANGELOG.md, commit and push to main: the Release workflow publishes a version that
 * is not on npm yet.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const next = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error("usage: bun run bump <version>   (for example 0.2.0 or 0.2.0-beta.1)");
  process.exit(1);
}

let from = "";
for (const dir of readdirSync(join(ROOT, "packages")).sort()) {
  const file = join(ROOT, "packages", dir, "package.json");
  const text = readFileSync(file, "utf8");
  const current = (JSON.parse(text) as { version: string }).version;
  from ||= current;
  // Only the package's own version line: dependencies stay `workspace:*`.
  writeFileSync(file, text.replace(`"version": "${current}"`, `"version": "${next}"`));
  console.log(`packages/${dir}: ${current} -> ${next}`);
}

const readme = join(ROOT, "README.md");
const text = readFileSync(readme, "utf8");
const badge = text.replaceAll(`version-${from.replaceAll("-", "--")}-`, `version-${next.replaceAll("-", "--")}-`).replaceAll(`alt="Version ${from}"`, `alt="Version ${next}"`);
if (badge !== text) {
  writeFileSync(readme, badge);
  console.log(`README.md badge: ${from} -> ${next}`);
}
console.log("\nNext: add the version to CHANGELOG.md, commit, and push to main.");
