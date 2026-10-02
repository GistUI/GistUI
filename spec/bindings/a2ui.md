# Binding: relation to A2UI

**Draft binding. Non-normative. A mapping sketch.** It describes how a GistUI Format 1.0 tree and
catalog relate to A2UI, so that a GistUI program can be shown by an A2UI renderer, or an A2UI
catalog used from GistUI. A2UI names were checked on 2026-10-02 against the A2UI specification,
version 0.9.1 (<https://a2ui.org/>, <https://github.com/a2ui-project/a2ui/tree/main/specification>).
Version 1.0 was a candidate at that time and differs in places.

## 1. The two models

| | GistUI Format | A2UI 0.9.1 |
|---|---|---|
| What the model writes | line-based text | JSON messages |
| Units | statements with ids; nested calls allowed | a flat list of components with ids; children by id |
| Root | the statement `root` | the component with id `root` |
| Component set | a catalog manifest (format §9.6) | a catalog (JSON Schema document) named by `catalogId` |
| Data | tables and data statements, inlined into props | a data model per surface; components bind with `{"path": "/x"}` |
| State and logic | `$state`, expressions, built-ins, evaluated on the client | data model updates from the agent; client functions |
| Updates | later statements replace earlier ones | `updateComponents`, `updateDataModel` |
| User input | action envelopes | `action` messages to the agent |

Both keep components in a flat, id-addressed set that can be filled in any order. That makes a
static mapping direct.

## 2. Compiling a tree to A2UI messages

Input: the nodes of a finished program (format §13). Output: A2UI 0.9.1 messages.

1. `createSurface` with a `surfaceId` and the `catalogId` of the A2UI catalog in use.
2. `updateComponents` with one entry for each node reached from the root:
   - `id`: the node id (format §13.3). The root node is written with the id `root`.
   - `component`: the A2UI component name for the node's type (section 3).
   - props: each entry of `props`, renamed and converted for the target catalog.
   - `children`: the list of child ids. A node referenced from two places is listed twice by id;
     A2UI components are id-addressed, so no copy is needed.
   - a node prop of type `node` becomes a `child`-style reference by id.
3. A table value has no A2UI counterpart as a literal. It is written into the data model with
   `updateDataModel` (for example at `/tables/<statement id>`), and the component binds to that
   path.
4. While a program streams, the compiler can send `updateComponents` again for the nodes that
   changed. `#pending` nodes are left out.

What does not map statically:

- **Runtime expressions** (`dyn`, `#expr`). A compiler has two choices. It can evaluate them on its
  own side with a GistUI runtime and send the results, sending new `updateComponents` or
  `updateDataModel` messages when state changes. Or it can map simple cases to A2UI bindings: a
  prop that is just `$name` becomes `{"path": "/state/name"}`.
- **`@each`** over a list maps to an A2UI template child (`{"path": "/list", "componentId": "tpl"}`)
  only when the item component reads nothing but item fields.
- **Action lists.** `@send`, `@emit` and `submit` map to an A2UI `action.event` with a `name` and
  `context`. `@set` and `@run` need the compiler's own runtime, or A2UI client functions.
- **Diagnostics** have no A2UI counterpart. A2UI reports client errors with an `error` message
  (`VALIDATION_FAILED`).

## 3. Converting a catalog

An A2UI catalog is a JSON Schema document with `catalogId`, `components` and `functions`. A GistUI
catalog manifest can be produced from it, and the other way round, with losses on both sides.

| GistUI manifest | A2UI catalog |
|---|---|
| `id`, `version` | `catalogId` |
| component `name` | key in `components` |
| `props` with `type` | the component's JSON Schema properties (`string`, `number`, `boolean`, `enum`, `array`, `object`) |
| `required` | JSON Schema `required` |
| `children: true` | a `children` property (list of ids or a template) |
| prop of type `node` | a `child` property (one id) |
| `args` (positional order) | none. A converter picks an order: required props first, in schema order |
| `aliases`, enum `aliases`, `open` | none |
| prop of type `action` | an `action` property |
| prop of type `state` | a property bound with `{"path": …}` |
| `table` mappings | none |

The reference implementation can read a JSON Schema into prop definitions
(`propsFromJSONSchema` in `@gistui/core`); positional order and children have to be added by hand.

## 4. Transport

A2UI messages travel as `application/a2ui+json` (0.9.1) inside A2A data parts, or over AG-UI, MCP,
SSE or WebSockets. A GistUI program compiled to A2UI is, on the wire, plain A2UI: the receiving
renderer does not need to know GistUI.

## Not verified

- No compiler or catalog converter exists in the GistUI repository at the time of writing. This
  document is a design sketch, not a description of code.
- The A2UI 0.9.1 documentation and the basic catalog file disagree on the catalog's own URL
  (`v0_9_1` in the examples, `v0_9` in the file).
- A2UI 1.0 (candidate) adds `callRendererFunction` and `agentFunctionResponse` and lets components
  carry their own `catalogId`. The mapping above was not checked against it.
- Whether A2UI template children can express every `@each` form was not tested.
