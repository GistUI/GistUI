# @gistui/chat

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
