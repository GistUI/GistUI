# Binding: Model Context Protocol (MCP)

**Draft binding. Non-normative.** It sketches three ways to use GistUI Format 1.0 with MCP. Names
were checked on 2026-10-02 against the MCP specification revision 2026-07-28
(<https://modelcontextprotocol.io/specification/2026-07-28>) and the MCP Apps extension, stable
revision 2026-01-26
(<https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx>).
Points that could not be verified are listed at the end.

## 1. A program as a resource

A server can expose a program as a text resource. `resources/read` returns:

```json
{
  "resultType": "complete",
  "contents": [
    { "uri": "gistui://reports/q3", "mimeType": "text/vnd.gistui", "text": "root = Page(…)\n…" }
  ]
}
```

- `mimeType` is `text/vnd.gistui` (not registered yet, format §26.5).
- The URI scheme is the server's choice; `gistui://` above is only an example.
- The client needs the catalog. The server can name it in the resource's `_meta` (for example
  `"_meta": { "gistui/catalog": "https://gistui.com/catalogs/default" }`), or expose the catalog
  manifest (format §9.6) as a second resource with `mimeType` `application/json`.

A resource is delivered whole, so there is no streaming here.

## 2. A program as a tool result

A tool can return a program in its `content`, as an embedded resource:

```json
{
  "resultType": "complete",
  "content": [
    { "type": "text", "text": "Q3 revenue was $1.2M, up 8%." },
    { "type": "resource",
      "resource": { "uri": "gistui://result/1", "mimeType": "text/vnd.gistui", "text": "root = Page(…)\n…" } }
  ]
}
```

- A host that knows GistUI renders the resource. A host that does not still has the text block.
  A server SHOULD always include such a fallback.
- The model sees the tool result. If the program is meant for the person only, the server can set
  the `audience` annotation of the resource block to `["user"]`.
- The program is untrusted to the host in the same way as any tool output (format §23).

## 3. A GistUI view as an MCP App

The MCP Apps extension (`io.modelcontextprotocol/ui`) lets a server ship an HTML view that the host
shows in a sandboxed iframe. A GistUI renderer fits in such a view. This is the most practical
binding today, because the host needs no GistUI support.

**Server side**

- A resource with a `ui://` URI and the MIME type `text/html;profile=mcp-app`. Its HTML loads the
  GistUI DOM renderer and a catalog, both bundled in the page or loaded from origins named in
  `_meta.ui.csp.resourceDomains`.
- A tool whose description links the view: `_meta.ui.resourceUri` set to the `ui://` URI.
- The tool returns the program in its result, as in section 2, or as `structuredContent`
  (for example `{ "gistui": "root = …" }`).

**View side** (inside the iframe), over JSON-RPC on `postMessage`:

1. The view sends `ui/initialize` and, when ready, `ui/notifications/initialized`.
2. The host sends `ui/notifications/tool-input` (and `ui/notifications/tool-input-partial` while
   arguments stream), then `ui/notifications/tool-result` with the tool's result.
3. The view takes the program from the result and mounts it. With partial input it can render
   while text arrives.
4. Theme and locale come from the host context of `ui/initialize` and
   `ui/notifications/host-context-changed`.

**Tools and actions go through the host.** The view has no network access of its own beyond what
`_meta.ui.csp` allows.

| GistUI | MCP Apps |
|---|---|
| `@query` and `@mutation` tool calls (format §19) | a `tools/call` request from the view to the host. The runtime's `tools` and `mutations` sets are lists of the server's tool names; the host applies its own consent rules |
| `send` envelope | `ui/message` with `role: "user"` and a text content block |
| `submit` envelope | `ui/message` with the envelope's `message`, or a `tools/call` of a tool the server provides for it |
| `open` envelope | `ui/open-link` |
| `state`, `emit` envelopes | `ui/update-model-context`, when the model should know |
| size of the rendered UI | `ui/notifications/size-changed` |

Security notes:

- The iframe sandbox contains the renderer. The format's own rules (format §23) still apply inside
  it: a program must not reach tools it should not, and the URL load policy must be on.
- A `tools/call` from the view is a request by untrusted program text. The split between read-only
  tools and mutations (format §19.3) decides which calls can happen without a gesture.
- `ui/message` puts text into the conversation as the user. Format §23.7 applies: the text was
  chosen by the program.

## Not verified

- How the extension capability (`capabilities.extensions["io.modelcontextprotocol/ui"]`) is
  negotiated under the stateless 2026-07-28 core revision. The Apps text describes it inside
  `initialize`.
- Whether hosts honour `audience` annotations on embedded resources when they build the model's
  context.
- The `_meta` key `gistui/catalog` in section 1 is this binding's own suggestion. MCP defines no
  such key.
- No MCP host is known to render `text/vnd.gistui` resources natively.
