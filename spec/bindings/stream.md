# Binding: plain stream (HTTP and SSE)

**Draft binding. Non-normative.** It describes one way to carry a GistUI Format 1.0 document over
HTTP. The format itself is defined in [`../gistui-format.md`](../gistui-format.md). Key words are
used as in that document, but nothing here is required for conformance to the format.

## 1. HTTP response body

The simplest transport is the response body itself.

```
HTTP/1.1 200 OK
Content-Type: text/vnd.gistui; charset=utf-8; version=1.0
Cache-Control: no-store

root = Page(head, kpis)
head = Header("Q3 revenue")
…
```

- **Media type.** `text/vnd.gistui` for a program (document mode). The type is not registered yet
  (format §26.5). `charset`, if present, is `utf-8`. `version` and `catalog` are optional
  parameters; `catalog` carries the catalog id the generator used.
- **Chunking.** The body is sent as it is generated (HTTP/1.1 chunked transfer coding, or HTTP/2
  and HTTP/3 data frames). Chunk boundaries carry no meaning: a chunk can end inside a statement,
  inside a string, or inside a multi-byte character. The client feeds each chunk to the processor
  as it arrives.
- **End of stream.** The end of the body is the end of the stream (format §15). The client then
  tells the processor to finish.
- **Truncation.** If the connection drops, the client SHOULD still finish the processor with what
  arrived, show the result, and tell the person the answer is incomplete. Rules R2 and R3 close
  what was open.
- **Compression.** Content coding MAY be used. A proxy that buffers the whole body defeats
  streaming; `Cache-Control: no-transform` and `X-Accel-Buffering: no` are common remedies.

## 2. Server-sent events

Model providers and agent frameworks usually stream with `text/event-stream`. An SSE `data:` field
cannot hold a raw line break, and line breaks are significant in GistUI. So the text is carried as
JSON.

This binding uses three event names:

```
event: gistui.delta
data: {"text":"root = Page(head, kpis)\nhead = Hea"}

event: gistui.delta
data: {"text":"der(\"Q3 revenue\")\n"}

event: gistui.end
data: {}
```

- `gistui.delta`: `text` is the next piece of the document.
- `gistui.end`: the stream is complete. A client also treats the end of the connection as the end.
- `gistui.error`: `data` is `{"message": "…"}`. The server could not finish. The client finishes
  the processor with what arrived and shows the message.

A server that proxies a provider stream (OpenAI-compatible, Anthropic, AI SDK) does not need these
names: the client can read the provider's own text deltas and feed them to the processor. The
reference server package does this (`@gistui/server`, `textDeltas`).

## 3. Repair in the stream

A server can check a finished program and send corrections down the same stream. Because a later
statement replaces an earlier one (format §14), corrections are ordinary statements appended to the
text: `id = …`, `id.prop = …`, `id = null`. The client needs no special handling.

## 4. Inline mode in chat text

When the answer is chat text with UI in it, the body is Markdown (`text/markdown`) and the client
runs the processor in inline mode (format §4.3, §4.5):

````
Here is the summary you asked for.

```gistui
root = Card(Stat("MRR", "$412k", "+4.4%"))
```

Tell me if you want it by region.
````

- A block tagged `gistui` or `gist`, or with no tag, is a program block. Any other fenced block is
  chat text, including a `gistui` example nested inside it.
- All program blocks of one message form one program. A client that wants each block to be a
  separate UI runs one processor per block.
- A block that is still open when the stream ends is closed there.
- Text outside program blocks is passed to the host in order, to be rendered as Markdown.

## 5. Actions back to the server

This binding does not define a return channel. A host sends the action envelopes it wants the
server to see (format §20.3) with its own API, for example as the next chat message. Text that
comes from a `send` or `submit` envelope is marked as produced by the UI (format §23.7).

## Not verified

The SSE event names above are this binding's own choice. No registry or third-party specification
defines them.
