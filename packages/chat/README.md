<div align="center">

<a href="https://gistui.com">
  <img src="https://raw.githubusercontent.com/GistUI/GistUI/main/.github/banner.png" alt="GistUI: the rendering engine for generative UI, next to a dashboard it rendered" width="100%" />
</a>

<h1>@gistui/chat</h1>

<p><b>A headless chat for GistUI answers.</b><br />A message store, model adapters, thread storage and React chat layouts.</p>

<p>
  <a href="https://www.npmjs.com/package/@gistui/chat"><img src="https://img.shields.io/npm/v/@gistui/chat?style=flat-square&color=8f8cff&label=npm" alt="npm version" /></a>
  <a href="https://github.com/GistUI/GistUI/blob/main/LICENSE"><img src="https://img.shields.io/badge/licence-MIT-8f8cff?style=flat-square" alt="MIT licence" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="Written in strict TypeScript" />
  <a href="https://gistui.com"><img src="https://img.shields.io/badge/website-gistui.com-6a5df2?style=flat-square" alt="Website: gistui.com" /></a>
</p>

<p>
  <a href="https://gistui.com">Website</a> ·
  <a href="https://github.com/GistUI/GistUI#quick-start">Quick start</a> ·
  <a href="https://github.com/GistUI/GistUI/blob/main/benchmark.md">Benchmarks</a> ·
  <a href="https://github.com/GistUI/GistUI/blob/main/CHANGELOG.md">Changelog</a>
</p>

</div>

<br />

A headless chat for GistUI answers: a message store, model adapters (OpenAI, Anthropic, Vercel AI SDK,
AG-UI, plain text) and thread storage, with no framework. React layouts (full page, sidebar, bottom
tray) are in `@gistui/chat/react`.

```sh
npm install @gistui/chat @gistui/react @gistui/styles
```

```tsx
import { aiSdk, createChat, localThread } from "@gistui/chat";
import { Chat } from "@gistui/chat/react";
import "@gistui/chat/chat.css";
import "@gistui/styles/styles.css";
import { ui } from "@gistui/react/ui";

// Your endpoint adds GistUI's system prompt: prompt({ mode: "inline" }) from @gistui/catalog.
const store = createChat({ adapter: aiSdk({ url: "/api/chat" }), storage: localThread("support") });

<Chat store={store} library={ui} layout="sidebar" title="Assistant" suggestions={["Show last month's sales"]} />;
```

- `createChat({ adapter, system?, initialMessages?, storage?, onError? })`: `send(text)`,
  `regenerate()`, `stop()`, `clear()`, and a subscribable snapshot of the messages.
- Adapters: `openai({ model, url?, apiKey? })`, `anthropic({ model, apiKey? })`, `aiSdk({ url })`,
  `agui({ url })`, `textStream({ url })`. Call models from your server; browser keys are for demos.
- `<Chat>` takes the same `tools`, `mutations`, `onToolCall`, `theme`, `color`, `tokens`,
  `darkTokens` and `lockUntil` as `<GistUI>`. `tools` are read-only and may run when an answer
  renders; `mutations` run only when the person presses a button.
- In the UI, a button's label and a form's submit go back to the model as the next message. Such a
  message has `origin: "ui"`: the thread labels it "Sent from the UI", and the model receives it
  wrapped (`wrapUiMessage`), so text chosen by a generated program is never mistaken for typed text.
  Send one yourself with `store.send(text, { origin: "ui" })`.
- One reply is one UI: all its ```` ```gistui ```` blocks form one program (`splitReply`,
  `replyProgram`), shown where the first block is. Other code blocks stay chat text.
- Only the latest answer keeps refreshing its data on a timer; earlier answers still load and still
  respond to the person.
- The thread is saved after each sent message, about once a second while a reply streams, and at
  the end. A saved error keeps its HTTP status but not the provider's text.
- `requestHistory(messages)` is what the model receives: failed, empty and still-streaming replies
  are left out.

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
