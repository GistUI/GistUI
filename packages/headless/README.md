# @gistui/headless

GistUI's framework-free layer, shared by `@gistui/react` and `@gistui/vanilla` (and so by Vue, Svelte and
Solid): the streaming engine, autofix at the end of a stream, theme tokens, the design layer, form
validation and JSON Schema, table and chart data helpers, URL safety and host callbacks.

You do not usually install it directly; a renderer depends on it. Building a renderer for another
framework? Start from `@gistui/headless/engine` (`Engine`, `runFor`, `autofixEnded`) and
`@gistui/vanilla`, which shows how the pieces fit.
