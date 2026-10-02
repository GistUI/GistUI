# GistUI Format: specification

GistUI Format is the text format a model writes to describe a user interface, and that renderers
show while it arrives. It is a content format, like HTML or Markdown. This folder holds its
specification, the schemas that go with it, a conformance suite and draft transport bindings.

## What is here

| Path | What | Status |
|---|---|---|
| [`gistui-format.md`](gistui-format.md) | GistUI Format 1.0: syntax, recovery rules, the tree, the runtime, limits, diagnostics, security | Working Draft. Normative, except parts marked informative |
| [`schemas/tree.schema.json`](schemas/tree.schema.json) | The abstract tree in JSON form | Working Draft |
| [`schemas/diagnostic.schema.json`](schemas/diagnostic.schema.json) | One diagnostic | Working Draft |
| [`schemas/catalog.schema.json`](schemas/catalog.schema.json) | The catalog manifest | Working Draft |
| [`schemas/action.schema.json`](schemas/action.schema.json) | The action envelope a renderer reports to its host | Working Draft |
| [`schemas/capabilities.schema.json`](schemas/capabilities.schema.json) | The capability object a host gives a generator | Working Draft |
| [`schemas/expected.schema.json`](schemas/expected.schema.json) | A conformance expectation file | Working Draft |
| [`schemas/check.mjs`](schemas/check.mjs) | A dependency-free script that checks the schemas against the conformance files | Tool |
| [`conformance/`](conformance/README.md) | Cases (`NN-name.gistui`), expected results, the catalog they use, a manifest | Part of the Working Draft |
| [`bindings/stream.md`](bindings/stream.md) | HTTP and SSE streams, inline mode in chat text | Draft binding, non-normative |
| [`bindings/mcp.md`](bindings/mcp.md) | MCP resources, tool results, MCP Apps views | Draft binding, non-normative |
| [`bindings/ag-ui.md`](bindings/ag-ui.md) | AG-UI events | Draft binding, non-normative |
| [`bindings/a2ui.md`](bindings/a2ui.md) | Relation to A2UI: a mapping sketch | Draft binding, non-normative |
| [`gistui-lang.md`](gistui-lang.md) | Pointer kept for old links | Replaced |

The schemas have `$id`s under `https://gistui.com/schemas/1.0/`. Those URLs are identifiers; the
files are not published there yet. The media type `text/vnd.gistui` is not registered yet.

## How the specification relates to the code

The specification was written from the reference implementation in `packages/core`. It is meant to
be precise enough for a second, independent implementation. Where the implementation was
inconsistent or silent, the specification chose one behaviour; Appendix D of the specification
lists those points. Until they are resolved, some conformance expectations record what the
implementation does today, and are marked `contested` in `conformance/manifest.json`.

## Claiming conformance

The specification defines five conformance classes (generator, processor, runtime, renderer,
catalog) and three profiles (Core, Interactive, Tools). See section 3 of the specification.

- A **processor** claim ("GistUI Format 1.0 processor, Core profile") requires passing every case
  in `conformance/manifest.json` that is not marked `contested`, for the profiles claimed. Each
  case is run twice: with the whole text at once, and one character at a time. Both runs must give
  the expected tree, the expected diagnostics in order, and the expected validity flags.
- A **catalog** claim requires that the manifest validates against `schemas/catalog.schema.json`
  and meets the constraints of section 9.3.
- **Runtime** and **renderer** claims have no test suite yet. They are made against the text of
  sections 18 to 24.
- A **generator** conforms when the programs it writes are clean: a conforming processor reports
  no diagnostic for them.

## Running the suite

With the reference implementation (Bun):

```sh
cd packages/core
bun test conformance            # every case, whole and one character at a time
GISTUI_UPDATE=1 bun test conformance   # regenerate expectations; review the diff before keeping it
```

Checking the schemas and the conformance files against them:

```sh
bun spec/schemas/check.mjs      # node works too
```

With another implementation: read [`conformance/README.md`](conformance/README.md). It describes
the files so that a runner in any language can use them.

## Changing the specification

- A change to behaviour needs a conformance case.
- A new recovery rule gets the next number (section 7). A new diagnostic code goes in the registry
  (section 22.3). Codes are never reused.
- Appendix C records changes from the previous draft.
