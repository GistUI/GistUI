<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/gistui/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/vanilla</h1>

<p><b>GistUI for vanilla JavaScript.</b><br />Mount a streamed GistUI program into any element, with no framework.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/vanilla"><img src="https://img.shields.io/npm/v/@gistui/vanilla?style=flat-square&color=8f8cff&label=npm" alt="npm version" /></a>
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

GistUI for vanilla JavaScript: mount a streamed GistUI program into any element, with no framework, with the default
components (the same markup, styles and behaviour as `@gistui/react`). It is the base of
`@gistui/vue`, `@gistui/svelte` and `@gistui/solid`, and works on its own in plain JS or any other
framework.

```sh
npm install @gistui/vanilla @gistui/styles
```

## Render a model's answer

On the server, give the model GistUI's system prompt:

```ts
import { prompt } from "@gistui/catalog";

const system = prompt().text; // or prompt({ mode: "inline" }) for chat text with ```gistui blocks
```

In the browser, mount the response:

```ts
import "@gistui/styles/styles.css";
import { mount } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";

const view = mount(document.getElementById("answer")!, {
  library: ui,
  stream: response.body, // a ReadableStream or async iterable of text or bytes
  onAction: (action) => console.log(action), // button clicks, form submits, @emit…
});

// Or a growing string: only the appended part is parsed.
view.update({ source: textSoFar, streaming: true });
view.update({ source: fullText, streaming: false });
view.destroy();
```

Options: `stream` or `source` + `streaming`, `inline`, `onAction`, `onError`, `onStateChange`,
`onProse`, `theme` (`"system"` | `"light"` | `"dark"`), `color`, `tokens`, `darkTokens`, `classNames`,
`tools`, `mutations`, `onToolCall`, `allowedHosts`, `paused`, `initialState`, `lockUntil` (`"done"`
or `"ready"`), `openLinks`, `autofix`, `onAutofix`.

**Tools and safety.** A program is untrusted (a model wrote it, possibly steered by content it read).
`tools` are read-only and may run as soon as the UI renders; `mutations` change something and run
only when the person presses a button; `onToolCall` is called before every tool call and can block it
by returning `false`. `allowedHosts` (`["cdn.example.com", "*.example.com"]`) limits where images,
video and backgrounds load from; without it, a URL the program assembled from data is not loaded.
`paused` stops timed data refreshes.

**Autofix.** When a stream ends with mistakes (an unknown prop, a missing argument, a misspelled
component, a dangling reference…), the program is repaired in code, with no model call, and the
repaired version is shown in place: only what changed re-renders. The repair code loads on demand,
only when it is needed. `autofix: false` turns it off; `onAutofix` reports what was changed.

## Your own components

Replace any built-in component, keeping its name (the model's prompt does not change), or add new ones:

```ts
import { createDomLibrary, defineDomComponent, h } from "@gistui/vanilla";

const lib = ui.extend({
  Card: (ctx) => {
    const el = h("section", { class: "my-card" });
    ctx.place(el); // the card's children go here
    return { el, update: () => true };
  },
});
```

A renderer gets `ctx` (`props`, `node`, `place`, `binding()`, `emit`, `run`, `locked`, `streaming`…)
and returns `{ el, update?, destroy? }`. A form field of your own joins the Form around it (validation,
error messages, `bind:$var`) with `formField(ctx, onChange)`.

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
