# Changelog

All packages are released together, with one version.

## 0.1.0

First release.

- **GistUI Lang** (`@gistui/core`): an incremental streaming parser, a patch-based store, validation,
  autofix (repairs a program's mistakes in code, with no model call), edit-mode merge, and a byte-stable
  system-prompt generator.
- **Renderers** with the same 63 components, look and behaviour: React (`@gistui/react`), Vue 3.5+
  (`@gistui/vue`), Svelte 5 (`@gistui/svelte`), Solid (`@gistui/solid`), and the framework-free DOM
  renderer (`@gistui/vanilla`).
- **Autofix in every renderer**: when a stream ends with mistakes, the program is repaired and shown in
  place; the repair code loads on demand.
- **Your own components** in every framework, with form fields (`useGistField`, `createGistField`,
  `gistField`, `formField`) that join GistUI's forms, and `useGistButton` (React). Works with shadcn/ui;
  the stylesheet's layer order works with Tailwind v4.
- **Server** (`@gistui/server`): read OpenAI, Anthropic, AI SDK, AG-UI or text streams; validate and
  repair programs. **Chat** (`@gistui/chat`): a headless chat store, adapters and React layouts.
- **One stylesheet** (`@gistui/styles`) and one catalog with the system prompt (`@gistui/catalog`).
- **A program is treated as untrusted.**
  - `tools` are read-only and may run when the UI renders; `mutations` run only when the person
    presses a button; `onToolCall` can check or block every call.
  - `allowedHosts` limits where images, video and backgrounds load from; without it, a URL the
    program assembled from data is not loaded.
  - Limits on nesting, evaluation work, repeated components, list sizes, timed refreshes and tool
    calls; own-property access only; no `eval`, so a strict CSP works.
  - A message sent by a button or form in a chat is marked as coming from the UI, for the person and
    for the model.
- **Lenient parsing**: common model habits (a missing comma or closing bracket, single quotes, JSON-style
  named arguments, a lower-case component name) are read as meant and reported as warnings.
