/**
 * The non-React half of the renderer: owns a core stream, batches patches into one flush per animation
 * frame, and flushes immediately until the root exists (fastest time to first render).
 */

import { createStream, parse, parseStatement, REPAIRABLE, Runtime, type GistUIError, type GistUIStream, type Library, type NodeStore, type Patch, type RuntimeOptions } from "@gistui/core";

export interface EngineOptions {
  inline?: boolean;
  onProse?: (text: string, line: number) => void;
  onFlush?: (patches: readonly Patch[]) => void;
  runtime?: RuntimeOptions;
  /**
   * Hosts that images, video and backgrounds may load from (`"cdn.example.com"`, `"*.example.com"`;
   * relative URLs and the page's own host always load). Without it, any host is allowed for a URL
   * the program wrote out, and a URL it assembled from data is not loaded.
   */
  allowedHosts?: readonly string[] | undefined;
}

const raf: (cb: () => void) => unknown =
  typeof requestAnimationFrame === "function" ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16);
const caf: (h: unknown) => void =
  typeof cancelAnimationFrame === "function" ? (h) => cancelAnimationFrame(h as number) : (h) => clearTimeout(h as ReturnType<typeof setTimeout>);

export class Engine {
  readonly stream: GistUIStream;
  readonly store: NodeStore;
  readonly runtime: Runtime;
  /** Characters of a growing `source` string already pushed. */
  consumed = "";
  /** True once anything was pushed: a new input then needs a new engine. */
  used = false;
  ended = false;
  private frame: unknown = null;
  /** Everything received, as text (autofix needs the whole program). */
  private received: string[] = [];
  private decoder: TextDecoder | null = null;

  constructor(
    lib: Library,
    private readonly opts: EngineOptions = {},
  ) {
    this.stream = createStream(lib, { inline: opts.inline ?? false, allowedHosts: opts.allowedHosts, ...(opts.onProse ? { onProse: opts.onProse } : {}) });
    this.store = this.stream.store;
    this.runtime = new Runtime(this.stream, opts.runtime);
  }

  push(chunk: string | Uint8Array): void {
    if (this.ended) return;
    this.used = true;
    this.received.push(typeof chunk === "string" ? chunk : (this.decoder ??= new TextDecoder("utf-8")).decode(chunk, { stream: true }));
    this.stream.push(chunk);
    if (!this.store.root) this.flush();
    else if (this.frame === null) {
      this.frame = raf(() => {
        this.frame = null;
        this.flush();
      });
    }
  }

  flush(): void {
    const patches = this.stream.flush();
    if (patches.length) {
      this.runtime.sync();
      this.opts.onFlush?.(patches);
    }
  }

  end(): void {
    if (this.ended) return;
    if (this.frame !== null) {
      caf(this.frame);
      this.frame = null;
    }
    this.ended = true;
    if (this.decoder) this.received.push(this.decoder.decode());
    const patches = this.stream.end();
    this.runtime.sync();
    if (patches.length) this.opts.onFlush?.(patches);
  }

  /**
   * After `end()`: shows a repaired program in place of the received one. It is parsed into the same
   * store, so what the repair did not touch keeps its identity (nothing remounts, queries do not
   * re-run); only the changed nodes are patched.
   */
  rewrite(source: string): void {
    const patches = this.stream.rewrite(source);
    this.runtime.sync();
    if (patches.length) this.opts.onFlush?.(patches);
  }

  /** The whole text received so far. */
  get text(): string {
    return this.received.join("");
  }

  dispose(): void {
    this.runtime.dispose();
    if (this.frame !== null) caf(this.frame);
    this.frame = null;
  }
}

export interface AutofixOutcome {
  /** The repaired program, in the shape it was written (for `Engine.rewrite`). */
  source: string;
  /** What was changed, one line each. */
  changes: string[];
  /** Errors left after the repair ([] when it is now valid). */
  errors: GistUIError[];
}

/** True when the ended program has errors autofix can repair. */
export const canAutofix = (errors: readonly GistUIError[]): boolean => errors.some((e) => REPAIRABLE.has(e.code));

/**
 * After a stream ends with mistakes (an unknown prop, a missing argument, a typo in a component name,
 * a dangling reference…): repairs the program in code, with core's `autofix` (no model call), loaded
 * on first use as its own chunk. Resolves to null when nothing could be improved.
 */
export async function autofixEnded(engine: Engine, lib: Library, inline: boolean): Promise<AutofixOutcome | null> {
  const before = engine.stream.errors();
  if (!canAutofix(before)) return null;
  // The repair module is its own chunk; it gets the parser this bundle already has.
  const { createAutofix } = await import("@gistui/core/repair");
  const r = createAutofix({ parse, parseStatement, repairable: REPAIRABLE })(engine.text, lib, { inline, shape: "original" });
  const remaining = (e: GistUIError[]) => e.filter((x) => REPAIRABLE.has(x.code)).length;
  if (!r.changes.length || remaining(r.errors) >= remaining(before)) return null;
  return { source: r.source, changes: r.changes, errors: r.errors };
}

/**
 * Reading one stream into one engine. A stream can be read only once, so the run outlives a component
 * remount (React StrictMode runs effects twice): it is cancelled only when nothing retains it anymore.
 */
export class StreamRun {
  readonly engine: Engine;
  done = false;
  /** The read error (a network failure…) when the source ended because of one. */
  error: unknown = null;
  /** Nothing retains the run any more: its source was cancelled and its engine disposed. */
  disposed = false;
  private refs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelSource: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(input: ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string> | null, engine: Engine) {
    this.engine = engine;
    if (input) void this.read(input);
  }

  /** A finished run that shows `text`: what a disposed run of the same stream had received. */
  static replay(text: string, engine: Engine): StreamRun {
    const run = new StreamRun(null, engine);
    if (text) engine.push(text);
    engine.end();
    run.done = true;
    return run;
  }

  private async read(input: ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string>): Promise<void> {
    try {
      if (typeof (input as ReadableStream).getReader === "function") {
        const reader = (input as ReadableStream<Uint8Array | string>).getReader();
        this.cancelSource = () => void reader.cancel().catch(() => {});
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.disposed) break;
          if (value !== undefined) this.engine.push(value);
        }
      } else {
        const it = (input as AsyncIterable<Uint8Array | string>)[Symbol.asyncIterator]();
        this.cancelSource = () => void Promise.resolve(it.return?.()).catch(() => {});
        for (;;) {
          const r = await it.next();
          if (r.done || this.disposed) break;
          this.engine.push(r.value);
        }
      }
    } catch (e) {
      if (!this.disposed) this.error = e;
    } finally {
      this.cancelSource = null;
      if (!this.disposed) {
        this.engine.end();
        this.done = true;
        for (const fn of [...this.listeners]) fn();
      }
    }
  }

  /** Called when the source ends. Check `error`: a read failure ends it too, with what had arrived. */
  onDone(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  retain(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.refs++;
  }

  release(): void {
    if (--this.refs > 0) return;
    // After a tick, so a remount in the same tick (StrictMode) keeps the run.
    this.timer = setTimeout(() => {
      this.disposed = true;
      // Stop the source now (the model keeps generating otherwise), not at its next chunk.
      this.cancelSource?.();
      this.engine.dispose();
    }, 0);
  }
}

const runs = new WeakMap<object, StreamRun>();

/**
 * The run reading `input`, created on first use. A run that was disposed (its component went away
 * for more than a tick) cannot be read again; mounting the same stream again shows what that run
 * had received, in a fresh engine, as a finished stream.
 */
export function runFor(input: ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string>, make: () => Engine): StreamRun {
  let run = runs.get(input);
  if (run?.disposed) runs.set(input, (run = StreamRun.replay(run.engine.text, make())));
  if (!run) runs.set(input, (run = new StreamRun(input, make())));
  return run;
}
