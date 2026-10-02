/**
 * Model adapters for the chat store. Each POSTs the conversation and streams the reply's text.
 *
 * In a browser, point `url` at your own backend (which holds the API key and usually adds the
 * system prompt); passing `apiKey` directly is for local prototypes only: everyone who opens the
 * page can read the key, so each adapter created with one in a browser logs a warning.
 */

import { textDeltas, type StreamFormat } from "@gistui/server";
import type { ChatAdapter, ChatRequest } from "./store";

interface HttpOptions {
  url: string;
  headers?: Record<string, string>;
  /** Extra JSON fields merged into the request body. */
  body?: Record<string, unknown>;
  fetch?: typeof fetch;
}

async function post(o: HttpOptions, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await (o.fetch ?? fetch)(o.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...o.headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    // The message is shown in the thread; with `status`, the store saves only a generic text
    // ("The model request failed (HTTP 401)"), never the provider's response.
    throw Object.assign(new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`), { status: res.status });
  }
  return res;
}

/** An API key given to an adapter in a browser is readable by every visitor: say so, once per adapter. */
function warnBrowserKey(adapter: string, apiKey: string | undefined): void {
  if (!apiKey || typeof window === "undefined") return;
  console.warn(
    `@gistui/chat: ${adapter}({ apiKey }) sends your API key from the browser, where anyone who opens the page can read it. ` +
      "API keys belong on a server: point `url` at your own endpoint and keep the key there. Use `apiKey` for local prototypes only.",
  );
}

function http(format: StreamFormat, o: HttpOptions, toBody: (req: ChatRequest) => unknown): ChatAdapter {
  return async function* (req) {
    const res = await post(o, toBody(req), req.signal);
    yield* textDeltas(res, format);
  };
}

/**
 * OpenAI Chat Completions and every OpenAI-compatible API: OpenRouter
 * (`https://openrouter.ai/api/v1/chat/completions`), Vercel AI Gateway
 * (`https://ai-gateway.vercel.sh/v1/chat/completions`), Groq, Together, vLLM, Ollama…
 */
export function openai(o: Partial<HttpOptions> & { model: string; apiKey?: string }): ChatAdapter {
  warnBrowserKey("openai", o.apiKey);
  const url = o.url ?? "https://api.openai.com/v1/chat/completions";
  const headers = { ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}), ...o.headers };
  return http("openai", { ...o, url, headers }, (req) => ({ model: o.model, stream: true, messages: req.messages, ...o.body }));
}

/** Anthropic Messages. */
export function anthropic(o: Partial<HttpOptions> & { model: string; apiKey?: string; maxTokens?: number }): ChatAdapter {
  warnBrowserKey("anthropic", o.apiKey);
  const url = o.url ?? "https://api.anthropic.com/v1/messages";
  const headers = {
    "anthropic-version": "2023-06-01",
    ...(o.apiKey ? { "x-api-key": o.apiKey, "anthropic-dangerous-direct-browser-access": "true" } : {}),
    ...o.headers,
  };
  return http("anthropic", { ...o, url, headers }, (req) => {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    return {
      model: o.model,
      max_tokens: o.maxTokens ?? 8192,
      stream: true,
      ...(system ? { system } : {}),
      messages: req.messages.filter((m) => m.role !== "system"),
      ...o.body,
    };
  });
}

/**
 * A Vercel AI SDK route (`streamText(...).toUIMessageStreamResponse()`); the body matches `useChat`
 * (`{ messages: UIMessage[] }`), so `convertToModelMessages(messages)` works on the server.
 */
export function aiSdk(o: HttpOptions): ChatAdapter {
  return http("ai-sdk", o, (req) => ({
    messages: req.messages
      .filter((m) => m.role !== "system")
      .map((m, i) => ({ id: `m${i}`, role: m.role, parts: [{ type: "text", text: m.content }] })),
    ...o.body,
  }));
}

/** An AG-UI agent endpoint (`RunAgentInput` in, AG-UI events out). */
export function agui(o: HttpOptions & { threadId?: string }): ChatAdapter {
  const threadId = o.threadId ?? `t${Date.now().toString(36)}`;
  return http("agui", o, (req) => ({
    threadId,
    runId: `r${Date.now().toString(36)}`,
    messages: req.messages.map((m, i) => ({ id: `m${i}`, role: m.role, content: m.content })),
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...o.body,
  }));
}

/** Any endpoint that takes `{ messages }` and streams plain text back. */
export function textStream(o: HttpOptions): ChatAdapter {
  return http("text", o, (req) => ({ messages: req.messages, ...o.body }));
}
