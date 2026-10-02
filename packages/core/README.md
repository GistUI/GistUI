# @gistui/core

The GistUI Lang engine: an incremental streaming parser, a patch-based materializer, validation with
deterministic repair, a canonical printer, edit-mode merge and a system-prompt generator.
It has zero dependencies and works in any JS runtime.

```ts
import { createStream, defineLibrary, generatePrompt } from "@gistui/core";

const lib = defineLibrary({ components: [/* ComponentSpec… */] });
const system = generatePrompt(lib).text;

const stream = createStream(lib);
stream.store.subscribe("root", () => render(stream.store.get("root")));
for await (const chunk of llmResponse) {
  stream.push(chunk); // string or UTF-8 bytes
  stream.flush(); // call once per frame; commits patches and notifies subscribers
}
stream.end(); // auto-closes, drops unresolved refs, reports errors
console.log(stream.errors());
```

- **`parse(source, lib)`**: one-shot parse. Returns `{root, store, errors, valid: {strict, lenient}}`.
- **`validate(source, lib)`**: validity, errors and the reachable component count.
- **`autofix(text, lib)`**: repairs a program with mistakes, in code (no model call): unknown props
  and extra arguments removed, invalid values corrected, missing required props filled, misspelled
  components renamed, dangling references dropped, unused statements placed. Every change is listed.
- **`toEditSource` / `merge`**: the canonical printout for edit turns, and the merge of an edit into
  a program.
- **`generatePrompt(lib, {mode, tools, examples, groups, progressive})`**: a byte-stable system prompt.

The language is specified in `spec/gistui-lang.md` in the GistUI repository, with a conformance suite
in `spec/conformance/`.

```sh
bun test               # unit, property, conformance and performance tests
bun run bench          # parser benchmarks → bench/results/parser.json
```
