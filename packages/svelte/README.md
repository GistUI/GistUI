# @gistui/svelte

GistUI for Svelte 5 (and SvelteKit): render a model's streamed answer as real UI (dashboards, forms,
reports, slide decks) with GistUI's components, or with your own Svelte components. The package ships
its Svelte source, compiled by your app's build.

```sh
npm install @gistui/svelte @gistui/styles
```

On the server, give the model GistUI's system prompt:

```ts
import { prompt } from "@gistui/catalog";
const system = prompt().text; // prompt({ mode: "inline" }) for chat text with ```gistui blocks
```

In your app:

```svelte
<script>
  import { GistUI } from "@gistui/svelte";
  import "@gistui/styles/styles.css";
  let { answer, loading } = $props();
</script>

<GistUI source={answer} streaming={loading} onaction={(a) => console.log(a)} />
```

Props: `source` + `streaming` or `stream`, `inline`, `theme`, `color`, `tokens`, `darkTokens`,
`classNames`, `tools`, `mutations`, `allowedHosts`, `paused`, `initialState`, `lockUntil`, `openLinks`,
`autofix` (default `true`), `components`, `library`, and the callbacks `onaction`, `onerror`,
`onstatechange`, `onprose`, `onautofix`, `ontoolcall`. Without a component, the `use:gistui` action
renders into any element.

**Tools and safety.** A program is untrusted (a model wrote it, possibly steered by content it read).
`tools` are read-only and may run as soon as the UI renders; `mutations` change something and run
only when the person presses a button; `ontoolcall` is called before every tool call and can block it
by returning `false`. `allowedHosts` (`["cdn.example.com", "*.example.com"]`) limits where images,
video and backgrounds load from; without it, a URL the program assembled from data is not loaded.
`paused` stops timed data refreshes.

**Autofix.** When a stream ends with mistakes, the program is repaired in code (no model call) and
shown repaired, in place; `onautofix` lists what changed.

## Your own components

Any Svelte component (shadcn-svelte, Bits UI, your design system) can replace a built-in one:

```svelte
<!-- MyCard.svelte -->
<script lang="ts">
  import { GistChildren, type GistUIComponentProps } from "@gistui/svelte";
  let { props }: GistUIComponentProps = $props(); // what the model wrote
</script>

<section class="my-card"><GistChildren /></section>
```

```svelte
<GistUI source={answer} components={{ Card: MyCard }} />
```

Your components see the Svelte context around `<GistUI>`. For a form field, `gistField(() => p.ctx)`
joins the GistUI Form around it: validation from the field's props, error messages, and `bind:$var`
(`field.current.name`, `error`, `locked`, `value`, `setValue`).
