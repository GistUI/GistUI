# GistUI Format conformance suite

Cases for processors of GistUI Format 1.0 ([`../gistui-format.md`](../gistui-format.md)). The suite
is data: any implementation, in any language, can run it.

## Files

| File | What |
|---|---|
| `NN-name.gistui` | The input: a program, exactly as it would arrive. Read it as bytes; some cases depend on a byte order mark, CR characters, tabs, or a missing final line break |
| `NN-name.expected.json` | The expected result for that input ([`../schemas/expected.schema.json`](../schemas/expected.schema.json)) |
| `library.json` | The catalog every case uses: a catalog manifest ([`../schemas/catalog.schema.json`](../schemas/catalog.schema.json)) |
| `manifest.json` | The list of cases: `file`, `expected`, `title`, `section` (of the specification), `profile`, and `contested` where it applies |

Numbers only order the cases. New cases take the next number.

## Running a case

1. Load `library.json` as the catalog (specification §9). The text component is `Text` and its
   text prop is `content` (the defaults).
2. Create a processor in **document mode** (§4.3), with no list of allowed hosts (§23.4).
3. Feed it the bytes of the `.gistui` file, then signal the end of the stream (§15).
4. Compare the result with the `.expected.json` file:

```json
{
  "tree": { "type": "Row", "props": { "gap": "lg" }, "children": [ { "type": "Text", "props": { "content": "a" } } ] },
  "errors": [ { "code": "unresolved-ref", "severity": "error", "stmt": "root", "line": 1, "fixed": true } ],
  "valid": { "strict": false, "lenient": true }
}
```

- **`tree`** is the tree from the root in the JSON form of §13.5, or `null` when there is no root.
  `props` and `children` are left out when empty. Node ids and `partial` are not written. A `dyn`
  value is the canonical text of the expression (Appendix B). A table is written as
  `{ "table": ["Name:s", "Total:n"], "rows": [[…], …] }`; the `text` of its cells is not compared.
  A component passed as a prop is written in place, as a node.
- **`errors`** is the list of diagnostics, in the order of §22.2. Only `code`, `severity`, `stmt`,
  `line` and `fixed` are compared. `stmt` and `line` are left out when the diagnostic has none;
  `fixed` is written only when it is `true`. Messages are not compared.
- **`valid`** holds the two flags of §17.

The comparison is exact: the same JSON values, lists in the same order.

## The streaming requirement

Every case MUST be run twice:

1. **Whole**: the complete input in one piece.
2. **One character at a time**: the input split after every character (every Unicode code point;
   a byte at a time is stricter and also allowed). After each piece the processor updates its
   intermediate state, as it would to draw a frame.

Both runs MUST give the expected result. This checks chunk invariance (§16). Intermediate states
are not compared.

## Profiles

`profile` names the lowest profile (§3.2) whose features the program uses: `core`, `interactive`
or `tools`. A processor runs **all** cases whatever profile it claims, because a Core processor
still parses expressions and keeps them (§10.2). The field is for runtimes and for reading the
suite.

## Contested cases

A case with a `contested` field records what the reference implementation does today, where that
differs from the specification (Appendix D). The text of the field says what the specification
asks for. These expectations will change when the difference is resolved. An independent
implementation that follows the specification will fail them, and SHOULD skip them until then.

## What the suite does not cover yet

- **Inline mode** (§4.3, §4.5). The runner has no way to choose the mode for a case, so program
  blocks, text blocks and chat text are tested only in the reference implementation's unit tests.
- **The URL load policy** with a list of allowed hosts (§23.4), for the same reason.
- **Runtime behaviour** (§18 to §20): evaluation, built-ins, queries, actions. Cases with
  `interactive` or `tools` only check that expressions are kept.
- **Intermediate states** while streaming, and node ids.
- **Limits** that need large inputs (§21), except the nesting depth.
- **The `text` of table cells** and the `hinted` flag of columns (§12.4), because the JSON form
  leaves them out.

## Regenerating expectations (reference implementation)

```sh
cd packages/core
bun test conformance                   # runs every case, whole and one character at a time
GISTUI_UPDATE=1 bun test conformance   # rewrites every expected file from the implementation
```

A missing expected file is created on the first run. Read every regenerated file against the
specification before keeping it. An expectation that follows the implementation but not the
specification gets a `contested` entry in `manifest.json`.

`bun spec/schemas/check.mjs` validates `library.json` and every expected file against the schemas.
