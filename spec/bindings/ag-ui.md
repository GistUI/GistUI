# Binding: AG-UI

**Draft binding. Non-normative.** It sketches how a GistUI Format 1.0 program travels in AG-UI
events. Names were checked on 2026-10-02 against AG-UI protocol 1.0
(<https://docs.ag-ui.com/sdk/js/core/events> and the generated types in
<https://github.com/ag-ui-protocol/ag-ui>). AG-UI describes itself as a user interaction protocol,
not a generative UI specification, and defines no carriage for third-party UI formats. Everything
below is therefore a convention of this binding.

## 1. In the text of an assistant message

The simplest carriage needs nothing new. The agent streams an assistant message, and the message
text is Markdown with program blocks (inline mode, format §4.3):

```
TEXT_MESSAGE_START   { messageId: "m1", role: "assistant" }
TEXT_MESSAGE_CONTENT { messageId: "m1", delta: "Here is the summary.\n\n```gistui\nroot = Card(" }
TEXT_MESSAGE_CONTENT { messageId: "m1", delta: "Stat(\"MRR\", \"$412k\"))\n```\n" }
TEXT_MESSAGE_END     { messageId: "m1" }
```

The client feeds each `delta` to a processor in inline mode. `TEXT_MESSAGE_END` is the end of the
stream. A client that does not know GistUI shows the block as code.

## 2. As an activity

AG-UI has activity messages (`role: "activity"`) with an `activityType` and a `content` object,
created by `ACTIVITY_SNAPSHOT` and changed by `ACTIVITY_DELTA` (a JSON Patch, RFC 6902). A program
can be carried as an activity, apart from the chat text:

```
ACTIVITY_SNAPSHOT { messageId: "ui1", activityType: "gistui",
                    content: { version: "1.0", catalog: "https://gistui.com/catalogs/default", source: "" } }
ACTIVITY_DELTA    { messageId: "ui1", activityType: "gistui",
                    patch: [ { "op": "replace", "path": "/source", "value": "root = Page(head)\nhead = Hea" } ] }
ACTIVITY_DELTA    { messageId: "ui1", activityType: "gistui",
                    patch: [ { "op": "replace", "path": "/source", "value": "root = Page(head)\nhead = Header(\"Q3\")\n" } ] }
```

- `content.source` is the program text so far. `content.done: true` marks the end of the stream.
- JSON Patch has no "append to a string" operation, so each delta replaces `/source` with the
  longer text. The client feeds the new suffix to the processor. An agent that wants small events
  can send `CUSTOM { name: "gistui.delta", value: { messageId: "ui1", text: "…" } }` instead.
- The `activityType` value `"gistui"` and the event name `"gistui.delta"` are this binding's
  choice.

## 3. Actions back to the agent

AG-UI sends user input as a new run (`RunAgentInput`: `threadId`, `runId`, `messages`, `tools`,
`state`, `context`, `forwardedProps`).

| GistUI envelope (format §20.3) | AG-UI |
|---|---|
| `send` | a new run whose `messages` end with a user message holding `message`. The client marks it as produced by the UI (format §23.7), for example in the message's metadata or in `forwardedProps` |
| `submit` | as `send`, with the envelope's `message`; the whole envelope in `forwardedProps` |
| `state` | optional: mirrored into the shared `state` of the next run |
| `emit` | application-defined; `forwardedProps` or a tool result |
| `tool` | `@query` and `@mutation` call tools the client holds. If the agent should run them, they are frontend tools: the client lists them in `tools` and answers with `TOOL_CALL_RESULT` |

## 4. Shared state

AG-UI `STATE_SNAPSHOT` and `STATE_DELTA` carry agent state. A host can pass that state to the
runtime as initial values of `$variables` (format §18.2). The format does not define a live link
between the two.

## Not verified

- Whether AG-UI clients preserve unknown `activityType` values. The AG-UI repository has
  middlewares that use `"a2ui-surface"` and `"mcp-apps"`; they are implementations, not part of the
  specification.
- Where provenance of a UI-produced user message is best recorded in `RunAgentInput`. The protocol
  has no field for it.
