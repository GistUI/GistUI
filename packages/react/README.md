# @gistui/react

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
