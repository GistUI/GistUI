<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/gistui/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/styles</h1>

<p><b>One stylesheet for every framework.</b><br />GistUI's design system as plain CSS, in its own cascade layer.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/styles"><img src="https://img.shields.io/npm/v/@gistui/styles?style=flat-square&color=8f8cff&label=npm" alt="npm version" /></a>
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

GistUI's design system: one plain-CSS stylesheet for every framework.

```sh
npm install @gistui/styles
```

```ts
import "@gistui/styles/styles.css";
```

- Everything is in `@layer gistui`, so your own CSS wins without `!important`.
- With Tailwind (and shadcn/ui), import this stylesheet **before** your Tailwind CSS. It sets the layer
  order `theme, base, gistui, components, utilities`: above Tailwind's reset, below its utilities, so
  utility classes passed through `classNames` still win.
- Customise with `--gistui-*` tokens on `.gistui` (or the `tokens` prop), the `data-gistui-color`,
  `data-gistui-radius` and `data-gistui-density` presets, and per-component hooks:
  `data-gistui="Card"`, `data-v`, `data-tone`.

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
