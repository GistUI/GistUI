/**
 * Parser benchmarks (plan §8.3, parser-only): 1/10/100-char chunks on 5 KB and 50 KB programs, plus
 * the pathological cases. Run with `bun run bench:parser`. Prints a table and writes
 * bench/results/parser.json.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStream, parse } from "../../packages/core/src/stream";
import { lib } from "../../packages/core/test/fixtures/lib";
import { bigProgram, bigStatement, dag } from "../../packages/core/test/fixtures/programs";

const here = dirname(fileURLToPath(import.meta.url));

function stream(src: string, size: number, flushEach = true) {
  const s = createStream(lib);
  for (let i = 0; i < src.length; i += size) {
    s.push(src.slice(i, i + size));
    if (flushEach) s.flush();
  }
  s.end();
}

function measure(fn: () => void, minMs = 300): { median: number; min: number; runs: number } {
  for (let i = 0; i < 5; i++) fn();
  const times: number[] = [];
  const start = performance.now();
  while (performance.now() - start < minMs || times.length < 10) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)]!, min: times[0]!, runs: times.length };
}

const cases: [string, () => void][] = [];
for (const [label, src] of [
  ["5 KB", bigProgram(5 * 1024)],
  ["16 KB", bigProgram(16 * 1024)],
  ["50 KB", bigProgram(50 * 1024)],
] as const) {
  cases.push([`${label} one-shot parse`, () => parse(src, lib)]);
  for (const size of [1, 10, 100]) cases.push([`${label} stream, ${size}-char chunks`, () => stream(src, size)]);
}
const dagSrc = dag(20);
cases.push(["shared-ref DAG, 20 levels (OpenUI: 4.75 s)", () => parse(dagSrc, lib)]);
const big = bigStatement(50 * 1024);
cases.push(["one 50 KB statement, 10-char chunks", () => stream(big, 10)]);
cases.push(["one 50 KB statement, one-shot", () => parse(big, lib)]);

const results: Record<string, { median: number; min: number; runs: number }> = {};
console.log(`${"case".padEnd(46)} ${"median".padStart(10)} ${"min".padStart(10)}`);
for (const [name, fn] of cases) {
  const r = measure(fn);
  results[name] = r;
  console.log(`${name.padEnd(46)} ${`${r.median.toFixed(3)} ms`.padStart(10)} ${`${r.min.toFixed(3)} ms`.padStart(10)}`);
}

const out = join(here, "..", "results", "parser.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ runtime: `bun ${Bun.version}`, date: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`\nwrote ${out}`);
