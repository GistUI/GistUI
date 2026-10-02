/**
 * Bundle size against the release gates (plan §1), as an app would ship it: minified, gzipped,
 * React and React DOM external, lazy chunks split out.
 *
 * - Runtime: `@gistui/core` + `@gistui/react` (`<GistUI>`, no components). Gate ≤ 33 KB.
 * - Default UI first load: `@gistui/react/ui` JavaScript, without lazy chunks. Gate ≤ 75 KB (like the
 *   plan's OpenUI baseline, JS only; the stylesheet is reported next to it).
 *
 * The gates were 25 and 60 KB until 2026-10-02. The security review added tool separation, limits,
 * the URL policy, lenient parsing and diagnostics to the core (24.1 → 32.0 KB, 59.9 → 73.7 KB), and
 * the gates were raised to that. For scale, measured the same way: OpenUI's runtime is 16.2 KB and
 * its default components 698.9 KB on first load.
 *
 * Usage: bun scripts/size.ts [--json]   (exits 1 when a gate is exceeded)
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
// Inside the playground, which depends on the published entry points like an app would.
const TMP = join(ROOT, "apps", "playground", "node_modules", ".cache", "gistui-size");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const gz = (b: Uint8Array | string) => gzipSync(b, { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function measure(name: string, source: string) {
  const entry = join(TMP, `${name}.ts`);
  writeFileSync(entry, source);
  const out = await Bun.build({
    entrypoints: [entry],
    outdir: join(TMP, name),
    minify: true,
    splitting: true,
    target: "browser",
    format: "esm",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    conditions: ["gistui-source"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!out.success) throw new Error(out.logs.join("\n"));
  let initial = 0;
  let lazy = 0;
  const chunks: { file: string; gzip: number; kind: string }[] = [];
  // Chunks the entry imports statically load up front; dynamic-import chunks load on demand.
  const entryOut = out.outputs.find((o) => o.kind === "entry-point")!;
  const statics = new Set<string>();
  const visit = (path: string) => {
    if (statics.has(path)) return;
    statics.add(path);
    const code = readFileSync(path, "utf8");
    for (const m of code.matchAll(/(?:^|[;}\s])import\s*(?:[^"'()]*?from\s*)?["'](\.\/[^"']+)["']/g)) visit(join(path, "..", m[1]!));
  };
  visit(entryOut.path);
  for (const o of out.outputs) {
    if (!o.path.endsWith(".js")) continue;
    const size = gz(readFileSync(o.path));
    const isInitial = statics.has(o.path);
    if (isInitial) initial += size;
    else lazy += size;
    chunks.push({ file: o.path.slice(TMP.length + 1), gzip: size, kind: isInitial ? "initial" : "lazy" });
  }
  return { initial, lazy, chunks };
}

const runtime = await measure("runtime", `export { GistUI } from "@gistui/react";\n`);
const ui = await measure("ui", `export { GistUI } from "@gistui/react";\nexport { ui } from "@gistui/react/ui";\n`);
const css = gz(readFileSync(join(ROOT, "packages/styles/src/styles.css")));

const gates = [
  { name: "Runtime (core + React renderer), gzip", value: runtime.initial, limit: 33 * 1024 },
  { name: "Default UI first load, JS gzip", value: ui.initial, limit: 75 * 1024 },
];
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ runtime, ui, css, gates }, null, 1));
} else {
  for (const g of gates) console.log(`${g.value <= g.limit ? "✓" : "✗"} ${g.name}: ${kb(g.value)} (gate ${kb(g.limit)})`);
  console.log(`  + CSS ${kb(css)} (one stylesheet, all components) → ${kb(ui.initial + css)} with CSS`);
  console.log(`  lazy chunks (loaded on demand): ${kb(ui.lazy)} in ${ui.chunks.filter((c) => c.kind === "lazy").length} files`);
  for (const c of ui.chunks.sort((a, b) => b.gzip - a.gzip).slice(0, 8)) console.log(`    ${c.kind.padEnd(7)} ${kb(c.gzip).padStart(8)}  ${c.file}`);
}
rmSync(TMP, { recursive: true, force: true });
process.exit(gates.every((g) => g.value <= g.limit) ? 0 : 1);
