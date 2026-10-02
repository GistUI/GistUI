---
name: gistui
description: Build generative UI with GistUI. Use when adding AI-generated interfaces to an app (render streamed model output as dashboards, forms, reports, slide decks, galleries), when writing or fixing GistUI Lang (`.gistui` programs, ```gistui fences), when creating or restyling GistUI components, themes and tokens, or when wiring a model's system prompt and actions to <GistUI>.
---

# GistUI

GistUI turns model output into streaming UI. The model writes **GistUI Lang**, a compact line-based
language (about half the tokens of JSON); `<GistUI>` parses it incrementally and renders a themed,
responsive component library while it streams.

`reference.md` in this folder is generated from the catalog and is the exact system prompt the model
receives: every component, prop, enum and flag, the design guide and the canonical example. Read it
before writing GistUI Lang by hand.

## Wire it into an app (React)

```tsx
import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";

// 1. System prompt for your model, built where you call it (usually the server). Byte-stable, so
//    provider prompt caching hits. The browser bundle leaves the prompt text out.
import { prompt } from "@gistui/react/prompt";
const system = prompt({ mode: "inline" }).text; // "full" (UI only), "edit" (patches), "inline" (chat + ```gistui fences)
// (importing "@gistui/react/prompt" also makes ui.prompt() work; without it ui.prompt() throws.)

// 2. Render the streamed reply: a ReadableStream / AsyncIterable, or a growing string.
<GistUI
  library={ui}
  stream={response.body}            // or: source={text} streaming={isStreaming}
  inline                            // chat text outside ```gistui fences goes to onProse
  theme="system"                    // light | dark | system
  color="violet"                    // optional host theme; overrides the model's Page(accent:)
  onAction={(a) => { /* send | open | emit | error | select | change | submit */ }}
  tools={{ get_sales: async ({ range }) => fetchSales(range) }}   // for @query / @mutation (or an MCP client: { callTool })
  initialState={{ range: "30d" }}   // optional values for $state variables
  onStateChange={(name, value) => {}}
  onError={(errors) => { /* final diagnostics; [] when valid */ }}
/>;
```

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
- Interactive parts stay locked until the stream ends (`lockUntil="done"`, the OpenUI default); `"ready"` unlocks each part as soon as it is complete.
- If the app uses Tailwind or global resets, order the layers so resets cannot override components: `@layer theme, base, gistui, components, utilities;`.

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
4. **Swap a renderer, keep its schema** (the prompt and model output do not change): `const lib = ui.extend({ Card: MyCard })`. For example, Mermaid diagrams: load Mermaid on the page (`window.mermaid`) and `Diagram` renders them; otherwise it shows the source.
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

In this repo: `bun run test`, `bun run audit:responsive` (renders every playground example at phone and
tablet widths and fails on overflow), and `bun run skill` after changing the catalog (a test fails if
`reference.md` is stale).
