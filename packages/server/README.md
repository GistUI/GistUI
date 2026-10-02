# @gistui/server

GistUI on the model side, for Node, Bun, Deno, Edge and Workers: read a model's stream as text,
validate the program, repair it in code, and (optionally) ask the model to fix only the statements
that are still wrong.

```sh
npm install @gistui/server @gistui/catalog
```

```ts
import { prompt, library } from "@gistui/catalog";
import { repairStream, textDeltas, toReadable } from "@gistui/server";

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: prompt().text }, ...messages] }),
});

// A failed request has no stream to read: answer with its status instead.
if (!res.ok) return new Response(await res.text(), { status: res.status });
// Text out of OpenAI-compatible, Anthropic, AI SDK, AG-UI or plain-text streams.
const text = textDeltas(res, "openai");
// Pass the program through; at the end, append repairs as edits if anything is still wrong.
return new Response(toReadable(repairStream(text, library)));
```

- `textDeltas(response, format)`: `"openai"` (and OpenAI-compatible gateways), `"anthropic"`,
  `"ai-sdk"`, `"agui"` or `"text"`. It throws when the provider reports an error (a non-ok response,
  or an error event in the stream), so a failed call is never an empty answer; the error has the
  HTTP `status` when there is one. Leaving the loop early cancels the upstream request.
- `validateProgram(text, library)`: `{ valid, errors, fixed }`.
- `repairProgram(text, library, { complete? })`: deterministic repair first (autofix, no model call);
  with `complete`, your model is asked to fix only the statements that still fail, with a small prompt.
- `repairStream(source, library, opts)`: the same, for a stream.
- With `complete`, a model round is kept only when it leaves fewer errors than before. The program
  and its errors are sent inside `<program>` and `<errors>` tags and described as data, so text in
  the program cannot pass for instructions.

The renderers (`@gistui/react`, `@gistui/vue`, `@gistui/svelte`, `@gistui/solid`, `@gistui/vanilla`) also
repair a finished program in code on their own, so this package is optional.
