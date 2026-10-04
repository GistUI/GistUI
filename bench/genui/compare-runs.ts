// Validity of two runs on the answers both have so far (same briefs and repeats). Usage: bun bench/genui/compare-runs.ts <labelA> <labelB>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUB, HERE } from "./gub";
import { evaluate } from "./validator";
const { SCENARIOS } = (await import(join(GUB, "briefs/briefs.ts"))) as { SCENARIOS: { name: string; reqs: number }[] };
const reqs = new Map(SCENARIOS.map((b) => [b.name, b.reqs]));
const [a, b] = process.argv.slice(2) as [string, string];
const files = readdirSync(join(HERE, "raw", b)).filter((f) => f.startsWith("gistui__") && existsSync(join(HERE, "raw", a, f)));
const ok = (label: string, f: string) => evaluate(readFileSync(join(HERE, "raw", label, f), "utf8"), { reqs: reqs.get(f.split("__")[1]!) ?? 0 }).complete;
const va = files.filter((f) => ok(a, f)).length, vb = files.filter((f) => ok(b, f)).length;
console.log(`${files.length} answers in both: ${a} ${((va / files.length) * 100).toFixed(1)}% valid, ${b} ${((vb / files.length) * 100).toFixed(1)}% valid`);
