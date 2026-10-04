// Lists every failing answer of a run with each counted error and its message, grouped by error code.
// Usage: bun bench/genui/failures.ts <label>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@gistui/core";
import { benchLibrary } from "./catalog";
import { GUB, HERE } from "./gub";
import { evaluate } from "./validator";
const { SCENARIOS } = (await import(join(GUB, "briefs/briefs.ts"))) as { SCENARIOS: { name: string; reqs: number }[] };
const reqs = new Map(SCENARIOS.map((b) => [b.name, b.reqs]));
const label = process.argv[2]!;
const dir = join(HERE, "raw", label);
const lib = benchLibrary();
const byCode = new Map<string, string[]>();
let fail = 0;
for (const f of readdirSync(dir).filter((f) => f.startsWith("gistui__")).sort()) {
  const brief = f.split("__")[1]!;
  const text = readFileSync(join(dir, f), "utf8");
  const v: any = evaluate(text, { reqs: reqs.get(brief) ?? 0, truncated: false });
  if (v.complete) continue;
  fail++;
  const counted = new Set(v.errs.map((e: any) => e.detail));
  const r = parse(text.replace(/<think>[\s\S]*?<\/think>/g, ""), lib);
  for (const e of r.errors) {
    if (!counted.has(`${e.stmtId ?? ""}:${e.code}`)) continue;
    const msg = `${e.code}: ${String(e.message).slice(0, 140)}`;
    (byCode.get(e.code) ?? byCode.set(e.code, []).get(e.code)!).push(`${f.slice(8, -4)} ${msg}`);
  }
  for (const e of v.errs) if (e.cls === "coverage-floor" || e.cls === "root-missing") (byCode.get(e.cls) ?? byCode.set(e.cls, []).get(e.cls)!).push(`${f.slice(8, -4)} ${e.detail}`);
}
console.log(`${label}: ${fail} failing answers`);
for (const [k, xs] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${k} (${xs.length})`);
  for (const x of xs.slice(0, 14)) console.log("  " + x);
}
