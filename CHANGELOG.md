# Changelog

All packages are released together, with one version.

## 0.2.1

- **Autofix reads past one bad token** (`@gistui/core`). A statement the parser cannot read is cut back
  to its readable parts instead of being dropped whole: in `Card(Text("Today is " + new Date()), list)`
  the text and `list` stay. gpt-5-nano goes from 98.4% to 99.5% valid after repair.
- **A program with no `root`** and several sections gets a root that holds them all; before, every
  section after the first was removed.
- **Fixes to 0.2.0's repair.** It changes code only, never text:
  - a near-miss rename no longer rewrites a matching table cell or text in single quotes;
  - a table cell with commas (`|Tags|red, green, blue|`) stays one cell;
  - two unknown names are not both pointed at the same unused statement;
  - a `$state` variable used only by an unused section keeps its starting value;
  - in chat text (`inline`), only the fenced program is touched, so curly quotes in the prose are no
    longer reported as a change.
- **Benchmarks:** `bench:genui:score` scores the saved OpenUI answers by itself, with no key; the
  report states the run-to-run noise and that the repair figure covers nine runs of five models.

## 0.2.0

- **A stronger autofix** (`@gistui/core`). It now keeps more of what the model wrote:
  - a table written inside a call (`Table(|A|B|, |1|2|)`, or rows joined by a literal `\n`) moves to its
    own statement with every row, instead of being lost or read as one long row;
  - a data table nobody used is shown in a `Table` on the root instead of being deleted;
  - unused sections that only mention each other in text (a section and its table) are placed; before,
    neither was;
  - a reference that misses a statement by case or one letter (`MetricsRow`, `incidentsTable`) points at
    it; a component named without `()` is called; curly quotes are read as quotes.

  On 1,159 saved answers from five models, 99.2% are valid after repair; gpt-5-nano goes from 96.7% to
  98.4%.
- **Prompt:** a list prop with no item type prints as `[…]` instead of `list`, so models no longer copy
  the word `list` into their answers.
- **Agent skill:** two more rules (quoted text arguments, enum values from each component's own signature).
- **Benchmarks:** gpt-5-nano added next to gpt-oss-120b, with the OpenUI answers for both in
  `bench/genui/raw`. The runner can generate OpenUI answers (`BENCH_FORMAT=openui`) and keep to a
  provider's rate limit (`BENCH_RPM`, `BENCH_GATEWAY_PROVIDERS`). New: `bench/render`, rendering speed in
  Chrome against OpenUI.

## 0.1.0

First release.

- **GistUI Lang** (`@gistui/core`): an incremental streaming parser, a patch-based store, validation,
  autofix (repairs a program's mistakes in code, with no model call), edit-mode merge, and a byte-stable
  system-prompt generator.
- **Renderers** with the same 63 components, look and behaviour: React (`@gistui/react`), Vue 3.5+
  (`@gistui/vue`), Svelte 5 (`@gistui/svelte`), Solid (`@gistui/solid`), and the framework-free DOM
  renderer (`@gistui/vanilla`).
- **Autofix in every renderer**: when a stream ends with mistakes, the program is repaired and shown in
  place; the repair code loads on demand.
- **Your own components** in every framework, with form fields (`useGistField`, `createGistField`,
  `gistField`, `formField`) that join GistUI's forms, and `useGistButton` (React). Works with shadcn/ui;
  the stylesheet's layer order works with Tailwind v4.
- **Server** (`@gistui/server`): read OpenAI, Anthropic, AI SDK, AG-UI or text streams; validate and
  repair programs. **Chat** (`@gistui/chat`): a headless chat store, adapters and React layouts.
- **One stylesheet** (`@gistui/styles`) and one catalog with the system prompt (`@gistui/catalog`).
- **A program is treated as untrusted.**
  - `tools` are read-only and may run when the UI renders; `mutations` run only when the person
    presses a button; `onToolCall` can check or block every call.
  - `allowedHosts` limits where images, video and backgrounds load from; without it, a URL the
    program assembled from data is not loaded.
  - Limits on nesting, evaluation work, repeated components, list sizes, timed refreshes and tool
    calls; own-property access only; no `eval`, so a strict CSP works.
  - A message sent by a button or form in a chat is marked as coming from the UI, for the person and
    for the model.
- **Lenient parsing**: common model habits (a missing comma or closing bracket, single quotes, JSON-style
  named arguments, a lower-case component name) are read as meant and reported as warnings.
