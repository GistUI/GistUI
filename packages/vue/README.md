<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/vue</h1>

<p><b>GistUI for Vue.</b><br />Render a model's streamed answer as real, interactive UI in Vue 3.5+ and Nuxt.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/vue"><img src="https://img.shields.io/npm/v/@gistui/vue?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
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

GistUI for Vue 3.5+ (and Nuxt): render a model's streamed answer as real UI (dashboards, forms,
reports, slide decks) with GistUI's components, or with your own Vue components.

```sh
npm install @gistui/vue @gistui/styles
```

On the server, give the model GistUI's system prompt:

```ts
import { prompt } from "@gistui/catalog";
const system = prompt().text; // prompt({ mode: "inline" }) for chat text with ```gistui blocks
```

In your app:

```vue
<script setup lang="ts">
import { GistUI } from "@gistui/vue";
import "@gistui/styles/styles.css";
</script>

<template>
  <GistUI :source="answer" :streaming="loading" @action="onAction" />
</template>
```

Props: `source` + `streaming` (a growing string) or `stream` (a `ReadableStream`), `inline`, `theme`,
`color`, `tokens`, `darkTokens`, `classNames`, `tools`, `mutations`, `onToolCall`, `allowedHosts`,
`paused`, `initialState`, `lockUntil`, `openLinks`, `autofix` (default `true`), `components`, `library`.
Events: `action`, `error`, `stateChange`, `prose`, `autofix`.

**Tools and safety.** A program is untrusted (a model wrote it, possibly steered by content it read).
`tools` are read-only and may run as soon as the UI renders; `mutations` change something and run
only when the person presses a button; `onToolCall` is called before every tool call and can block it
by returning `false`. `allowedHosts` (`["cdn.example.com", "*.example.com"]`) limits where images,
video and backgrounds load from; without it, a URL the program assembled from data is not loaded.
`paused` stops timed data refreshes.

**Autofix.** When a stream ends with mistakes, the program is repaired in code (no model call) and
shown repaired, in place; the `autofix` event lists what changed.

## Your own components

Any Vue component (shadcn-vue, Reka UI, your design system) can replace a built-in one:

```vue
<!-- MyCard.vue -->
<script setup lang="ts">
import { GistChildren, type GistUIComponentProps } from "@gistui/vue";
defineProps<GistUIComponentProps>(); // props (what the model wrote), node, ctx
</script>
<template>
  <section class="my-card"><GistChildren /></section>
</template>
```

```vue
<GistUI :source="answer" :components="{ Card: MyCard }" />
```

Your components see the app's plugins and what the components around `<GistUI>` provide. For a form
field, `useGistField(props)` joins the GistUI Form around it: validation from the field's props,
error messages, and `bind:$var`.

```ts
const field = useGistField(props); // field.name, label, required, error, locked, value, setValue
```

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
