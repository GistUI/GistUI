# GistUI

Generative UI for any framework: a model answers in **GistUI Lang**, a compact language for interfaces,
and your app renders it as real, interactive UI (dashboards, forms, reports, slide decks, galleries)
while it streams.

```gistui
root = Page(Header("Q3 revenue", "All regions"), kpis, Card(Chart(rev, type:line, y:"USD")))
kpis = Stats(kpiData)
kpiData = |Label|Value|Delta
|Revenue|$1.2M|+8%
|Customers|3,410|-2.1%
rev = |Month|Revenue
|Jul|380000
|Aug|402000
```

- **React, Vue, Svelte, Solid, or plain DOM**, with the same 63 components, look and behaviour in each.
- **Your own components.** Replace any built-in one with your shadcn/ui, MUI or design-system
  component; forms, validation, actions and dialogs keep working.
- **Repairs mistakes in code.** When a model's answer ends with mistakes, the renderer fixes them, with
  no model call, and shows the fixed version in place.
- **Fast and small.** The parser handles each statement once while streaming; runtime 32 KB, default
  components 74 KB on first load (gzip), heavier components on demand.

## Quick start

```sh
npm install @gistui/react @gistui/styles   # or @gistui/vue, @gistui/svelte, @gistui/solid, @gistui/vanilla
```

```ts
// Where you call the model:
import { prompt } from "@gistui/catalog";
const system = prompt().text;
```

```tsx
// In your app:
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";

<GistUI library={ui} stream={response.body} onAction={(a) => console.log(a)} />;
```

## Packages

| Package | What it is |
|---|---|
| [`@gistui/react`](packages/react) | React renderer and default components |
| [`@gistui/vue`](packages/vue) | Vue 3.5+ |
| [`@gistui/svelte`](packages/svelte) | Svelte 5 and SvelteKit |
| [`@gistui/solid`](packages/solid) | Solid, SolidStart |
| [`@gistui/vanilla`](packages/vanilla) | Vanilla JavaScript renderer, no framework (the base of Vue, Svelte and Solid) |
| [`@gistui/catalog`](packages/catalog) | The default components' schemas and the system prompt |
| [`@gistui/styles`](packages/styles) | One stylesheet for every framework |
| [`@gistui/server`](packages/server) | Stream reading, validation and repair on the server |
| [`@gistui/chat`](packages/chat) | Headless chat store, model adapters, React chat layouts |
| [`@gistui/core`](packages/core) | The language: streaming parser, validator, autofix, prompt generator |
| [`@gistui/headless`](packages/headless), [`@gistui/widgets`](packages/widgets) | Shared internals: engine, themes, charts, Markdown |

Examples: [`examples/`](examples) (Vue, Svelte, Solid, React with shadcn/ui) and the playground in
[`apps/playground`](apps/playground).

## Benchmarks

Measured with OpenUI's own benchmark (46 screens × 4 runs), against OpenUI, A2UI and json-render. Full
tables, every run, and how to reproduce them: [`benchmark.md`](benchmark.md).

| Model | GistUI, as written | GistUI, after autofix | OpenUI | Output tokens, GistUI vs OpenUI |
|---|---:|---:|---:|---:|
| Gemini 3.7 Flash (earlier prompt) | 87.5% valid | **100%** | 98.9% | 1,443 vs 1,637 (−12%) |
| gpt-oss-120b (current prompt) | 87.0% valid | **100%** | 84.2% | 526 vs 597 (−12%) |

- System prompt: 3,838 tokens, against 5,017 for OpenUI.
- Cost of a 46-screen pass on Gemini 3.7 Flash: $0.36, against $0.46 for OpenUI.
- Streaming parse: 130–150× faster than OpenUI's parser on the same screens.

## Develop

```sh
bun install
bun run build && bun run typecheck && bun run test
bun run test:visual    # screenshots of every example
bun run test:parity    # React, DOM, Vue, Svelte and Solid render the same pixels
bun run test:shadcn    # shadcn/ui components behave like the built-in ones
bun run size           # bundle size gates
```

MIT licence.
