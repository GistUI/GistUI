---
name: gistui
description: Build generative UI with GistUI. Use when adding AI-generated interfaces to an app in React, Vue, Svelte, Solid or vanilla JavaScript (render streamed model output as dashboards, forms, reports, slide decks, galleries), when wiring a model's system prompt, stream and actions to <GistUI> (plain fetch, the Vercel AI SDK, OpenAI, Anthropic), when writing or fixing GistUI Lang (`.gistui` programs, ```gistui fences), or when creating or restyling GistUI components, themes and tokens.
---

# GistUI

GistUI turns model output into streaming UI. The model writes **GistUI Lang**, a compact line-based
language (about half the tokens of JSON); `<GistUI>` parses it incrementally and renders a themed,
responsive component library while it streams.

Two files make up this skill:

- `SKILL.md` (this file): how to add GistUI to an app, customise it, and write GistUI Lang.
- `reference.md`: generated from the catalog; the exact system prompt the model receives, with every
  component, prop, enum and flag, the design guide and the canonical example. Read it before writing
  GistUI Lang by hand.

After `npm install @gistui/catalog`, both files are in `node_modules/@gistui/catalog/skills/gistui/`
and match the installed version. To keep the skill for later work, copy that folder to
`.claude/skills/gistui/` (Claude Code) or to your agent's skills folder.

## Add GistUI to an app

Work through these steps in order. Steps 1 to 4 are needed; 5 to 8 depend on the app.

### 1. Install

Find the app's framework and package manager, then install one renderer, the stylesheet and the catalog:

| App | Renderer |
|---|---|
| React 19 (Next.js, Vite, Remix) | `@gistui/react` |
| Vue 3.5+ (Nuxt) | `@gistui/vue` |
| Svelte 5 (SvelteKit) | `@gistui/svelte` |
| Solid (SolidStart) | `@gistui/solid` |
| Anything else, or no framework | `@gistui/vanilla` |

```sh
npm install @gistui/react @gistui/styles @gistui/catalog
```

All `@gistui/*` packages share one version: install and upgrade them together.

### 2. Server: give the model the system prompt and stream its text

Build the prompt where the model is called (it stays out of the browser bundle), and send the model's
text to the browser unchanged. The prompt is byte-stable, so provider prompt caching hits.

```ts
import { prompt } from "@gistui/catalog";

const system = prompt().text;
// prompt()                    "full": the whole reply is one UI
// prompt({ mode: "inline" })  chat text, with the UI in ```gistui fences (use this for chat)
// prompt({ mode: "edit" })    the reply is a patch to a UI that is already shown
```

**Vercel AI SDK** (`ai`): `streamText` works as it is.

```ts
import { convertToModelMessages, streamText } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model, system, messages: await convertToModelMessages(messages) });
  return result.toTextStreamResponse();          // for <GistUI stream={res.body}>
  // return result.toUIMessageStreamResponse();  // for useChat, or @gistui/chat's aiSdk() adapter
}
```

**Any provider, without an SDK**: `@gistui/server` turns a provider's event stream into text.

```ts
import { textDeltas, toReadable } from "@gistui/server";

const res = await fetch(providerUrl, { method: "POST", headers, body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: system }, ...messages] }) });
if (!res.ok) return new Response(await res.text(), { status: res.status });
// "openai" (and OpenAI-compatible gateways), "anthropic", "ai-sdk", "agui" or "text"
return new Response(toReadable(textDeltas(res, "openai")));
```

### 3. Client: import the stylesheet once and render the reply

`stream` takes a `ReadableStream` or async iterable of text or bytes. `source` + `streaming` takes a
growing string (only the appended part is parsed). Use one or the other.

```tsx
// React
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";

<GistUI library={ui} stream={response.body} onAction={handle} />;
```

```vue
<!-- Vue -->
<script setup lang="ts">
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/vue";
</script>
<template>
  <GistUI :source="answer" :streaming="loading" @action="handle" />
</template>
```

```svelte
<!-- Svelte -->
<script>
  import "@gistui/styles/styles.css";
  import { GistUI } from "@gistui/svelte";
</script>
<GistUI source={answer} streaming={loading} onaction={handle} />
```

```tsx
// Solid
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/solid";

<GistUI source={answer()} streaming={loading()} onAction={handle} />;
```

```ts
// Vanilla JavaScript
import "@gistui/styles/styles.css";
import { mount } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";

const view = mount(element, { library: ui, stream: response.body, onAction: handle });
// or: view.update({ source: textSoFar, streaming: true }); … view.destroy();
```

The same options exist in every renderer (as props, or as `mount` options): `inline`, `theme`
(`"system"` | `"light"` | `"dark"`), `color`, `tokens`, `darkTokens`, `tools`, `mutations`,
`onToolCall`, `allowedHosts`, `initialState`, `lockUntil`, `openLinks`, `paused`, `autofix`.
Callbacks are `onAction`, `onError`, `onStateChange`, `onProse`, `onAutofix` in React, Solid and
vanilla; events `@action`, `@error`… in Vue; `onaction`, `onerror`… in Svelte.

### 4. Handle actions in one callback

```ts
function handle(a) {
  if (a.type === "send") sendToModel(a.message);                     // a Button or FollowUps item was pressed
  else if (a.type === "submit" && !a.partial) save(a.formId, a.values); // a valid form; a.message is a readable summary
}
```

Other types: `open`, `emit`, `error`, `select`, `change`. In a chat, send `a.message` to the model as
the next user turn, for both `send` and `submit`.

### 5. Chat replies (text with a UI in it)

Use `prompt({ mode: "inline" })`. A reply is then chat text with ```gistui fences. Split it and render
the program; this works with any chat state, including the AI SDK's `useChat`:

```tsx
import { replyProgram, splitReply } from "@gistui/chat";

const parts = splitReply(text, { streaming });   // [{ kind: "text", text }, { kind: "ui", source, open }]
const program = replyProgram(parts);              // all fences of one reply form one program
// render the text parts as chat text, then:
<GistUI library={ui} source={program} streaming={streaming} onAction={handle} />;
```

Or let `@gistui/chat` hold the conversation. It is a headless store with model adapters and thread
storage; `@gistui/chat/react` has ready layouts (full page, sidebar, bottom tray).

```tsx
import { aiSdk, createChat, localThread } from "@gistui/chat";
import { Chat } from "@gistui/chat/react";
import "@gistui/chat/chat.css";

// Adapters: aiSdk({ url }), openai({ model, url }), anthropic({ model }), agui({ url }), textStream({ url }).
const store = createChat({ adapter: aiSdk({ url: "/api/chat" }), storage: localThread("support") });
<Chat store={store} library={ui} layout="sidebar" title="Assistant" />;
```

A button or form pressed inside an answer goes back as the next message with `origin: "ui"`, wrapped
so the model cannot mistake it for typed text (`store.send(text, { origin: "ui" })`).

### 6. Data and safety

A program is untrusted: a model wrote it, possibly steered by content it read. It cannot run code.

- `tools`: read-only functions (or an MCP-style client, `{ callTool }`). `@query` may call them as soon as the UI renders, so nothing here may change anything.
- `mutations`: functions that change something. They run only when a person presses a button.
- `onToolCall(call)`: called before every tool call; return `false` to block it.
- `allowedHosts`: hosts that images, video and backgrounds may load from. Set it when the model sees private data.

### 7. Validate or repair on the server (optional)

Every renderer already repairs a finished program in code (`autofix`, on by default, no model call).
Use `@gistui/server` when the stored or logged answer should be the repaired one:

```ts
import { library } from "@gistui/catalog";
import { repairStream, toReadable, validateProgram } from "@gistui/server";

validateProgram(text, library);                          // { valid, errors, fixed }
new Response(toReadable(repairStream(textStream, library))); // passes the text through, appends repairs at the end
// repairStream(…, { complete }) also asks your model to fix only the statements code could not.
```

### 8. CSS

All GistUI CSS is in `@layer gistui`. With Tailwind or global resets, order the layers so resets
cannot override components:

```css
@layer theme, base, gistui, components, utilities;
```

### Check that it works

Run the app and ask the model for "a dashboard of last month's sales". The screen should fill in
while the reply streams, and pressing a follow-up should send the next message. If nothing renders:
the stylesheet import is missing, the system prompt is not reaching the model, or the route is
sending provider events instead of text (use `textDeltas`, or `toTextStreamResponse()`).

## What the runtime does

- A `Button` without `do:` and every `FollowUps` item emit `{ type: "send", message }`: feed it back to the model as the next user turn.
- The runtime runs state, queries and actions in the browser:
  - **State:** `$range = "30d"` declares state. `bind:$range` binds it two-way on Input, TextArea, Select, Combobox, RadioGroup, CheckboxGroup, TagInput, Checkbox, Switch, Tabs (the selected label) and Chart (the selected x).
  - **Queries:** `sales = @query("get_sales", {range:$range}, default:[], every:60)` calls your `tools`. It re-runs when `$range` changes, is cached per argument set, and never runs while its statement is still streaming.
  - **Mutations:** `save = @mutation("save", {…})` runs through `@run(save)`; `save.status` is `idle`, `pending`, `success` or `error`.
  - **Actions:** `do:[@set($x, …), @run(save), @run(sales), @reset($x), @send("…"), @open(url), @emit("event", payload)]` run in order and stop at the first failure.
  - **What reaches `onAction`:** `@send`, `@open` (it also opens the link; `openLinks={false}` turns that off; http, https, mailto and tel only), `@emit`, and errors (`tool-not-found`, `tool-failed`, `blocked-url`).
  - **Expressions:** `@each(list, r => Card(r.name))`, `$tab == "x" ? a : b`, `"Total " + @fmt(@sum(rows.total), "$")`. Built-ins: count, first, last, sum, avg, min, max, sort, filter, round, abs, floor, ceil, fmt ($ % compact date), join. `rows.total` plucks a field from every row, and a pipe table works as a list of rows.
- A valid `Form` submit emits a `FormSubmitAction`:
  ```ts
  {
    type: "submit", form: "invite", nodeId: "invite/1",
    formId: "invite-v1",              // Form(…, id:"invite-v1"), or "form_" + a 16-hex fingerprint of the fields
    submissionId: "6f1c…-4…",         // UUID v4, new for every submit: use as an idempotency key
    submittedAt: "2026-09-30T10:12:00.000Z",
    partial: false,                   // true for drafts
    step: { index: 2, count: 3, title: "Plan" },   // step forms only
    values: { emails: ["ada@x.com"], role: "Editor", seats: 5, terms: true },   // typed; empty optionals left out
    fields: [{ name, label, component, type, input, required, multiple, options, default, hint, step, rules }],
    schema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties, required, additionalProperties: false },
    message: "Submitted \"invite\":\n- Email addresses: ada@x.com\n- Role: Editor",
  }
  ```
  - `formId` is stable: give known forms an `id:` and route on it; AI-generated forms get a fingerprint, so the same fields always give the same id.
  - `schema` is standard JSON Schema (like `z.toJSONSchema`), with `format: email|uri|date`, `enum` for options, `minimum`/`maximum`, `minLength`/`maxLength`, `pattern`, `minItems`/`maxItems`. Validate `values` on the server with any validator (Ajv, `z.fromJSONSchema`, …) or generate types from it.
  - `describeForm(node, get)`, `fieldSchema(field)` and `toData(fields, raw)` are exported to build the same description yourself. The `<form>` element carries `data-form-id`.
  - In a chat, send `message` to the model as the user's reply.
- React only: `import { prompt } from "@gistui/react/prompt"` is the same `prompt` as in `@gistui/catalog`; importing it also makes `ui.prompt()` work.
- Interactive parts stay locked until the stream ends (`lockUntil="done"`, the OpenUI default); `"ready"` unlocks each part as soon as it is complete.

## Customise

From least to most control:

1. **Theme presets**: `theme` (light/dark/system) and `color`: neutral, slate, stone, rose, pink, violet, indigo, blue, teal, green, orange, amber, red.
2. **Tokens from code**, scoped to one instance, overriding presets and model accents:
   ```tsx
   import { defineTheme } from "@gistui/react";
   const brand = defineTheme({ primary: "#0f766e", accent: "#0d9488", radius: 14, density: 0.9, font: "Geist, sans-serif", chart: ["#0d9488", "#f59e0b"] });
   <GistUI library={ui} tokens={brand} darkTokens={{ primary: "#2dd4bf", primaryFg: "#042f2e" }} … />
   ```
   Any `--gistui-*` variable can also be set in plain CSS.
3. **Style hooks**: every component has `data-gistui="Name"` plus variant attributes (`data-v`, `data-tone`, `data-size`); all CSS is in `@layer gistui`, so unlayered app CSS wins without `!important`.
4. **Swap a renderer, keep its schema** (the prompt and model output do not change): `const lib = ui.extend({ Card: MyCard })` in React and vanilla; `components={{ Card: MyCard }}` in Vue, Svelte and Solid, where `<GistChildren />` places the children. Each package's README shows a form field of your own joining the Form around it. For example, Mermaid diagrams: load Mermaid on the page (`window.mermaid`) and `Diagram` renders them; otherwise it shows the source.
5. **Add components**: `defineComponent({ name, args, children, props, description, component })` with plain prop specs or a Zod 4 / Standard JSON Schema, then `createLibrary({ components, unions, examples, guide })`. New components appear in the prompt automatically.
   - Column-oriented components, like `Table(Col…)` or `BarChart(labels, Series…)` in shadcn, OpenUI or MUI style, can still take one pipe table. Add `table: { labels: "labels", columns: { component: "Series", label: "category", values: "values", numeric: true } }` to the spec.
   - `BarChart(sales)` with `sales = |Week|Web|Store` then renders exactly as the parts written out. It costs a fraction of the tokens.
   - `values:` fills a one-series prop (pie charts). `columns.type` receives `number`/`string` from `Name:n` / `Name:s` header hints.

## Write GistUI Lang by hand

Follow `reference.md`. The rules that matter most:

- One statement per line: `id = value`. `root = …` first, then containers, then leaves, then data tables last.
- `Name(required positionals, children…, key:value)`. Optional props are always named; never pad with `null`.
- Enums and flags are bare words (`gap:lg`, `type:bar`, `Row(a, b, wrap)`). An enum value alone sets the one prop that has it: `Card(a, b, sunk)`, `Tag("Live", success)`. A statement with the same name always wins, so `Card(a, row)` with `row = …` defined is a child. Keep `key:value` when two props share a value. **Inside arrays, strings must be quoted** (`icons:["user", "users"]`); a bare word in an array is a reference.
- Give ids to sections and write small parts inline where they are used: `Buttons(Button("Save"), Button("Cancel", v:ghost))`. Each extra statement costs its id twice plus a line.
- Strings are JSON strings; a string child is Markdown.
- Text arguments are quoted, `Form("signup", …)`, `Select("plan", …)`; a bare word is a reference to a statement.
- Each component has its own enum values: copy them from that component's signature, never from a similar one.
- Tables are pipe rows (`|Month|Revenue` then `|Jul|380000`); the first column is the x axis or category. One table can feed Table, Chart, Stats and Timeline.
- Every id you use is defined exactly once. Keep ids short and lowercase, and never use a flag name as an id (the reference lists them).

### Composition that looks good

- Lead with `Header(title, subtitle, size:lg)`, then key numbers (`Stats` or `Tile` rows in `Grid(cols:2)`), then detail (`Chart`, `Table`, `Media`), then `FollowUps`.
- Side by side beats one long column: `Grid(cols:2-4)` collapses on phones by itself.
- Photos: `Media(src, title:, tag:, v:overlay)` in a Grid or `Carousel(per:3, nav:dots)`; sets of photos: `Gallery([…], captions:[…])` (lightbox); one photo: `Image(src, zoom)`.
- Forms: fields in `Card`s with `Header(size:sm)` inside one `Form`; `RadioGroup(v:cards)` for a plan, `CheckboxGroup(v:cards|chips)` for several, `v:segmented` for 2–4 short choices, `Combobox` for long lists, `TagInput` for keywords; `size:sm|lg` and `hint:` on any field.
- Forms and validation:
  - Rules live on fields: `required`, `type:email|url|number|tel`, `minLength`/`maxLength`, `min`/`max`, `pattern:"…"`, `match:"password"`, `protocols:["https"]` (URLs; default http and https), `error:"…"` (the message for an invalid value).
  - `TagInput(type:email)` checks every tag; `CheckboxGroup(min:, max:)` counts choices.
  - When to check: `Form(…, validate:submit|blur|change)`. `submit` is the default and re-checks a field as it is fixed. On submit, the first invalid field gets focus.
  - Step forms: `Form("signup", Step("Account", …), Step("Profile", …), submit:"Create")`. Continue validates the current step first.
  - Every form can submit. A primary `Button` submits; if there is none, a `Submit` button is added (`submit:"Label"` names it).
  - Drafts: `draft:"Save draft"` or `Button(…, type:draft)` saves with empty fields allowed (what is filled in is still checked).
  - `success:"…"` replaces the form with a thank-you panel; otherwise a "Submitted" note appears.
- Dialogs and drawers: `Button("Invite", opens:dlg)` + `dlg = Dialog("Invite teammates", Form(…), subtitle:, v:modal|drawer, side:right|left|bottom, size:sm|md|lg)`.
  - `Button("Cancel", v:ghost, close)` closes it, and so do Esc and a click on the backdrop.
  - A Form inside closes the dialog after a valid submit.
  - `Dialog(…, trigger:"Filters")` brings its own button.
- Tables with many rows: `sort`, `search`, `filter:["Col"]`, `tags:["Col"]`, `pageSize:`.
- Decks and reports: `Slides(Slide(…), …)`, one idea per slide, first slide `layout:center bg:gradient`.
- Anything else: `Box(dir:row, gap:, pad:, surface:, align:, justify:)`.

### Check your work

```ts
import { parse } from "@gistui/core";
import { library } from "@gistui/catalog";
const r = parse(source, library);
// r.valid.strict: no errors at all; r.valid.lenient: every error was repaired deterministically.
// r.errors: [{ code, stmtId, line, message, hint }] — fix each, or send them back to the model.
```

Only in the GistUI repository itself: `bun run test`, `bun run audit:responsive` (renders every
playground example at phone and tablet widths and fails on overflow), and `bun run skill` after
changing the catalog (a test fails if `reference.md` is stale).
