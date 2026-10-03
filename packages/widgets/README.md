<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/widgets</h1>

<p><b>Charts and streaming Markdown.</b><br />The SVG chart engine and the Markdown renderer used by every renderer.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/widgets"><img src="https://img.shields.io/npm/v/@gistui/widgets?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
  <a href="https://github.com/GistUI/GistUI/blob/main/LICENSE"><img src="https://img.shields.io/badge/licence-MIT-ff5e1e?style=flat-square" alt="MIT licence" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="Written in strict TypeScript" />
  <a href="https://gistui.com"><img src="https://img.shields.io/badge/website-gistui.com-ff5e1e?style=flat-square" alt="Website: gistui.com" /></a>
</p>

<p>
  <a href="https://gistui.com">Website</a> ·
  <a href="https://github.com/GistUI/GistUI#quick-start">Quick start</a> ·
  <a href="https://github.com/GistUI/GistUI/blob/main/benchmark.md">Benchmarks</a> ·
  <a href="https://github.com/GistUI/GistUI/blob/main/CHANGELOG.md">Changelog</a>
</p>

</div>

<br />

Framework-free widgets used by GistUI's renderers: a small SVG chart engine (bar, line, area, pie,
donut, radar, scatter, stacked…) with tooltips and keyboard access, and a streaming Markdown renderer
that never flickers on half-written marks.

```sh
npm install @gistui/widgets
```

```ts
import { createChart } from "@gistui/widgets/chart";
import { createMarkdown } from "@gistui/widgets/markdown";
```

Renderers load these on demand, so they do not weigh on first load.

## All packages

GistUI is one project in several packages, released together under one version.

| Package | What it is |
|---|---|
| [`@gistui/react`](https://github.com/GistUI/GistUI/tree/main/packages/react) | React renderer and default components |
| [`@gistui/vue`](https://github.com/GistUI/GistUI/tree/main/packages/vue) | Vue 3.5+ and Nuxt |
| [`@gistui/svelte`](https://github.com/GistUI/GistUI/tree/main/packages/svelte) | Svelte 5 and SvelteKit |
| [`@gistui/solid`](https://github.com/GistUI/GistUI/tree/main/packages/solid) | Solid and SolidStart |
| [`@gistui/vanilla`](https://github.com/GistUI/GistUI/tree/main/packages/vanilla) | Vanilla JavaScript renderer, no framework |
| [`@gistui/catalog`](https://github.com/GistUI/GistUI/tree/main/packages/catalog) | Component schemas, the system prompt and the agent skill |
| [`@gistui/styles`](https://github.com/GistUI/GistUI/tree/main/packages/styles) | One stylesheet for every framework |
| [`@gistui/server`](https://github.com/GistUI/GistUI/tree/main/packages/server) | Stream reading, validation and repair on the server |
| [`@gistui/chat`](https://github.com/GistUI/GistUI/tree/main/packages/chat) | Headless chat store, model adapters, React chat layouts |
| [`@gistui/core`](https://github.com/GistUI/GistUI/tree/main/packages/core) | The language: streaming parser, validator, autofix, prompt generator |
| [`@gistui/headless`](https://github.com/GistUI/GistUI/tree/main/packages/headless) | Shared internals: engine, themes, forms |
| [`@gistui/widgets`](https://github.com/GistUI/GistUI/tree/main/packages/widgets) | Shared internals: charts, Markdown |

## Licence

[MIT](https://github.com/GistUI/GistUI/blob/main/LICENSE)
