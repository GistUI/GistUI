/**
 * A headless chat: messages, sending, streaming replies from an adapter, stop and regenerate. No
 * framework; `subscribe` + `getSnapshot` plug into React's `useSyncExternalStore` (or any store).
 *
 * - A reply's text grows as its deltas arrive; updates are batched to one per animation frame.
 * - Messages are immutable: a settled message keeps its object, so a UI can skip re-rendering it.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  status: "done" | "streaming" | "error" | "stopped";
  error?: string;
  createdAt: number;
  /**
   * Who wrote a user message: the person (`typed`, the default) or the generated UI (`ui`: the text
   * of a button's `@send` or a form's summary, chosen by the model-written program). A `ui` message
   * is marked as such for the model (see `wrapUiMessage`) and in the thread.
   */
  origin?: "typed" | "ui";
  /** With `origin: "ui"`: the UI action it came from (a button's `send`, the default, or a form's `submit`). */
  action?: "send" | "submit";
}

/** Where a sent message comes from (see `ChatMessage.origin`). */
export type SendOptions = Pick<ChatMessage, "origin" | "action">;

/** What an adapter receives: the conversation so far (with the system prompt, if any, first). */
export interface ChatRequest {
  messages: { role: "system" | ChatRole; content: string }[];
  signal: AbortSignal;
}

/** Streams the assistant's reply as text deltas. */
export type ChatAdapter = (req: ChatRequest) => AsyncIterable<string>;

export interface ThreadStorage {
  load(): ChatMessage[] | null;
  save(messages: readonly ChatMessage[]): void;
}

export interface ChatOptions {
  adapter: ChatAdapter;
  /** System prompt, e.g. `prompt({ mode: "inline" }).text` from `@gistui/react/prompt`. Usually added on your server instead. */
  system?: string;
  initialMessages?: readonly ChatMessage[];
  /** Persists the thread (see `localThread`). */
  storage?: ThreadStorage;
  onError?: (error: Error) => void;
}

export interface ChatSnapshot {
  messages: readonly ChatMessage[];
  status: "idle" | "streaming";
}

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** While a reply streams, the thread is saved this often (ms). */
const SAVE_EVERY = 1000;

const STATUSES: ReadonlySet<unknown> = new Set(["done", "streaming", "error", "stopped"]);

/** A stored entry that has the shape of a message: an object with a known role and text content. */
export function isChatMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as { role?: unknown; content?: unknown };
  return (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string";
}

/** Brackets that could pass for the wrapper of `wrapUiMessage` become parentheses. */
const defuse = (text: string): string => text.replace(/\[(\s*the\s+user\b[^\]\n]*)(\]?)/gi, (_, inner: string, close: string) => `(${inner}${close ? ")" : ""}`);

/**
 * What the model receives for a message that came from the generated UI instead of the keyboard, so
 * it can tell a click from typed text (a program could otherwise put words in the person's mouth):
 *
 *   [The user clicked a button in the UI. Button action text: "Show details"]
 *   [The user submitted a form in the UI]\n<the form's summary>
 *
 * The button text is quoted on one line; text that imitates the wrapper is defused.
 */
export function wrapUiMessage(text: string, action: "send" | "submit" = "send"): string {
  if (action === "submit") return `[The user submitted a form in the UI]\n${defuse(text)}`;
  return `[The user clicked a button in the UI. Button action text: ${JSON.stringify(defuse(text))}]`;
}

/**
 * The conversation as it is sent to the model. Left out: replies that failed or are still
 * streaming, messages without text (a reply stopped before its first token), and assistant messages
 * before the first user message (a greeting is for the person, and APIs reject a conversation that
 * starts with the assistant).
 */
export function requestHistory(messages: readonly ChatMessage[]): { role: ChatRole; content: string }[] {
  const out: { role: ChatRole; content: string }[] = [];
  let asked = false;
  for (const m of messages) {
    if (m.status === "error" || m.status === "streaming" || !m.content.trim()) continue;
    if (m.role === "user") asked = true;
    else if (m.role === "assistant" && !asked) continue;
    out.push({ role: m.role, content: m.origin === "ui" ? wrapUiMessage(m.content, m.action) : m.content });
  }
  return out;
}

const schedule: (cb: () => void) => void =
  typeof requestAnimationFrame === "function" ? (cb) => void requestAnimationFrame(cb) : (cb) => void setTimeout(cb, 16);

export class ChatStore {
  private snapshot: ChatSnapshot;
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private pending = false;
  private savedAt = 0;
  /** What is saved instead of an error's text (which may quote the provider's response), by message id. */
  private readonly savedErrors = new Map<string, string>();

  constructor(private readonly opts: ChatOptions) {
    let saved: unknown = null;
    try {
      saved = opts.storage?.load();
    } catch {
      /* unreadable storage: start from the initial messages */
    }
    // Stored data can be anything: entries that are not messages are dropped, missing fields filled.
    // A reply cut off by a reload is kept as stopped.
    const messages = (Array.isArray(saved) ? saved : (opts.initialMessages ?? [])).filter(isChatMessage).map((m): ChatMessage => {
      const status = m.status === "streaming" ? "stopped" : STATUSES.has(m.status) ? m.status : "done";
      const id = typeof m.id === "string" && m.id ? m.id : newId();
      const createdAt = typeof m.createdAt === "number" ? m.createdAt : Date.now();
      return status === m.status && id === m.id && createdAt === m.createdAt ? m : { ...m, id, status, createdAt };
    });
    this.snapshot = { messages, status: "idle" };
  }

  getSnapshot = (): ChatSnapshot => this.snapshot;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(next: Partial<ChatSnapshot>, now = false): void {
    this.snapshot = { ...this.snapshot, ...next };
    if (now) return this.emit();
    if (this.pending) return;
    this.pending = true;
    schedule(() => this.emit());
  }

  private emit(): void {
    this.pending = false;
    for (const fn of [...this.listeners]) fn();
  }

  private update(id: string, patch: Partial<ChatMessage>, now = false): void {
    this.set({ messages: this.snapshot.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, now);
  }

  /**
   * Sends a user message and streams the reply. Resolves when the reply ends. Pass
   * `{ origin: "ui" }` for text that comes from the generated UI and not from the person's keyboard.
   */
  async send(text: string, from: SendOptions = {}): Promise<void> {
    const content = text.trim();
    if (!content) return;
    this.stop();
    const user: ChatMessage = { id: newId(), role: "user", content, status: "done", createdAt: Date.now() };
    if (from.origin === "ui") {
      user.origin = "ui";
      if (from.action === "submit") user.action = "submit";
    }
    this.set({ messages: [...this.snapshot.messages, user] }, true);
    // Saved before the reply starts, so a reload never loses what was asked.
    this.save();
    await this.reply();
  }

  /** Replaces the last reply with a new one. */
  async regenerate(): Promise<void> {
    this.stop();
    const msgs = [...this.snapshot.messages];
    while (msgs.length && msgs[msgs.length - 1]!.role === "assistant") msgs.pop();
    if (!msgs.length) return;
    this.set({ messages: msgs }, true);
    await this.reply();
  }

  /** Stops the reply that is streaming (its text so far is kept). */
  stop(): void {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    // Marked now, not when its loop notices: a message sent right after still has this reply in its history.
    if (this.snapshot.messages.some((m) => m.status === "streaming")) {
      this.set({ messages: this.snapshot.messages.map((m) => (m.status === "streaming" ? { ...m, status: "stopped" as const } : m)) }, true);
    }
  }

  clear(): void {
    this.stop();
    this.set({ messages: [], status: "idle" }, true);
    this.savedErrors.clear();
    this.save();
  }

  /** Writes the thread to storage. A failing storage never breaks the chat. */
  private save(): void {
    const storage = this.opts.storage;
    if (!storage) return;
    this.savedAt = Date.now();
    const errors = this.savedErrors;
    try {
      storage.save(errors.size ? this.snapshot.messages.map((m) => (m.status === "error" && errors.has(m.id) ? { ...m, error: errors.get(m.id)! } : m)) : this.snapshot.messages);
    } catch {
      /* storage full or blocked */
    }
  }

  private async reply(): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const reply: ChatMessage = { id: newId(), role: "assistant", content: "", status: "streaming", createdAt: Date.now() };
    const history = requestHistory(this.snapshot.messages);
    this.set({ messages: [...this.snapshot.messages, reply], status: "streaming" }, true);
    let content = "";
    try {
      const messages = this.opts.system ? [{ role: "system" as const, content: this.opts.system }, ...history] : history;
      for await (const delta of this.opts.adapter({ messages, signal: controller.signal })) {
        if (controller.signal.aborted) break;
        content += delta;
        this.update(reply.id, { content });
        // A reload in the middle of a reply keeps what has arrived so far.
        if (Date.now() - this.savedAt >= SAVE_EVERY) this.save();
      }
      this.update(reply.id, { content, status: controller.signal.aborted ? "stopped" : "done" }, true);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (controller.signal.aborted || err.name === "AbortError") this.update(reply.id, { content, status: "stopped" }, true);
      else {
        // Shown as it is, but saved without the provider's text.
        const status = (err as { status?: unknown }).status;
        this.savedErrors.set(reply.id, typeof status === "number" ? `The model request failed (HTTP ${status})` : "The model request failed");
        this.update(reply.id, { content, status: "error", error: err.message }, true);
        this.opts.onError?.(err);
      }
    } finally {
      if (this.controller === controller) this.controller = null;
      this.set({ status: this.controller ? "streaming" : "idle" }, true);
      this.save();
    }
  }
}

export function createChat(opts: ChatOptions): ChatStore {
  return new ChatStore(opts);
}
