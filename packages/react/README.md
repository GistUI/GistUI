<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/react</h1>

<p><b>GistUI for React.</b><br />Render a model's streamed answer as real, interactive UI, with GistUI's components or your own.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/react"><img src="https://img.shields.io/npm/v/@gistui/react?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
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

GistUI for React: render a model's streamed answer as real UI (dashboards, forms, reports, slide
decks) with GistUI's components, or with your own (shadcn/ui, MUI, your design system).

```sh
npm install @gistui/react @gistui/styles
```

On the server, give the model GistUI's system prompt:

```ts
import { prompt } from "@gistui/react/prompt"; // same as `prompt` from @gistui/catalog
const system = prompt().text; // prompt({ mode: "inline" }) for chat text with ```gistui blocks
```

In your app:

```tsx
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";

<GistUI library={ui} stream={response.body} onAction={(a) => console.log(a)} />;
```

**Props**
- `stream`: a `ReadableStream` or async iterable of text or bytes; or `source` + `streaming`: a growing
  string (only the appended part is parsed).
- `onAction` (button clicks, form submits, `@emit`), `onError`, `onStateChange`, `onProse`.
- `theme` (`"system"` | `"light"` | `"dark"`), `color`, `tokens`, `darkTokens`, `classNames`.
  `tokens` are for values from your own code, never for text from a model or a user.
- `initialState`, `lockUntil` (`"done"` by default, or `"ready"`), `inline` (chat text with
  ```` ```gistui ```` fences), `paused` (stops timed data refreshes; the UI still loads and answers).
- `autofix` (default `true`) and `onAutofix`: when a stream ends with mistakes (an unknown prop, a
  missing argument, a misspelled component, a dangling reference…), the program is repaired in code,
  with no model call, and the repaired version is shown in place; only what changed re-renders. The
  repair code loads on demand, only when needed.

**Tools and safety** (a program is untrusted: a model wrote it, possibly steered by content it read)
- `tools`: read-only functions (or an MCP-style client). `@query` may call them as soon as the UI
  renders, so nothing here should change anything.
- `mutations`: functions that change something. Only `@mutation` reaches them, and only when the
  person presses a button (`do:[@run(save)]`); rendering never calls them.
- `onToolCall(call)`: called before every tool call (`{ name, args, kind, nodeId }`); return or
  resolve `false` to block it (to log, check arguments, or ask the person first).
- `allowedHosts`: hosts that images, video and backgrounds may load from
  (`["cdn.example.com", "*.example.com"]`; relative URLs and your own host always load). Set it when
  the model sees private data: an image URL can carry data to another server without a click.
  Without it, any host is allowed for a URL the program wrote out, and a URL it assembled from data
  (`"https://…?d=" + value`) is not loaded.
- `favicons`: site icons on `Source` cards. Off by default, because an icon is a request to a
  third-party service for every cited site. `true` uses a public favicon service; a string is your
  own URL with `{host}`. With `allowedHosts`, list the service's host too.
- A server render (`renderToString`) shows the content but calls no tool; data loads after mounting.

**Rendering**
- Each node subscribes to its own id and is memoized, so a patch re-renders only the nodes it touched.
- Patches flush once per animation frame, and immediately until the root exists.
- Every top-level section has its own error boundary.

**Your own components**

Replace any built-in component, keeping its name (the model's prompt does not change):

```tsx
import type { ComponentProps } from "@gistui/react";
import { ui, useGistButton, useGistField } from "@gistui/react/ui";

function MyInput(p: ComponentProps) {
  const field = useGistField(p); // name, label, required, error, locked, value, setValue
  return <Input name={field.name} disabled={field.locked} aria-invalid={!!field.error} />;
}
function MyButton(p: ComponentProps) {
  const b = useGistButton(p); // do: actions, submit and draft in forms, opens: dialogs, links
  return <><Button {...b.buttonProps}>{b.label}</Button>{b.dialog}</>;
}

const lib = ui.extend({ Input: MyInput, Button: MyButton });
```

`useGistField` joins the GistUI Form around the field (validation from its props, error messages,
`bind:$var`); render a native control with `name` (Radix and most libraries render a hidden one).
New components: `defineComponent({ name, args, props, component })` and `createLibrary`; they appear in
the prompt automatically.

**What loads when** (gzip, React excluded): the runtime is 32 KB; the default components' first load is
74 KB of JavaScript plus a 29 KB stylesheet. Charts, tables, slides, pickers, code, math and diagrams
load on demand.

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
