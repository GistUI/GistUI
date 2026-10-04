/**
 * The parsers alone, like for like, on the same screens as the browser benchmark. After every chunk
 * each one must produce an up-to-date result: OpenUI's streaming parser returns one from push();
 * GistUI's stream builds it on flush(). Also a one-shot parse. OpenUI: @openuidev/lang-core 0.3.0 with
 * openuiLibrary; GistUI: this repository's core with the default catalog.
 *
 *   bun parse.ts → results/parse.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createStream, parse } from "../../packages/core/src/index";
import { library } from "../../packages/catalog/src/index";
const { createParser, createStreamingParser } = await import("./node_modules/@openuidev/lang-core/dist/index.mjs");
const { openuiLibrary } = await import("./node_modules/@openuidev/react-ui/dist/genui-lib/index.mjs");

const SCREENS = ["simple-table", "chart-with-data", "contact-form", "settings-panel", "dashboard", "e-commerce-product", "pricing-page", "all-seven"];
const read = (n: string, ext: string) => readFileSync(new URL(`./screens/${n}.${ext}`, import.meta.url), "utf8");
const schema = openuiLibrary.toJSONSchema();
const chunks = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const time = (fn: () => void, reps: number) => { fn(); const ts: number[] = []; for (let i = 0; i < reps; i++) { const t = performance.now(); fn(); ts.push(performance.now() - t); } return median(ts); };

const rows: any[] = [];
for (const n of SCREENS) {
  const o = read(n, "oui");
  const g = read(n, "gistui");
  const reps = n === "all-seven" ? 5 : 21;
  const row: any = { screen: n, openuiChars: o.length, gistuiChars: g.length };
  row.oneShot = { openui: time(() => createParser(schema).parse(o), reps), gistui: time(() => parse(g, library), reps) };
  for (const size of [4, 10, 40]) {
    row[`stream${size}`] = {
      openui: time(() => { const p = createStreamingParser(schema); for (const c of chunks(o, size)) p.push(c); }, reps),
      gistui: time(() => { const s = createStream(library); for (const c of chunks(g, size)) { s.push(c); s.flush(); } s.end(); }, reps),
    };
  }
  rows.push(row);
  const f = (k: string) => `${row[k].openui.toFixed(2)} vs ${row[k].gistui.toFixed(2)} ms (${(row[k].openui / row[k].gistui).toFixed(1)}×)`;
  console.log(`${n.padEnd(19)} one-shot ${f("oneShot")} | 4-char ${f("stream4")} | 10-char ${f("stream10")} | 40-char ${f("stream40")}`);
}
const sum = (k: string, lib: "openui" | "gistui") => rows.reduce((s, r) => s + r[k][lib], 0);
for (const k of ["oneShot", "stream4", "stream10", "stream40"]) console.log(`TOTAL ${k.padEnd(9)} OpenUI ${sum(k, "openui").toFixed(1)} ms, GistUI ${sum(k, "gistui").toFixed(1)} ms → ${(sum(k, "openui") / sum(k, "gistui")).toFixed(1)}×`);
writeFileSync(new URL("./results/parse.json", import.meta.url), JSON.stringify({ date: new Date().toISOString(), runtime: `Bun ${Bun.version}`, rows }, null, 2));
