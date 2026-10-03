<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/server</h1>

<p><b>GistUI on the model side.</b><br />Read a model's stream as text, validate the program and repair it, on any JavaScript runtime.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/server"><img src="https://img.shields.io/npm/v/@gistui/server?style=flat-square&color=ff5e1e&label=npm" alt="npm version" /></a>
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

GistUI on the model side, for Node, Bun, Deno, Edge and Workers: read a model's stream as text,
validate the program, repair it in code, and (optionally) ask the model to fix only the statements
that are still wrong.

```sh
npm install @gistui/server @gistui/catalog
```

```ts
import { prompt, library } from "@gistui/catalog";
import { repairStream, textDeltas, toReadable } from "@gistui/server";

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: prompt().text }, ...messages] }),
});

// A failed request has no stream to read: answer with its status instead.
if (!res.ok) return new Response(await res.text(), { status: res.status });
// Text out of OpenAI-compatible, Anthropic, AI SDK, AG-UI or plain-text streams.
const text = textDeltas(res, "openai");
// Pass the program through; at the end, append repairs as edits if anything is still wrong.
return new Response(toReadable(repairStream(text, library)));
```

- `textDeltas(response, format)`: `"openai"` (and OpenAI-compatible gateways), `"anthropic"`,
  `"ai-sdk"`, `"agui"` or `"text"`. It throws when the provider reports an error (a non-ok response,
  or an error event in the stream), so a failed call is never an empty answer; the error has the
  HTTP `status` when there is one. Leaving the loop early cancels the upstream request.
- `validateProgram(text, library)`: `{ valid, errors, fixed }`.
- `repairProgram(text, library, { complete? })`: deterministic repair first (autofix, no model call);
  with `complete`, your model is asked to fix only the statements that still fail, with a small prompt.
- `repairStream(source, library, opts)`: the same, for a stream.
- With `complete`, a model round is kept only when it leaves fewer errors than before. The program
  and its errors are sent inside `<program>` and `<errors>` tags and described as data, so text in
  the program cannot pass for instructions.

The renderers (`@gistui/react`, `@gistui/vue`, `@gistui/svelte`, `@gistui/solid`, `@gistui/vanilla`) also
repair a finished program in code on their own, so this package is optional.

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
