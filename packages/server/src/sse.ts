/**
 * Reading model streams as plain text deltas, for every common wire format. Web streams only, so it
 * runs in Node 18+, Bun, Deno, Edge runtimes and browsers.
 *
 *   for await (const text of textDeltas(response, "openai")) …
 */

/** Wire formats `textDeltas` understands. */
export type StreamFormat =
  /** OpenAI Chat Completions (and OpenAI-compatible: OpenRouter, Vercel AI Gateway, Groq, vLLM…), plus the Responses API. */
  | "openai"
  /** Anthropic Messages. */
  | "anthropic"
  /** Vercel AI SDK: the UI message stream (v5) and the data stream protocol (v4). */
  | "ai-sdk"
  /** AG-UI events. */
  | "agui"
  /** Plain text chunks (e.g. the AI SDK's `toTextStreamResponse()`). */
  | "text";

export interface SSEEvent {
  event?: string | undefined;
  data: string;
}

type Body = ReadableStream<Uint8Array> | Response | AsyncIterable<Uint8Array | string>;

/** Longest upstream error text kept in an `Error` message. */
const MAX_ERROR = 300;
/** Longest single SSE line (in characters); a longer one is not a model stream. */
const MAX_LINE = 1 << 20;

const clip = (s: string): string => (s.length > MAX_ERROR ? `${s.slice(0, MAX_ERROR)}…` : s);

/** The readable part of an upstream error: a string, `{ message }`, or `{ error: … }`. */
function errorText(e: unknown, fallback: string): string {
  const m = typeof e === "string" ? e : e && typeof e === "object" ? ((e as { message?: unknown }).message ?? (e as { error?: unknown }).error) : undefined;
  if (m && typeof m === "object") return errorText(m, fallback);
  return clip(typeof m === "string" && m.trim() ? m.trim() : fallback);
}

/** A response that is not 2xx carries an error body, not a stream: throws with its status and message. */
async function failed(res: Response): Promise<never> {
  let detail = "";
  try {
    const text = (await res.text()).trim();
    detail = errorText(json(text), clip(text));
  } catch {
    /* no readable body */
  }
  const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  throw Object.assign(new Error(detail ? `${status}: ${detail}` : status), { status: res.status });
}

async function* bytes(input: Body): AsyncGenerator<string> {
  if (input instanceof Response && !input.ok) await failed(input);
  const decoder = new TextDecoder();
  const src = input instanceof Response ? input.body : input;
  if (!src) return;
  if (typeof (src as ReadableStream).getReader === "function") {
    const reader = (src as ReadableStream<Uint8Array>).getReader();
    let done = false;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) {
          done = true;
          break;
        }
        yield decoder.decode(r.value, { stream: true });
      }
    } finally {
      // Left before the end (a `break`, an error, a client that went away): tell the source to stop,
      // so the provider stops generating.
      if (!done) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else {
    for await (const chunk of src as AsyncIterable<Uint8Array | string>) yield typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  }
  const rest = decoder.decode();
  if (rest) yield rest;
}

/**
 * Server-sent events from a stream (`event:` and multi-line `data:` fields). A line or an event
 * longer than 1 MB throws: nothing a model API sends is that long, and the buffer must not grow
 * without limit.
 */
export async function* readSSE(input: Body): AsyncGenerator<SSEEvent> {
  let buf = "";
  let event: string | undefined;
  let data: string[] = [];
  let size = 0;
  const flush = function* () {
    if (data.length) yield { event, data: data.join("\n") } satisfies SSEEvent;
    event = undefined;
    data = [];
    size = 0;
  };
  for await (const chunk of bytes(input)) {
    buf += chunk;
    for (;;) {
      const nl = buf.search(/\r?\n/);
      if (nl < 0) break;
      const line = buf.slice(0, nl);
      buf = buf.slice(buf[nl] === "\r" ? nl + 2 : nl + 1);
      if (line === "") yield* flush();
      else if (line.startsWith(":")) continue;
      else {
        const i = line.indexOf(":");
        const field = i < 0 ? line : line.slice(0, i);
        const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
        if (field === "data") {
          // The same limit for one event made of many `data:` lines.
          if ((size += value.length) > MAX_LINE) throw new Error(`SSE event longer than ${MAX_LINE} characters`);
          data.push(value);
        } else if (field === "event") event = value;
        // A v4 AI SDK data stream has no "data:" prefix and no blank lines: each `0:"text"` line is
        // an event of its own.
        else if (/^\d$/.test(field) || /^[a-z]$/.test(field)) {
          yield* flush();
          yield { event: undefined, data: line };
        }
      }
    }
    // What is left is one unfinished line.
    if (buf.length > MAX_LINE) throw new Error(`SSE line longer than ${MAX_LINE} characters`);
  }
  if (buf.startsWith("data:")) data.push(buf.slice(5).replace(/^ /, ""));
  yield* flush();
  if (/^[0-9a-z]:/.test(buf)) yield { event: undefined, data: buf };
}

const json = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/**
 * Text deltas from a model response, whatever its wire format.
 *
 * Throws when the provider reports an error (a `Response` that is not ok, or an error event in the
 * stream), so a reply that was cut off is never mistaken for a complete one. Leaving the loop early
 * cancels the upstream body.
 */
export async function* textDeltas(input: Body, format: StreamFormat): AsyncGenerator<string> {
  if (format === "text") {
    yield* bytes(input);
    return;
  }
  for await (const ev of readSSE(input)) {
    if (ev.data === "[DONE]") return;
    if (format === "ai-sdk" && /^[03]:/.test(ev.data)) {
      // v4 data stream parts: `0:` is text, `3:` is an error.
      const t = json(ev.data.slice(2));
      if (ev.data[0] === "3") throw new Error(errorText(t, "stream error"));
      if (typeof t === "string") yield t;
      continue;
    }
    const d = json(ev.data);
    if (!d || typeof d !== "object") continue;
    let t: unknown;
    switch (format) {
      case "openai":
        // Chat Completions (and gateways) send `{ error }`; the Responses API sends `error` and
        // `response.failed` events.
        if (d.error) throw new Error(errorText(d.error, "stream error"));
        if (d.type === "error") throw new Error(errorText(d, "stream error"));
        if (d.type === "response.failed") throw new Error(errorText(d.response?.error, "response failed"));
        t = d.choices?.[0]?.delta?.content ?? (d.type === "response.output_text.delta" ? d.delta : undefined);
        break;
      case "anthropic":
        if (d.type === "error") throw new Error(errorText(d.error, "Anthropic stream error"));
        t = d.type === "content_block_delta" && d.delta?.type === "text_delta" ? d.delta.text : undefined;
        break;
      case "ai-sdk":
        if (d.type === "error") throw new Error(errorText(d.errorText, "stream error"));
        t = d.type === "text-delta" ? (d.delta ?? d.textDelta) : undefined;
        break;
      case "agui":
        if (d.type === "RUN_ERROR") throw new Error(errorText(d.message, "run error"));
        t = d.type === "TEXT_MESSAGE_CONTENT" || d.type === "TEXT_MESSAGE_CHUNK" ? d.delta : undefined;
        break;
    }
    if (typeof t === "string" && t) yield t;
  }
}
