# GistUI benchmarks

How GistUI compares with OpenUI Lang, Google A2UI and Vercel json-render on the same screens, the same catalog and the same models. Every result here is from a complete run: 46 prompts, 4 runs each, 184 answers per format.

Each GistUI result has two numbers: **raw**, which is what the model wrote, and **after autofix**, which is the same answer after GistUI's code-only repair (no model call).

Last updated 2026-10-02. The generated answers are in `bench/genui/raw/<label>/` and the per-run reports in `bench/results/`.

---

## 1. Summary

| Model (184 answers per format) | GistUI raw | **GistUI + autofix** | OpenUI | A2UI | json-render | Output tokens, GistUI vs OpenUI |
|---|---:|---:|---:|---:|---:|---:|
| gpt-oss-120b | 87.0% | **100%** | 84.2% | — | — | 526 vs 597 (−12%) |
| Gemini 3.7 Flash | 87.5% | **100%** | 98.9% | 94.0% | 92.9% | 1,443 vs 1,637 (−12%) |

- **Validity.** Raw GistUI is 2.8 points ahead of OpenUI on gpt-oss-120b and 11.4 points behind on Gemini 3.7 Flash. After autofix it is 100% on both.
- **Tokens.** GistUI's output is 12% smaller than OpenUI's on both models. Its system prompt is 3,838 tokens against 5,017, 24% smaller.
- **Cost.** A 46-screen pass on Gemini 3.7 Flash costs $0.36 with GistUI, $0.46 with OpenUI, $0.99 with A2UI and $0.92 with json-render.
- **Streaming parse.** 130–150× faster than OpenUI's parser on the same 276 screens received in 10-character chunks, and 390–420× faster on the largest screen.
- **Autofix** is plain code. It adds at most about 3 ms per screen, once, when the stream ends.
- OpenUI, A2UI and json-render numbers are raw: the benchmark has no repair step for any format.

---

## 2. What is measured

**The benchmark.** [`thesysdev/generative-ui-bench`](https://github.com/thesysdev/generative-ui-bench) at commit `fcca05a` is the benchmark behind [openui.com/benchmarks](https://www.openui.com/benchmarks), built by Thesys, the company that makes OpenUI. GistUI was added as a fourth format next to OpenUI Lang, Google A2UI and Vercel json-render. Nothing else was changed.

**The task.** There are 46 prompts ("briefs") in 5 difficulty levels:

| Level | Prompts | Components required |
|---|---:|---|
| b1 | 10 | 2–3 (for example, an invoice view) |
| b2 | 10 | 4–6 |
| b3 | 10 | 7–9 |
| b4 | 8 | 11–13 |
| b5 | 8 | 16–18 (for example, an emergency response center) |

Each prompt runs 4 times, so each format gets 184 answers per model. The model writes one complete screen per prompt.

**What is the same for every format:**
- the 70-component catalog (Card, CardHeader, Table, BarChart, Form, Alert, …);
- the two worked examples;
- the rules and the per-group usage notes;
- the model settings: temperature 0.7, minimal reasoning, 16,384-token output limit.

Only the **language** differs. GistUI and OpenUI write the same components in different syntax, so the benchmark compares formats, not component libraries.

**What "valid" means.** This is the benchmark's own definition. An answer is valid when it:
- parses;
- has a root;
- has every reference resolved and every statement reachable from the root;
- has its required props present and its enum values valid;
- was not truncated;
- has at least as many components as the prompt requires.

OpenUI is scored by its own library (`@openuidev/lang-core` 0.2.16). GistUI is scored by `bench/genui/validator.ts`, which applies the same rules just as strictly. For example, extra arguments fail both.

**Raw and autofix.**
- **Raw** is the model's answer as written, read by the parser that ships in the library.
- **Autofix** is the same answer after `autofix()` from `@gistui/core`. It is deterministic code with no model call, and it is always reported as its own row.

---

## 3. Results

### 3.1 gpt-oss-120b

- **Provider:** Vercel AI Gateway ($0.35/M input, $0.75/M output).
- **Prompt:** the current GistUI prompt, 3,838 tokens.
- **Answers:** 184 per format, on the same prompts. The OpenUI answers were generated through the same gateway in an earlier run and are reused here; this model is not on the benchmark's site, so there are no published answers for it.

| Format | Valid | Partial | Blank | Validity | Prompt | Mean output | Combined | Cost per pass | Stream at 50 tok/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| GistUI raw | 160 | 24 | 0 | 87.0% | 3,838 | 526 | 4,364 | $0.08 | ~11 s |
| **GistUI + autofix** | **184** | **0** | **0** | **100.0%** | 3,838 | 526 | 4,364 | **$0.08** | ~11 s |
| OpenUI | 155 | 29 | 0 | 84.2% | 5,017 | 597 | 5,614 | $0.10 | ~12 s |

Validity by screen complexity:

| Components required | Runs | GistUI raw | **GistUI + autofix** | OpenUI |
|---|---:|---:|---:|---:|
| 2–3 | 40 | 100.0% | **100%** | 95.0% |
| 4–6 | 40 | 87.5% | **100%** | 95.0% |
| 7–9 | 40 | 92.5% | **100%** | 90.0% |
| 11–13 | 32 | 81.3% | **100%** | 59.4% |
| 16–18 | 32 | 68.8% | **100%** | 75.0% |

- **GistUI raw failures:** references left dangling or unused 12, wrong enum value 12, missing required prop 5, wrong argument shape 3, syntax 1. An answer can have more than one.
- **OpenUI failures:** invalid enum 18, signature mismatch 13, reference errors 7, unknown components 2, missing required prop 1.

### 3.2 Gemini 3.7 Flash

- **Provider:** OpenRouter ($0.75/M input, $3.75/M output).
- **Prompt:** an earlier GistUI prompt, 3,061 tokens. The current prompt has not been run on this model yet.
- **Answers:** 184 for GistUI. The other formats are the benchmark's published answers for the same model.

| Format | Valid | Partial | Blank | Validity | Render success |
|---|---:|---:|---:|---:|---:|
| GistUI raw | 161 | 23 | 0 | 87.5% | 100.0% |
| **GistUI + autofix** | **184** | **0** | **0** | **100.0%** | **100.0%** |
| OpenUI | 182 | 2 | 0 | 98.9% | 100.0% |
| A2UI v0.9 | 173 | 5 | 6 | 94.0% | 96.7% |
| json-render 0.19 | 171 | 13 | 0 | 92.9% | 100.0% |

Validity by screen complexity:

| Components required | Runs | GistUI raw | **GistUI + autofix** | OpenUI | A2UI | json-render |
|---|---:|---:|---:|---:|---:|---:|
| 2–3 | 40 | 95.0% | **100%** | 100.0% | 100.0% | 95.0% |
| 4–6 | 40 | 87.5% | **100%** | 100.0% | 100.0% | 97.5% |
| 7–9 | 40 | 92.5% | **100%** | 97.5% | 95.0% | 85.0% |
| 11–13 | 32 | 87.5% | **100%** | 96.9% | 96.9% | 93.8% |
| 16–18 | 32 | 71.9% | **100%** | 100.0% | 75.0% | 93.8% |

GistUI's raw score drops on the largest screens: models lose track of sections in long answers. Autofix recovers all of them.

Tokens and cost. Every format is computed the same way, with the benchmark's own `tools/cost-estimate.ts`: system prompt plus brief as input, visible answer tokens as output, list price, per 46-screen pass.

| Format | System prompt | Mean output | Combined | Cost per pass | Cost per task | Stream at 50 tok/s |
|---|---:|---:|---:|---:|---:|---:|
| **GistUI** | **3,061** | **1,443** | **4,504** | **$0.36** | **$0.0078** | **~29 s** |
| OpenUI | 5,017 | 1,637 | 6,654 | $0.46 | $0.0100 | ~33 s |
| A2UI | 12,602 | 3,217 | 15,819 | $0.99 | $0.0215 | ~64 s |
| json-render | 7,651 | 3,756 | 11,407 | $0.92 | $0.0200 | ~75 s |

With this method OpenUI costs $0.46 per pass where openui.com shows $0.42. Every format comes out 5–8% higher than on the site, so compare these rows with each other, not with the site's figures.

---

## 4. Autofix (`@gistui/core`, `packages/core/src/autofix.ts`)

It is plain code with no model call. It fixes each error where it points and parses again, for up to 6 rounds. Every change is listed.

| Model mistake | Fix |
|---|---|
| Unknown prop, extra argument | Removed |
| Invalid value on an optional prop, such as `triggerVariant:primary` | Removed, so the default applies |
| Invalid value on a required prop | Closest allowed value |
| Free text in a required enum's slot, such as `Callout("Title", "Text")` | The enum is added by name and the text moves to its slots |
| Missing required ID or name | Filled from the call's own text or its ID |
| Reference to something never defined | The reference is removed |
| A section defined but never used | Added to the root's children |
| Unknown component | Renamed when it is clearly a typo (`Txt` → `Text`); otherwise replaced by a plain container that keeps its children |
| A component whose required data is missing, a cycle | That statement is removed |

**Content kept.** On both models, no repaired screen lost a component. The repair also placed components that a model wrote but never put on the screen: 151 on gpt-oss-120b and 35 on Gemini 3.7 Flash.

**Speed, on 184 gpt-oss-120b answers:**

| | Median | 95th percentile | Slowest |
|---|---:|---:|---:|
| Parse | 0.14 ms | 0.54 ms | 1.3 ms |
| Autofix | 0.44 ms | 1.6 ms | 3.3 ms |

The repair runs once, when the stream ends, and fits inside one frame.

**Where it runs.** Every renderer (`@gistui/react`, `@gistui/vue`, `@gistui/svelte`, `@gistui/solid`, `@gistui/vanilla`) applies it when a stream ends with mistakes and shows the repaired program in place. `repairProgram` in `@gistui/server` does the same on the server.

---

## 5. Parse speed

The same 276 screens, total time:

| | OpenUI (lang-core 0.2.16) | GistUI | |
|---|---:|---:|---|
| One-shot parse | 55 ms | 66 ms | GistUI 1.2× slower (both well under 1 ms per screen) |
| Streamed, 10-character chunks | 9,024 ms | 69 ms | **GistUI 130× faster** |
| Largest screen (21,137 characters), streamed | 382 ms | 0.98 ms | **GistUI 391× faster** |

OpenUI re-parses the whole answer on every chunk, so its cost grows with the square of the screen size. GistUI parses each statement once.

A second measurement of the same test gave 148× for streamed parsing and 419× for the largest screen; the difference is machine load. Quote the range: **130–150×** and **390–420×**.

Parser benchmark (`bun run bench:parser`):

| Case | Median |
|---|---:|
| 16 KB program, streamed in 10-character chunks | 5.4 ms |
| 50 KB program, one shot | 3.4 ms |
| Shared-reference DAG, 20 levels | 0.057 ms (OpenUI: 4.75 s) |

---

## 6. Token comparison without a model

`bun run bench:genui` converts every published OpenUI answer for the benchmark's six headline models into GistUI. It shows what each format costs for the same UI. It needs no API key, and it is **not** a validity measure: the screens are converted, not written by a model.

| | GistUI | OpenUI Lang | A2UI v0.9 | json-render 0.19 |
|---|---:|---:|---:|---:|
| System prompt, tokens | 3,838 | 5,017 | 12,602 | 7,651 |
| Mean output per screen, converted | 1,011 | 1,362 | 2,823 | 3,258 |
| Per task (prompt + brief + output) | 4,964 | 6,494 | 15,540 | 11,024 |
| Stream time at 50 tok/s | 20.2 s | 27.2 s | 56.5 s | 65.2 s |

Converted output is 25.8% smaller than OpenUI's. The live runs in section 3 measured 12%, which is the number to trust.

OpenUI's own 7-scenario token benchmark (o200k tokens):

| | GistUI | OpenUI Lang | Minified C1 JSON | YAML | Vercel JSON-Render |
|---|---:|---:|---:|---:|---:|
| Total | **3,908** | 4,800 | 5,461 | 9,129 | 10,180 |
| GistUI vs each | | −18.6% | −28.4% | −57.2% | −61.6% |

---

## 7. Caveats

- **Two models.** The benchmark's site lists 31. Only gpt-oss-120b and Gemini 3.7 Flash have complete GistUI runs so far.
- **The current prompt is tested on one model.** Gemini 3.7 Flash was run with an earlier prompt.
- **The benchmark checks structure, not appearance.** The answers use the benchmark's 70-component catalog, not GistUI's own components.
- **Randomness and provider drift.** Temperature 0.7 and different providers add noise of a few points. Both formats in a run always had the same providers and prompts.
- **Raw numbers only for the other formats.** Always report GistUI's raw number next to its autofix number.
- **GistUI's raw number depends on the parser version.** These are scored with the parser as of 2026-10-02, which reads common model habits (a missing comma or bracket, single quotes, JSON-style named arguments, a lower-case component name) as they were meant.

---

## 8. Reproduce

```bash
bun run bench:genui:setup          # clone the benchmark at the pinned commit (bench/.cache)
bun run bench:genui                # token comparison without a model → bench/results/genui.md
bun run bench:tier-a               # OpenUI's 7 scenarios → bench/results/tier-a.md
bun run bench:parser               # parser speed → bench/results/parser.json

# Live, GistUI only, compared against the benchmark's published answers for the same model:
BENCH_MODEL=google/gemini-3.7-flash BENCH_LABEL=gemini37@v2 BENCH_BUDGET_USD=1.00 \
OPENROUTER_API_KEY=… bun run bench:genui:run
bun run bench:genui:score gemini37@v2      # prints raw and "+ autofix"

# Vercel AI Gateway: BENCH_PROVIDER=vercel AI_GATEWAY_API_KEY=…
```

The label must be the benchmark's label for the exact same model (`gemini37` = `google/gemini-3.7-flash`), otherwise the comparison mixes models. A tag after `@` keeps a new run separate from earlier answers. `BENCH_BUDGET_USD` is a hard stop on billed cost.
