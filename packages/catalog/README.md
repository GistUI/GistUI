<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/catalog</h1>

<p><b>The default component catalog.</b><br />63 component schemas, the design guide, the system prompt, and the skill for coding agents.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/catalog"><img src="https://img.shields.io/npm/v/@gistui/catalog?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
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

GistUI's default component catalog, shared by every renderer: 63 component schemas (layout, content,
data, charts, forms, slides and reports), their descriptions, the design guide, examples, icon names
and colour themes, and the system prompt built from them.

```sh
npm install @gistui/catalog
```

```ts
import { prompt } from "@gistui/catalog";

const system = prompt().text;                 // a whole answer is a GistUI program
const chat = prompt({ mode: "inline" }).text; // chat text with ```gistui blocks
```

The prompt is byte-stable, so provider prompt caching hits. Options include `mode`, `tools` and
`groups` (only some component groups). Import `@gistui/catalog` where you call the model; renderers
import `@gistui/catalog/render`, which leaves the prompt text out of the browser bundle.

## Agent skill

The package ships a skill for coding agents in `skills/gistui/`:

- `SKILL.md`: how to add GistUI to an app (every framework, the Vercel AI SDK, tools, forms, theming).
- `reference.md`: the language, generated from this catalog: every component, prop and flag.

Tell your agent to read `node_modules/@gistui/catalog/skills/gistui/SKILL.md`, or copy the folder to
`.claude/skills/gistui/` to keep it as a project skill. Both files match the installed version.

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
