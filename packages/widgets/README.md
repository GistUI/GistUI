# @gistui/widgets

Framework-free widgets used by GistUI's renderers: a small SVG chart engine (bar, line, area, pie,
donut, radar, scatter, stacked…) with tooltips and keyboard access, and a streaming Markdown renderer
that never flickers on half-written marks.

```ts
import { createChart } from "@gistui/widgets/chart";
import { createMarkdown } from "@gistui/widgets/markdown";
```

Renderers load these on demand, so they do not weigh on first load.
