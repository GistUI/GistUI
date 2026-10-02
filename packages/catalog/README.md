# @gistui/catalog

GistUI's default component catalog, shared by every renderer: 63 component schemas (layout, content,
data, charts, forms, slides and reports), their descriptions, the design guide, examples, icon names
and colour themes, and the system prompt built from them.

```ts
import { prompt } from "@gistui/catalog";

const system = prompt().text;                 // a whole answer is a GistUI program
const chat = prompt({ mode: "inline" }).text; // chat text with ```gistui blocks
```

The prompt is byte-stable, so provider prompt caching hits. Options include `mode`, `tools` and
`groups` (only some component groups). Import `@gistui/catalog` where you call the model; renderers
import `@gistui/catalog/render`, which leaves the prompt text out of the browser bundle.
