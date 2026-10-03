<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/solid</h1>

<p><b>GistUI for Solid.</b><br />Render a model's streamed answer as real, interactive UI in Solid and SolidStart.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/solid"><img src="https://img.shields.io/npm/v/@gistui/solid?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
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

GistUI for Solid (SolidStart, TanStack Start with Solid): render a model's streamed answer as real UI
(dashboards, forms, reports, slide decks) with GistUI's components, or with your own Solid components.

```sh
npm install @gistui/solid @gistui/styles
```

On the server, give the model GistUI's system prompt:

```ts
import { prompt } from "@gistui/catalog";
const system = prompt().text; // prompt({ mode: "inline" }) for chat text with ```gistui blocks
```

In your app:

```tsx
import { GistUI } from "@gistui/solid";
import "@gistui/styles/styles.css";

<GistUI source={answer()} streaming={loading()} onAction={(a) => console.log(a)} />;
```

Props: `source` + `streaming` or `stream`, `inline`, `theme`, `color`, `tokens`, `darkTokens`,
`classNames`, `tools`, `mutations`, `allowedHosts`, `paused`, `initialState`, `lockUntil`, `openLinks`,
`autofix` (default `true`), `components`, `library`, and `onAction`, `onError`, `onStateChange`,
`onProse`, `onAutofix`, `onToolCall`.

**Tools and safety.** A program is untrusted (a model wrote it, possibly steered by content it read).
`tools` are read-only and may run as soon as the UI renders; `mutations` change something and run
only when the person presses a button; `onToolCall` is called before every tool call and can block it
by returning `false`. `allowedHosts` (`["cdn.example.com", "*.example.com"]`) limits where images,
video and backgrounds load from; without it, a URL the program assembled from data is not loaded.
`paused` stops timed data refreshes.

**Autofix.** When a stream ends with mistakes, the program is repaired in code (no model call) and
shown repaired, in place; `onAutofix` lists what changed.

## Your own components

Any Solid component (Kobalte, solid-ui, your design system) can replace a built-in one:

```tsx
import { GistChildren, type GistUIComponentProps } from "@gistui/solid";

function MyCard(p: GistUIComponentProps) {
  return <section class="my-card"><GistChildren /></section>; // p.props: what the model wrote
}

<GistUI source={answer()} components={{ Card: MyCard }} />;
```

Your components see the context around `<GistUI>`. For a form field, `createGistField(props)` joins the
GistUI Form around it: validation from the field's props, error messages, and `bind:$var`
(`field().name`, `error`, `locked`, `value`, `setValue`).

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
