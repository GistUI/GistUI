# @gistui/vanilla

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
