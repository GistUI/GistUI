# @gistui/solid

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
