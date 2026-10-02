<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/gistui/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/core</h1>

<p><b>The GistUI Lang engine.</b><br />Streaming parser, validator, autofix and prompt generator, with zero dependencies.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/core"><img src="https://img.shields.io/npm/v/@gistui/core?style=flat-square&color=8f8cff&label=npm" alt="npm version" /></a>
  <a href="https://github.com/GistUI/gistui/blob/main/LICENSE"><img src="https://img.shields.io/badge/licence-MIT-8f8cff?style=flat-square" alt="MIT licence" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="Written in strict TypeScript" />
  <a href="https://gistui.com"><img src="https://img.shields.io/badge/website-gistui.com-6a5df2?style=flat-square" alt="Website: gistui.com" /></a>
</p>

<p>
  <a href="https://gistui.com">Website</a> ·
  <a href="https://github.com/GistUI/gistui#quick-start">Quick start</a> ·
  <a href="https://github.com/GistUI/gistui/blob/main/benchmark.md">Benchmarks</a> ·
  <a href="https://github.com/GistUI/gistui/blob/main/CHANGELOG.md">Changelog</a>
</p>

</div>

<br />

The GistUI Lang engine: an incremental streaming parser, a patch-based materializer, validation with
deterministic repair, a canonical printer, edit-mode merge and a system-prompt generator.
It has zero dependencies and works in any JS runtime.

```sh
npm install @gistui/core
```

```ts
import { createStream, defineLibrary, generatePrompt } from "@gistui/core";

const lib = defineLibrary({ components: [/* ComponentSpec… */] });
const system = generatePrompt(lib).text;

const stream = createStream(lib);
stream.store.subscribe("root", () => render(stream.store.get("root")));
for await (const chunk of llmResponse) {
  stream.push(chunk); // string or UTF-8 bytes
  stream.flush(); // call once per frame; commits patches and notifies subscribers
}
stream.end(); // auto-closes, drops unresolved refs, reports errors
console.log(stream.errors());
```

- **`parse(source, lib)`**: one-shot parse. Returns `{root, store, errors, valid: {strict, lenient}}`.
- **`validate(source, lib)`**: validity, errors and the reachable component count.
- **`autofix(text, lib)`**: repairs a program with mistakes, in code (no model call): unknown props
  and extra arguments removed, invalid values corrected, missing required props filled, misspelled
  components renamed, dangling references dropped, unused statements placed. Every change is listed.
- **`toEditSource` / `merge`**: the canonical printout for edit turns, and the merge of an edit into
  a program.
- **`generatePrompt(lib, {mode, tools, examples, groups, progressive})`**: a byte-stable system prompt.

The language is specified in `spec/gistui-lang.md` in the GistUI repository, with a conformance suite
in `spec/conformance/`.

```sh
bun test               # unit, property, conformance and performance tests
bun run bench          # parser benchmarks → bench/results/parser.json
```

## All packages

GistUI is one project in several packages, released together under one version.

| Package | What it is |
|---|---|
| [`@gistui/react`](https://github.com/GistUI/gistui/tree/main/packages/react) | React renderer and default components |
| [`@gistui/vue`](https://github.com/GistUI/gistui/tree/main/packages/vue) | Vue 3.5+ and Nuxt |
| [`@gistui/svelte`](https://github.com/GistUI/gistui/tree/main/packages/svelte) | Svelte 5 and SvelteKit |
| [`@gistui/solid`](https://github.com/GistUI/gistui/tree/main/packages/solid) | Solid and SolidStart |
| [`@gistui/vanilla`](https://github.com/GistUI/gistui/tree/main/packages/vanilla) | Vanilla JavaScript renderer, no framework |
| [`@gistui/catalog`](https://github.com/GistUI/gistui/tree/main/packages/catalog) | Component schemas, the system prompt and the agent skill |
| [`@gistui/styles`](https://github.com/GistUI/gistui/tree/main/packages/styles) | One stylesheet for every framework |
| [`@gistui/server`](https://github.com/GistUI/gistui/tree/main/packages/server) | Stream reading, validation and repair on the server |
| [`@gistui/chat`](https://github.com/GistUI/gistui/tree/main/packages/chat) | Headless chat store, model adapters, React chat layouts |
| [`@gistui/core`](https://github.com/GistUI/gistui/tree/main/packages/core) | The language: streaming parser, validator, autofix, prompt generator |
| [`@gistui/headless`](https://github.com/GistUI/gistui/tree/main/packages/headless) | Shared internals: engine, themes, forms |
| [`@gistui/widgets`](https://github.com/GistUI/gistui/tree/main/packages/widgets) | Shared internals: charts, Markdown |

## Licence

[MIT](https://github.com/GistUI/gistui/blob/main/LICENSE)
