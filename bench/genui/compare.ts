/**
 * GistUI vs OpenUI Lang, Google A2UI and Vercel json-render on generative-ui-bench (the benchmark
 * behind openui.com/benchmarks), using only what needs no API key:
 *
 * 1. System prompt tokens: each format's prompt from its own generator, same catalog and examples.
 * 2. Output tokens per screen: every committed raw of the six headline models (46 briefs × 4
 *    repeats), plus GistUI transcoded from the OpenUI raws: the same UI, same components, written
 *    the way GistUI's prompt asks (idioms), and statement for statement (literal).
 * 3. Validity: the committed verdicts, and GistUI's verdict on each transcoded raw (indicative only;
 *    real validity needs live generations: bench/genui/run.ts).
 * 4. Parse speed: OpenUI's parser (lang-core 0.2.16, the scorer of record) vs GistUI's, one-shot
 *    and streamed in 10-character chunks, on the same screens.
 *
 * Usage: bun bench/genui/compare.ts            → bench/results/genui.json + genui.md
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createStream, parse } from "@gistui/core";
import { benchLibrary } from "./catalog";
import { GUB, HEADLINE, RESULTS } from "./gub";
import { systemPrompt as gistPrompt } from "./prompt";
import { ALL_IDIOMS, transcode } from "./transcode";
import { evaluate } from "./validator";

const require = createRequire(join(GUB, "package.json"));
const { get_encoding } = require("tiktoken");
const openuiCore = require("@openuidev/lang-core");
const enc = get_encoding("o200k_base");
const tok = (s: string): number => enc.encode(s).length;

const { systemPrompt: openuiPrompt } = await import(join(GUB, "protocols/openui/prompt.ts"));
const { systemPrompt: jrPrompt } = await import(join(GUB, "protocols/jsonrender/prompt.ts"));
const { LIBRARY: OPENUI_LIBRARY } = await import(join(GUB, "protocols/openui/catalog.ts"));
const { SCENARIOS } = await import(join(GUB, "briefs/briefs.ts"));

type Fmt = "gistui" | "openui" | "a2ui" | "jsonrender";
const FORMATS: Fmt[] = ["gistui", "openui", "a2ui", "jsonrender"];
const NAMES: Record<Fmt, string> = { gistui: "GistUI", openui: "OpenUI Lang", a2ui: "A2UI v0.9", jsonrender: "json-render 0.19" };
const reqsOf = new Map<string, number>(SCENARIOS.map((b: { name: string; reqs: number }) => [b.name, b.reqs]));
const briefTokens = SCENARIOS.reduce((s: number, b: { prompt: string }) => s + tok(b.prompt), 0) / SCENARIOS.length;

// 1. Prompts ------------------------------------------------------------------------------------
const prompts: Record<Fmt, number> = {
  gistui: tok(gistPrompt()),
  openui: tok(openuiPrompt()),
  jsonrender: tok(jrPrompt()),
  a2ui: tok(readFileSync(join(GUB, "protocols/a2ui/system-prompt.txt"), "utf8")),
};

// 2 + 3. Outputs and validity ---------------------------------------------------------------------
type Row = { fmt: string; scenario: string; repeat: number; renderable: boolean; complete: boolean };
const outputs: Record<Fmt, number[]> = { gistui: [], openui: [], a2ui: [], jsonrender: [] };
const validity: Record<Fmt, { n: number; complete: number; renderable: number }> = {
  gistui: { n: 0, complete: 0, renderable: 0 },
  openui: { n: 0, complete: 0, renderable: 0 },
  a2ui: { n: 0, complete: 0, renderable: 0 },
  jsonrender: { n: 0, complete: 0, renderable: 0 },
};
const perModel: Record<string, Partial<Record<Fmt, { n: number; complete: number; out: number }>>> = {};
let agree = 0;
let compared = 0;
const corpus: { openui: string; gistui: string }[] = [];
const literal = { tokens: [] as number[], complete: 0, n: 0 };
const deepTokens: number[] = [];

for (const model of HEADLINE) {
  const dir = join(GUB, "raw", model);
  const truncPath = join(dir, "truncated.json");
  const truncated = new Set<string>(existsSync(truncPath) ? JSON.parse(readFileSync(truncPath, "utf8")) : []);
  const rows: Row[] = JSON.parse(readFileSync(join(GUB, "results", `results-${model}.json`), "utf8"));
  const verdict = new Map(rows.map((r) => [`${r.fmt}__${r.scenario}__r${r.repeat}`, r]));
  const pm = (perModel[model] = {} as Partial<Record<Fmt, { n: number; complete: number; out: number }>>);
  for (const f of readdirSync(dir).sort()) {
    const m = /^(openui|jsonrender|a2ui)__(.+)__r(\d+)\.txt$/.exec(f);
    if (!m || Number(m[3]) > 4 || !reqsOf.has(m[2]!)) continue;
    const fmt = m[1] as Fmt;
    const id = f.replace(/\.txt$/, "");
    const text = readFileSync(join(dir, f), "utf8");
    const v = verdict.get(id);
    outputs[fmt].push(tok(text));
    const bucket = (pm[fmt] ??= { n: 0, complete: 0, out: 0 });
    bucket.n++;
    bucket.out += tok(text);
    if (v) {
      validity[fmt].n++;
      if (v.complete) (validity[fmt].complete++, bucket.complete++);
      if (v.renderable) validity[fmt].renderable++;
    }
    if (fmt !== "openui") continue;
    // The same screen in GistUI: statement for statement, and in GistUI's idioms.
    const lit = transcode(text);
    literal.tokens.push(tok(lit));
    literal.n++;
    if (evaluate(lit, { reqs: reqsOf.get(m[2]!), truncated: truncated.has(id) }).complete) literal.complete++;
    const g = transcode(text, ALL_IDIOMS);
    deepTokens.push(tok(transcode(text, { ...ALL_IDIOMS, deep: true })));
    corpus.push({ openui: text, gistui: g });
    outputs.gistui.push(tok(g));
    const gv = evaluate(g, { reqs: reqsOf.get(m[2]!), truncated: truncated.has(id) });
    const gb = (pm.gistui ??= { n: 0, complete: 0, out: 0 });
    gb.n++;
    gb.out += tok(g);
    validity.gistui.n++;
    if (gv.complete) (validity.gistui.complete++, gb.complete++);
    if (gv.renderable) validity.gistui.renderable++;
    if (v) {
      compared++;
      if (v.complete === gv.complete) agree++;
    }
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const outMean = Object.fromEntries(FORMATS.map((f) => [f, mean(outputs[f])])) as Record<Fmt, number>;

// Cost per 46-screen pass at the bench's own list prices (tools/cost-estimate.ts).
const priceSrc = readFileSync(join(GUB, "tools/cost-estimate.ts"), "utf8");
const PRICE = Object.fromEntries(
  [...priceSrc.matchAll(/^\s+(\w+): \{ in: ([\d.e-]+), out: ([\d.e-]+) \}/gm)].map((m) => [m[1]!, { in: Number(m[2]), out: Number(m[3]) }]),
) as Record<string, { in: number; out: number }>;
const costPerPass = (fmt: Fmt, model: string) => {
  const p = PRICE[model];
  const b = perModel[model]?.[fmt];
  if (!p || !b?.n) return NaN;
  const out = b.out / b.n;
  return SCENARIOS.length * ((prompts[fmt] + briefTokens + 20) * p.in + out * p.out);
};

// 4. Parse speed ----------------------------------------------------------------------------------
const openuiParser = openuiCore.createParser(OPENUI_LIBRARY.toJSONSchema());
const gistLib = benchLibrary();
const time = (fn: () => void, reps: number) => {
  fn(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - t0) / reps;
};
const chunks = (s: string, n: number) => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
};
const sample = corpus.filter((_, i) => i % 4 === 0); // every 4th screen: ~276 screens
const speed = {
  screens: sample.length,
  oneShot: {
    openui: time(() => sample.forEach((c) => openuiParser.parse(c.openui)), 5),
    gistui: time(() => sample.forEach((c) => parse(c.gistui, gistLib)), 5),
  },
  stream10: {
    openui: time(() => {
      for (const c of sample) {
        const p = openuiCore.createStreamingParser(OPENUI_LIBRARY.toJSONSchema());
        for (const ch of chunks(c.openui, 10)) p.push(ch);
      }
    }, 1),
    gistui: time(() => {
      for (const c of sample) {
        const s = createStream(gistLib);
        for (const ch of chunks(c.gistui, 10)) s.push(ch);
        s.end();
      }
    }, 3),
  },
};
const largest = [...corpus].sort((a, b) => b.openui.length - a.openui.length)[0]!;
const bigScreen = {
  chars: largest.openui.length,
  openui: time(() => {
    const p = openuiCore.createStreamingParser(OPENUI_LIBRARY.toJSONSchema());
    for (const ch of chunks(largest.openui, 10)) p.push(ch);
  }, 3),
  gistui: time(() => {
    const s = createStream(gistLib);
    for (const ch of chunks(largest.gistui, 10)) s.push(ch);
    s.end();
  }, 10),
};

// Report ------------------------------------------------------------------------------------------
const pct = (a: number, b: number) => `${a < b ? "−" : "+"}${Math.abs(Math.round((1 - a / b) * 1000) / 10)}%`;
const fmtN = (n: number) => Math.round(n).toLocaleString("en-US");
const ratio = (a: number, b: number) => (a >= b ? `${(a / b).toFixed(1)}× faster` : `${(b / a).toFixed(1)}× slower`);
const ms = (n: number) => (n < 10 ? n.toFixed(2) : n.toFixed(0));
const report = {
  date: new Date().toISOString(),
  bench: { repo: "thesysdev/generative-ui-bench", commit: "fcca05af68dc3acc5b04660531509b4aed861c7e", tokenizer: "o200k_base", models: HEADLINE, screens: validity.openui.n },
  prompts,
  outputMean: outMean,
  perTask: Object.fromEntries(FORMATS.map((f) => [f, prompts[f] + briefTokens + 20 + outMean[f]])),
  streamSecondsAt50: Object.fromEntries(FORMATS.map((f) => [f, outMean[f] / 50])),
  validity,
  transcodeAgreement: { compared, agree },
  literal: { output: mean(literal.tokens), complete: literal.complete / literal.n },
  deep: { output: mean(deepTokens) },
  costPerPass: Object.fromEntries(HEADLINE.map((m) => [m, Object.fromEntries(FORMATS.map((f) => [f, costPerPass(f, m)]))])),
  perModel,
  parseMs: { ...speed, bigScreen },
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(join(RESULTS, "genui.json"), JSON.stringify(report, null, 1));

const v = (f: Fmt) => validity[f];
const md = `# GistUI on generative-ui-bench (key-free comparison)

Benchmark: [thesysdev/generative-ui-bench](https://github.com/thesysdev/generative-ui-bench) @ \`fcca05a\`, the benchmark behind [openui.com/benchmarks](https://www.openui.com/benchmarks). 70-component catalog, 46 briefs, 4 repeats, the six headline models (${HEADLINE.join(", ")}), tokenizer o200k_base. Generated ${report.date.slice(0, 10)} by \`bun bench/genui/compare.ts\`.

GistUI's numbers here come from **transcoding** every committed OpenUI output into GistUI (\`bench/genui/transcode.ts\`): the same screen and the same components, written the way GistUI's prompt asks. Small parts are inline, tables and chart data are pipe tables, text is a plain string and enum values are bare words. It is what the format costs for the same UI, not what a model writes. **Live runs (\`bench/genui/run.ts\`, reports in \`bench/results/genui-live-*.md\`) are the real measure of validity and output size.** Written statement for statement instead (one statement per component, as OpenUI asks), GistUI averages ${fmtN(report.literal.output)} output tokens.

## Tokens

| | ${FORMATS.map((f) => NAMES[f]).join(" | ")} |
|---|${FORMATS.map(() => "---:").join("|")}|
| System prompt | ${FORMATS.map((f) => fmtN(prompts[f])).join(" | ")} |
| Mean output per screen | ${FORMATS.map((f) => fmtN(outMean[f])).join(" | ")} |
| Per task (prompt + brief + output) | ${FORMATS.map((f) => fmtN(report.perTask[f]!)).join(" | ")} |
| Stream time at 50 tok/s | ${FORMATS.map((f) => `${(outMean[f] / 50).toFixed(1)} s`).join(" | ")} |

- Prompt: GistUI ${pct(prompts.gistui, prompts.openui)} vs OpenUI, ${pct(prompts.gistui, prompts.a2ui)} vs A2UI, ${pct(prompts.gistui, prompts.jsonrender)} vs json-render.
- Output: GistUI ${pct(outMean.gistui, outMean.openui)} vs OpenUI (same UI; ${pct(report.literal.output, outMean.openui)} statement for statement; ${pct(report.deep.output, outMean.openui)} with the experimental \`GISTUI_BENCH_STYLE=deep\`, which writes everything inside a section inline), ${pct(outMean.gistui, outMean.a2ui)} vs A2UI, ${pct(outMean.gistui, outMean.jsonrender)} vs json-render.
- Per task: GistUI ${pct(report.perTask.gistui!, report.perTask.openui!)} vs OpenUI, ${pct(report.perTask.gistui!, report.perTask.a2ui!)} vs A2UI, ${pct(report.perTask.gistui!, report.perTask.jsonrender!)} vs json-render.

## Cost per 46-screen pass (bench list prices)

| Model | ${FORMATS.map((f) => NAMES[f]).join(" | ")} |
|---|${FORMATS.map(() => "---:").join("|")}|
${HEADLINE.map((m) => `| ${m} | ${FORMATS.map((f) => `$${report.costPerPass[m]![f]!.toFixed(2)}`).join(" | ")} |`).join("\n")}

## Validity of transcoded screens (not model-written; see the live runs in \`bench/results/genui-live-*.md\`)

Complete: parses, has a root, every reference resolves and is reachable, required and enum props valid, not truncated, coverage floor. For GistUI this column measures the transcoder, not a model: live runs have scored well below it.

| | ${FORMATS.map((f) => NAMES[f]).join(" | ")} |
|---|${FORMATS.map(() => "---:").join("|")}|
| Complete | ${FORMATS.map((f) => `${((v(f).complete / v(f).n) * 100).toFixed(1)}%`).join(" | ")} |
| Renderable | ${FORMATS.map((f) => `${((v(f).renderable / v(f).n) * 100).toFixed(1)}%`).join(" | ")} |
| Runs | ${FORMATS.map((f) => fmtN(v(f).n)).join(" | ")} |

OpenUI, A2UI and json-render: the committed verdicts, scored by each format's own SDK (OpenUI under lang-core 0.2.16, which also checks prop types). The openui.com page shows 96.9% / 95.6% / 82.8%. Those come from earlier scoring: OpenUI's 93.6% plus the 35 runs that fail only on prop-type checks (\`signature-mismatch\`) is 96.8%. Every format here is scored with one definition. GistUI: its validator on the transcoded screens, so it inherits every model mistake the transcoder can carry over; it agrees with OpenUI's verdict on ${agree} of ${compared} screens. Where they differ, GistUI mostly accepts a single child where OpenUI requires \`[array]\` (GistUI children are variadic).

## Parse speed (same ${speed.screens} screens, ms for all of them)

| | OpenUI (lang-core 0.2.16) | GistUI | |
|---|---:|---:|---:|
| One-shot parse | ${ms(speed.oneShot.openui)} | ${ms(speed.oneShot.gistui)} | GistUI ${ratio(speed.oneShot.openui, speed.oneShot.gistui)} |
| Streamed, 10-char chunks | ${ms(speed.stream10.openui)} | ${ms(speed.stream10.gistui)} | GistUI ${ratio(speed.stream10.openui, speed.stream10.gistui)} |
| Largest screen (${fmtN(bigScreen.chars)} chars), streamed | ${ms(bigScreen.openui)} | ${ms(bigScreen.gistui)} | GistUI ${ratio(bigScreen.openui, bigScreen.gistui)} |

One-shot, OpenUI's parser is a little faster: both take well under a millisecond per screen. Streaming is where it matters. OpenUI re-parses the whole buffer on every chunk, so its cost grows with the square of the screen size; GistUI parses each statement once. Streaming leaves a renderable state after every chunk in both: OpenUI's \`push\` returns a full parse result, GistUI's updates its node store. Runtime: Bun ${process.versions.bun ?? ""} on ${process.platform}/${process.arch}.
`;
writeFileSync(join(RESULTS, "genui.md"), md);
console.log(md);
enc.free();
