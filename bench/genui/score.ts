/**
 * Scores live GistUI generations (bench/genui/raw/<label>) and puts them next to the bench's
 * committed OpenUI / A2UI / json-render results for the same label (same model).
 *
 *   bun bench/genui/score.ts gemini [more labels…]   → bench/results/genui-<label>.json + a table
 *
 * A label may carry a version tag, `gemini37@v2`: its raws are a separate GistUI run (a new prompt,
 * say), compared with the bench's results for `gemini37`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { GUB, HERE, RESULTS } from "./gub";
import { systemPrompt } from "./prompt";
import { evaluate, evaluateRepaired } from "./validator";

const require = createRequire(join(GUB, "package.json"));
const { get_encoding } = require("tiktoken");
const enc = get_encoding("o200k_base");
const tok = (s: string): number => enc.encode(s).length;
const { SCENARIOS } = (await import(join(GUB, "briefs/briefs.ts"))) as { SCENARIOS: { name: string; reqs: number }[] };
const reqsOf = new Map(SCENARIOS.map((b) => [b.name, b.reqs]));

const labels = process.argv.slice(2);
if (!labels.length) {
  console.error("usage: bun bench/genui/score.ts <label> [label…]");
  process.exit(1);
}
const promptTokens = tok(systemPrompt());
mkdirSync(RESULTS, { recursive: true });

type Row = { fmt: string; scenario: string; repeat: number; renderable: boolean; complete: boolean; classes: string[]; tokens?: number | null };
for (const label of labels) {
  const dir = join(HERE, "raw", label);
  if (!existsSync(dir)) {
    console.error(`no raws in ${dir}; run bench/genui/run.ts first`);
    continue;
  }
  const truncPath = join(dir, "truncated.json");
  const truncated = new Set<string>(existsSync(truncPath) ? JSON.parse(readFileSync(truncPath, "utf8")) : []);
  const rows: (Row & { n: number; errs: unknown[] })[] = [];
  const fixedRows: (Row & { n: number; errs: unknown[] })[] = [];
  for (const f of readdirSync(dir).sort()) {
    const m = /^gistui__(.+)__r(\d+)\.txt$/.exec(f);
    if (!m || Number(m[2]) > 4 || !reqsOf.has(m[1]!)) continue;
    const id = f.replace(/\.txt$/, "");
    const text = readFileSync(join(dir, f), "utf8");
    const v = evaluate(text, { reqs: reqsOf.get(m[1]!), truncated: truncated.has(id) });
    const fx = evaluateRepaired(text, { reqs: reqsOf.get(m[1]!), truncated: truncated.has(id) });
    rows.push({ fmt: "gistui", scenario: m[1]!, repeat: Number(m[2]), tokens: tok(text), renderable: v.renderable, complete: v.complete, errs: v.errs, classes: [...new Set(v.errs.map((e) => e.cls))], n: v.n });
    fixedRows.push({ fmt: "gistui+autofix", scenario: m[1]!, repeat: Number(m[2]), tokens: tok(text), renderable: fx.renderable, complete: fx.complete, errs: fx.errs, classes: [...new Set(fx.errs.map((e) => e.cls))], n: fx.n });
  }
  writeFileSync(join(RESULTS, `genui-${label}.json`), JSON.stringify(rows, null, 1));

  // The other formats, same model, from the bench's committed results and raws.
  const base = label.split("@")[0]!;
  const theirsPath = join(GUB, "results", `results-${base}.json`);
  // Compared on the same briefs and repeats as the GistUI run (a partial run compares its subset).
  const mine = new Set(rows.map((r) => `${r.scenario}__r${r.repeat}`));
  const theirs: Row[] = (existsSync(theirsPath) ? (JSON.parse(readFileSync(theirsPath, "utf8")) as Row[]) : []).filter((r) => mine.has(`${r.scenario}__r${r.repeat}`));
  const stats = (fmt: string, list: Row[]) => {
    const rs = list.filter((r) => r.fmt === fmt && r.repeat <= 4);
    if (!rs.length) return null;
    const outs = rs.map((r) => {
      const p = join(GUB, "raw", base, `${fmt}__${r.scenario}__r${r.repeat}.txt`);
      return fmt.startsWith("gistui") ? (r.tokens ?? 0) : existsSync(p) ? tok(readFileSync(p, "utf8")) : 0;
    });
    const classes: Record<string, number> = {};
    for (const r of rs) for (const c of r.classes) classes[c] = (classes[c] ?? 0) + 1;
    return {
      runs: rs.length,
      complete: rs.filter((r) => r.complete).length / rs.length,
      renderable: rs.filter((r) => r.renderable).length / rs.length,
      output: outs.reduce((a, b) => a + b, 0) / outs.length,
      classes,
    };
  };
  const table = [["gistui", stats("gistui", rows)], ["gistui + autofix", stats("gistui+autofix", fixedRows)], ...["openui", "a2ui", "jsonrender"].map((f) => [f, stats(f, theirs)] as const)].filter(([, s]) => s);
  // The prompt this run was generated with (saved by run.ts), not today's.
  const promptFile = join(dir, "prompt.txt");
  const metaFile = join(dir, "prompt-meta.json");
  const runPrompt = existsSync(promptFile) ? tok(readFileSync(promptFile, "utf8")) : existsSync(metaFile) ? (JSON.parse(readFileSync(metaFile, "utf8")) as { tokens: number }).tokens : null;
  const promptNote = runPrompt === null ? "unrecorded" : `${runPrompt.toLocaleString("en-US")} tokens${runPrompt === promptTokens ? "" : ` (current prompt: ${promptTokens.toLocaleString("en-US")})`}`;
  const lines = [
    `${label}: GistUI prompt ${promptNote}`,
    "| format | runs | complete | renderable | mean output tokens | failure classes |",
    "|---|---:|---:|---:|---:|---|",
    ...(table as [string, NonNullable<ReturnType<typeof stats>>][]).map(
      ([fmt, s]) => `| ${fmt} | ${s.runs} | ${(s.complete * 100).toFixed(1)}% | ${(s.renderable * 100).toFixed(1)}% | ${Math.round(s.output).toLocaleString("en-US")} | ${Object.entries(s.classes).map(([k, v]) => `${k} ${v}`).join(", ")} |`,
    ),
  ];
  if (!theirs.length) lines.push(`(no committed results for "${base}" in the bench: use a bench label to compare the same model)`);
  console.log(`\n${lines.join("\n")}`);
  // A live report per label, next to the key-free one (which is transcoded, not model-written).
  const usagePath = join(dir, "usage.json");
  const billed = existsSync(usagePath) ? Object.values(JSON.parse(readFileSync(usagePath, "utf8")) as Record<string, { cost?: number }>).reduce((a, u) => a + (u.cost ?? 0), 0) : 0;
  writeFileSync(
    join(RESULTS, `genui-live-${label.replace("@", "-")}.md`),
    `# Live run: ${label}\n\nGistUI answers written by the model (\`bench/genui/raw/${label}\`), scored by \`bench/genui/score.ts\` on ${new Date().toISOString().slice(0, 10)}; the other formats are the bench's committed runs of the same model on the same briefs and repeats.${billed ? ` GistUI generation cost: $${billed.toFixed(2)}.` : ""}\n\n${lines.slice(1).join("\n")}\n\nGistUI prompt used for this run: ${promptNote} (o200k).\n`,
  );
}
enc.free();
