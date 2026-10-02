# @gistui/vue

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
