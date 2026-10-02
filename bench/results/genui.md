# GistUI on generative-ui-bench (key-free comparison)

Benchmark: [thesysdev/generative-ui-bench](https://github.com/thesysdev/generative-ui-bench) @ `fcca05a`, the benchmark behind [openui.com/benchmarks](https://www.openui.com/benchmarks). 70-component catalog, 46 briefs, 4 repeats, the six headline models (sol, opus48, kimi, gemini, qwen, muse), tokenizer o200k_base. Generated 2026-09-30 by `bun bench/genui/compare.ts`.

GistUI's numbers here come from **transcoding** every committed OpenUI output into GistUI (`bench/genui/transcode.ts`): the same screen and the same components, written the way GistUI's prompt asks. Small parts are inline, tables and chart data are pipe tables, text is a plain string and enum values are bare words. It is what the format costs for the same UI, not what a model writes. **Live runs (`bench/genui/run.ts`, reports in `bench/results/genui-live-*.md`) are the real measure of validity and output size.** Written statement for statement instead (one statement per component, as OpenUI asks), GistUI averages 1,370 output tokens.

## Tokens

| | GistUI | OpenUI Lang | A2UI v0.9 | json-render 0.19 |
|---|---:|---:|---:|---:|
| System prompt | 3,838 | 5,017 | 12,602 | 7,651 |
| Mean output per screen | 1,011 | 1,362 | 2,823 | 3,258 |
| Per task (prompt + brief + output) | 4,964 | 6,494 | 15,540 | 11,024 |
| Stream time at 50 tok/s | 20.2 s | 27.2 s | 56.5 s | 65.2 s |

- Prompt: GistUI −23.5% vs OpenUI, −69.5% vs A2UI, −49.8% vs json-render.
- Output: GistUI −25.8% vs OpenUI (same UI; +0.6% statement for statement; −30.7% with the experimental `GISTUI_BENCH_STYLE=deep`, which writes everything inside a section inline), −64.2% vs A2UI, −69% vs json-render.
- Per task: GistUI −23.6% vs OpenUI, −68.1% vs A2UI, −55% vs json-render.

## Cost per 46-screen pass (bench list prices)

| Model | GistUI | OpenUI Lang | A2UI v0.9 | json-render 0.19 |
|---|---:|---:|---:|---:|
| sol | $1.64 | $2.19 | $5.07 | $4.70 |
| opus48 | $1.70 | $2.27 | $5.85 | $4.88 |
| kimi | $1.15 | $1.52 | $3.48 | $2.91 |
| gemini | $0.31 | $0.42 | $0.94 | $0.85 |
| qwen | $0.59 | $0.78 | $1.92 | $1.46 |
| muse | $0.55 | $0.72 | $1.38 | $1.34 |

## Validity of transcoded screens (not model-written; see the live runs in `bench/results/genui-live-*.md`)

Complete: parses, has a root, every reference resolves and is reachable, required and enum props valid, not truncated, coverage floor. For GistUI this column measures the transcoder, not a model: live runs have scored well below it.

| | GistUI | OpenUI Lang | A2UI v0.9 | json-render 0.19 |
|---|---:|---:|---:|---:|
| Complete | 96.5% | 93.6% | 95.7% | 80.2% |
| Renderable | 99.9% | 99.9% | 96.8% | 99.6% |
| Runs | 1,104 | 1,104 | 1,104 | 1,104 |

OpenUI, A2UI and json-render: the committed verdicts, scored by each format's own SDK (OpenUI under lang-core 0.2.16, which also checks prop types). The openui.com page shows 96.9% / 95.6% / 82.8%. Those come from earlier scoring: OpenUI's 93.6% plus the 35 runs that fail only on prop-type checks (`signature-mismatch`) is 96.8%. Every format here is scored with one definition. GistUI: its validator on the transcoded screens, so it inherits every model mistake the transcoder can carry over; it agrees with OpenUI's verdict on 1070 of 1104 screens. Where they differ, GistUI mostly accepts a single child where OpenUI requires `[array]` (GistUI children are variadic).

## Parse speed (same 276 screens, ms for all of them)

| | OpenUI (lang-core 0.2.16) | GistUI | |
|---|---:|---:|---:|
| One-shot parse | 55 | 66 | GistUI 1.2× slower |
| Streamed, 10-char chunks | 9024 | 69 | GistUI 130.1× faster |
| Largest screen (21,137 chars), streamed | 382 | 0.98 | GistUI 391.1× faster |

One-shot, OpenUI's parser is a little faster: both take well under a millisecond per screen. Streaming is where it matters. OpenUI re-parses the whole buffer on every chunk, so its cost grows with the square of the screen size; GistUI parses each statement once. Streaming leaves a renderable state after every chunk in both: OpenUI's `push` returns a full parse result, GistUI's updates its node store. Runtime: Bun 1.3.11 on darwin/arm64.
