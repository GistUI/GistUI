# GistUI benchmarks

GistUI measured against OpenUI: rendering speed in a real browser, accuracy and tokens with a real
models, and bundle size. Every screen, script and answer is in this repository. The same results, with
charts, are at [gistui.com/benchmarks](https://gistui.com/benchmarks).

Last updated 2026-10-05.

---

## 1. Summary

| | OpenUI | GistUI |
|---|---:|---:|
| Main-thread time to render a streaming dashboard in Chrome | 2,204 ms | **492 ms** |
| Valid answers as the model wrote them (gpt-oss-120b, 182 answers) | 84.6% | **87.9%** |
| Valid after repair | a second model call in OpenUI Cloud, not measured | **100%**, in code, no model call |
| System prompt, same 70-component catalog | 5,017 tokens | **3,874 tokens** |
| Answer, mean | 601 tokens | **587 tokens** |
| First-load JavaScript, default components, gzip | 699 KB | **74 KB** |

- **Rendering:** 2–6× less main-thread work to render a streaming answer, across OpenUI's own sample screens (section 2).
- **Accuracy:** with gpt-oss-120b, 3.3 points more valid answers as written; 100% after the code-only repair (section 4).
  With the small gpt-5-nano, the two are even as written (22.8% against 22.3%) and the repair takes GistUI to 98.4%.
- **Tokens:** 21% fewer tokens per screen, prompt and answer together.

---

## 2. Rendering a streaming answer (`bench/render`)

How much work does the page do while an answer streams in?

- **Setup.** One React 19 page in Chrome (Playwright), production builds. OpenUI renders with its
  default library (`@openuidev/react-lang` 0.3.0, `@openuidev/react-ui` 0.16.3, its documented setup);
  GistUI with its own (`@gistui/react`, this repository). Each run loads only one of them, in a fresh page.
- **Screens.** OpenUI's seven sample screens from its own repository (`benchmarks/samples`), updated to
  its current syntax because the current library rejects parts of the originals, and matching GistUI
  versions. Both parse with zero errors. The eighth screen puts all seven in one answer.
- **Stream.** The text grows by 4 characters every 10 ms (about 100 tokens a second), or every 1 ms
  (about 1,000), on a fixed clock: a page that falls behind receives several chunks at once, as it would
  from the network.
- **Measured.** Chrome's own main-thread counters (script, layout, style, all tasks) from the first chunk
  until the screen stops changing; also first content, long tasks and frame times. Median of 3 runs.

### Normal CPU, about 100 tokens a second

| Screen | OpenUI | GistUI | GistUI needs | First content, OpenUI / GistUI |
|---|---:|---:|---:|---:|
| Simple table | 69 ms | 52 ms | **1.3× less** | 122 / 102 ms |
| Dashboard | 2,204 ms | 492 ms | **4.5× less** | 362 / 261 ms |
| Pricing page | 2,252 ms | 911 ms | **2.5× less** | 429 / 93 ms |
| All seven in one answer | 22,096 ms | 3,667 ms | **6.0× less** | 397 / 341 ms |

### CPU slowed 4× (a mid-range phone), about 100 tokens a second

| Screen | OpenUI | GistUI | GistUI needs | First content, OpenUI / GistUI |
|---|---:|---:|---:|---:|
| Simple table | 205 ms | 154 ms | **1.3× less** | 131 / 106 ms |
| Dashboard | 4,712 ms | 612 ms | **7.7× less** | 362 / 265 ms |
| Pricing page | 1,516 ms | 639 ms | **2.4× less** | 435 / 97 ms |
| All seven in one answer | 39,399 ms | 2,310 ms | **17.1× less** | 397 / 344 ms |

### Normal CPU, about 1,000 tokens a second

| Screen | OpenUI | GistUI | GistUI needs | First content, OpenUI / GistUI |
|---|---:|---:|---:|---:|
| Simple table | 60 ms | 62 ms | **same** | 21 / 13 ms |
| Chart with data | 124 ms | 78 ms | **1.6× less** | 27 / 15 ms |
| Contact form | 126 ms | 103 ms | **1.2× less** | 27 / 14 ms |
| Settings panel | 226 ms | 102 ms | **2.2× less** | 25 / 15 ms |
| Dashboard | 535 ms | 213 ms | **2.5× less** | 40 / 29 ms |
| Product page | 393 ms | 183 ms | **2.2× less** | 37 / 19 ms |
| Pricing page | 396 ms | 208 ms | **1.9× less** | 52 / 13 ms |
| All seven in one answer | 3,917 ms | 695 ms | **5.6× less** | 51 / 36 ms |

### CPU slowed 4×, about 1,000 tokens a second

| Screen | OpenUI | GistUI | GistUI needs | First content, OpenUI / GistUI |
|---|---:|---:|---:|---:|
| Simple table | 113 ms | 127 ms | **1.1× more** | 54 / 45 ms |
| Chart with data | 291 ms | 264 ms | **1.1× less** | 62 / 41 ms |
| Contact form | 197 ms | 188 ms | **same** | 54 / 53 ms |
| Settings panel | 299 ms | 180 ms | **1.7× less** | 53 / 68 ms |
| Dashboard | 710 ms | 446 ms | **1.6× less** | 39 / 43 ms |
| Product page | 863 ms | 548 ms | **1.6× less** | 56 / 46 ms |
| Pricing page | 685 ms | 393 ms | **1.7× less** | 62 / 47 ms |
| All seven in one answer | 4,492 ms | 1,269 ms | **3.5× less** | 57 / 44 ms |

**Reading these numbers.**

- GistUI needs 2–6× less main-thread work on most screens; the gap grows with the length of the answer.
  On a tiny screen the two are about the same.
- Neither library made the page janky: no task blocked it for more than a few milliseconds, and the
  worst frame was under 70 ms for both.
- GistUI shows first content sooner on every screen.
- GistUI's version of each screen is about a third shorter, so part of the difference is the format:
  less text to process.
- With a slowed CPU some totals go down: a page that falls behind receives bigger batches and renders
  fewer times. Compare the two libraries within a table, not across tables.

---

## 3. The parsers alone (`bench/render/parse.ts`)

The parser inside that work, without rendering. Each parser reads the same screens in chunks and, after
every chunk, produces an up-to-date result, as a renderer needs. OpenUI's streaming parser
(`@openuidev/lang-core` 0.3.0) returns one from `push()`; GistUI's stream builds one on `flush()`.
Times are OpenUI / GistUI for the whole screen, median of 21 runs (5 for the largest), Bun.

| Screen | Size, OpenUI / GistUI | Whole answer at once | Streamed, 4-char chunks | 10-char chunks | 40-char chunks |
|---|---:|---:|---:|---:|---:|
| Simple table | 406 / 294 | 0.1 / 0.1 ms (1.2× slower) | 1.2 / 0.4 ms (3.4× faster) | 0.5 / 0.1 ms (4.4× faster) | 0.1 / 0.1 ms (2.1× faster) |
| Chart with data | 795 / 514 | 0.1 / 0.1 ms (1.4× slower) | 2.1 / 0.4 ms (5.2× faster) | 0.8 / 0.3 ms (3.2× faster) | 0.2 / 0.1 ms (2.4× faster) |
| Contact form | 1,163 / 641 | 0.1 / 0.1 ms (1.4× faster) | 4.9 / 1.0 ms (5.0× faster) | 2.0 / 0.6 ms (3.3× faster) | 0.5 / 0.2 ms (2.5× faster) |
| Settings panel | 2,324 / 1,131 | 0.1 / 0.1 ms (1.3× faster) | 13 / 0.6 ms (23.6× faster) | 4.9 / 0.5 ms (10.0× faster) | 1.4 / 0.2 ms (7.6× faster) |
| Dashboard | 3,303 / 2,158 | 0.2 / 0.1 ms (1.1× faster) | 26 / 0.8 ms (34.0× faster) | 11 / 0.7 ms (14.9× faster) | 2.7 / 0.3 ms (9.3× faster) |
| Product page | 4,178 / 2,543 | 0.2 / 0.1 ms (1.8× faster) | 52 / 2.6 ms (20.4× faster) | 21 / 1.3 ms (16.2× faster) | 5.3 / 0.4 ms (12.3× faster) |
| Pricing page | 4,726 / 3,076 | 0.2 / 0.1 ms (1.7× faster) | 53 / 1.0 ms (56.0× faster) | 21 / 0.7 ms (31.2× faster) | 5.6 / 0.4 ms (14.0× faster) |
| All seven in one answer | 17,983 / 10,738 | 0.8 / 0.5 ms (1.6× faster) | 1,034 / 6.0 ms (172.4× faster) | 423 / 4.1 ms (103.3× faster) | 107 / 2.0 ms (53.3× faster) |

Read at once, the two parsers are about as fast. Streamed, OpenUI re-reads the whole answer on every
chunk, so its time grows with the square of the answer's length; GistUI reads each new character once.
Parsing is a small part of rendering, though: section 2 is the number that reaches a person.

An earlier version of this report quoted "130× faster streaming parse". That measurement let GistUI skip
building its result for the line still being written, so it was not like for like; it is replaced by
this table and section 2.

---

## 4. Accuracy and tokens with a real model (`bench/genui`)

**The benchmark.** [`thesysdev/generative-ui-bench`](https://github.com/thesysdev/generative-ui-bench)
at commit `fcca05a`, the benchmark behind [openui.com/benchmarks](https://www.openui.com/benchmarks),
built by Thesys, the company that makes OpenUI. GistUI was added as a format next to OpenUI Lang; nothing
else was changed.

**The task.** 46 prompts in 5 difficulty levels, from 2–3 required components (an invoice view) to
16–18 (an emergency response center). Each runs 4 times: 184 answers per format. Two GistUI requests were rate-limited by the provider, so both formats
are compared on the same 182 answers.

**The same for both formats:** the 70-component catalog, the two worked examples, the rules and the
per-group notes, and the model settings (temperature 0.7, minimal reasoning, 16,384-token limit). Only
the language differs.

**What "valid" means** (the benchmark's own definition): the answer parses, has a root, every reference
resolves and every statement is reachable, required props are present, enum values are valid, it was not
truncated, and it has at least as many components as the prompt requires. OpenUI is scored by its own
library (`@openuidev/lang-core` 0.2.16); GistUI by `bench/genui/validator.ts`, which applies the same rules
as strictly.

### gpt-oss-120b, through the Vercel AI Gateway

| Format | Valid | Partial | Blank | Validity | Prompt | Mean output | Per screen | Cost of 46 screens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GistUI, as written | 160 | 22 | 0 | 87.9% | 3,874 | 587 | 4,461 | $0.032 |
| **GistUI, after repair** | **182** | **0** | **0** | **100.0%** | 3,874 | 587 | 4,461 | $0.032 |
| OpenUI | 154 | 28 | 0 | 84.6% | 5,017 | 601 | 5,618 | $0.038 |

By screen complexity:

| Components required | Runs | OpenUI | GistUI, as written | GistUI, after repair |
|---|---:|---:|---:|---:|
| 2–3 | 40 | 95.0% | 97.5% | 100% |
| 4–6 | 38 | 97.4% | 97.4% | 100% |
| 7–9 | 40 | 90.0% | 80.0% | 100% |
| 11–13 | 32 | 59.4% | 87.5% | 100% |
| 16–18 | 32 | 75.0% | 75.0% | 100% |

- **GistUI failures, as written:** wrong argument shape 13, missing required prop 9, wrong enum value 6,
  references left dangling or unused 6, syntax 1. An answer can have more than one.
- **OpenUI failures:** invalid enum 17, signature mismatch 13, reference errors 7, unknown components 2,
  missing required prop 1.
- The OpenUI answers come from an earlier run through the same gateway, with the same prompts and
  settings (this model has no published answers on the benchmark's site). Cost per 46 screens is at the
  gateway's list price ($0.10 per million input tokens, $0.50 per million output), answer tokens only; the
  four GistUI passes, hidden reasoning included, were billed $0.18.

### gpt-5-nano, through the Vercel AI Gateway

A small, cheap model. Both formats were generated in the same session, through the same gateway, with
each format's own prompt from the benchmark (`BENCH_FORMAT=openui` sends OpenUI's).

| Format | Valid | Partial | Blank | Validity | Prompt | Mean output | Per screen | Cost of 46 screens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GistUI, as written | 42 | 142 | 0 | 22.8% | 3,874 | 605 | 4,479 | $0.020 |
| **GistUI, after repair** | **181** | **3** | **0** | **98.4%** | 3,874 | 605 | 4,479 | $0.020 |
| OpenUI | 41 | 142 | 1 | 22.3% | 5,017 | 850 | 5,867 | $0.027 |

By screen complexity:

| Components required | Runs | OpenUI | GistUI, as written | GistUI, after repair |
|---|---:|---:|---:|---:|
| 2–3 | 40 | 60.0% | 42.5% | 100% |
| 4–6 | 40 | 27.5% | 37.5% | 97.5% |
| 7–9 | 40 | 0.0% | 17.5% | 97.5% |
| 11–13 | 32 | 6.3% | 9.4% | 100% |
| 16–18 | 32 | 12.5% | 0.0% | 96.9% |

- **As written, the two formats are even**, and both are weak: this model often defines a section and
  never places it, or refers to one it never wrote (GistUI 117 answers, OpenUI 129).
- **GistUI answers are 29% shorter** (605 tokens against 850), and no GistUI screen came out blank.
- **The repair takes GistUI to 98.4%.** The 3 it cannot fix have too few components for the brief (2 of
  18, for one): code cannot add what the model never wrote.
- Cost per 46 screens is at the gateway's list price ($0.05 per million input tokens, $0.40 per million
  output), answer tokens only. The run was billed $0.05 (GistUI) and $0.07 (OpenUI). The gateway's free
  tier allows 5 requests a minute per provider; `BENCH_RPM` and `BENCH_GATEWAY_PROVIDERS` pace the run.

### The repair (`@gistui/core`, `autofix`)

Plain code with no model call. It fixes each error where it points and parses again, for up to 6
rounds, and lists every change. OpenUI also repairs, with a second model call in OpenUI Cloud; its
benchmark does not include that step, so the OpenUI numbers here are as the model wrote them.

| Model mistake | Fix |
|---|---|
| Unknown prop, extra argument | Removed |
| Invalid value on an optional prop | Removed, so the default applies |
| Invalid value on a required prop | Closest allowed value |
| Missing required id or name | Filled from the call's own text or its id |
| Reference that misses a statement by case or one letter (`MetricsRow`, `incidentsTable`) | Points at that statement |
| Reference to something never defined | The reference is removed |
| A section defined but never used | Added to the root's children |
| A data table defined but never used | Shown in a Table on the root |
| A table written inside a call (`Table(\|A\|B\|, \|1\|2\|)`) | Moved to its own statement, every row kept |
| Curly quotes used as quotes, a component named without `()` | Read as meant |
| Unknown component | Renamed when it is clearly a typo; otherwise a plain container that keeps its children |
| A component whose required data is missing, a cycle | That statement is removed |

With gpt-oss-120b, no repaired screen lost a component, and the repair placed 35 components the model
wrote but never put on the screen. Checking an answer takes about 0.3 ms (median); checking plus repair
1–2 ms (median), 13 ms at the slowest. It runs once, when the stream ends.

Tested on 1,159 answers from eight runs of four models, the repair makes 99.2% valid; what is left is
answers that are empty or far too short.

---

## 5. Caveats

- **Two models.** The model test uses gpt-oss-120b and gpt-5-nano; more will follow.
- **The rendering test uses each library's own components**, which is what you get by default. A different
  component library changes the numbers.
- **Randomness.** Temperature 0.7 adds a few points of noise to validity.
- **The model test checks structure, not appearance.** Its answers use the benchmark's 70-component
  catalog, not GistUI's own components.

---

## 6. Reproduce

```bash
# Rendering and parsers (no API key)
cd bench/render && bun install && bunx vite build && bunx vite preview --port 5310 &
node run.mjs && bun parse.ts && node report.mjs    # results/render.json, parse.json, RESULTS.md

# The model test (calls a paid model; BENCH_BUDGET_USD is a hard stop)
bun run bench:genui:setup
BENCH_PROVIDER=vercel AI_GATEWAY_API_KEY=… BENCH_MODEL=openai/gpt-oss-120b BENCH_LABEL=gptoss120b-v3 \
BENCH_BUDGET_USD=0.50 bun run bench:genui:run
bun run bench:genui:score gptoss120b-v3

# A model the benchmark has no OpenUI answers for: generate both formats, then score
BENCH_PROVIDER=vercel BENCH_MODEL=openai/gpt-5-nano BENCH_LABEL=gpt5nano BENCH_RPM=4 \
BENCH_GATEWAY_PROVIDERS=azure,openai BENCH_BUDGET_USD=0.30 bun run bench:genui:run
BENCH_FORMAT=openui BENCH_PROVIDER=vercel BENCH_MODEL=openai/gpt-5-nano BENCH_LABEL=gpt5nano BENCH_RPM=4 \
BENCH_GATEWAY_PROVIDERS=azure,openai BENCH_BUDGET_USD=0.30 bun run bench:genui:run
(cd bench/.cache/generative-ui-bench && node score.ts gpt5nano) && bun run bench:genui:score gpt5nano
```
