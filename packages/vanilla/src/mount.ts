/**
 * `mount(element, options)`: renders a GistUI program into any element, framework-free.
 *
 * - Each node has its own view, subscribed to its own id, so a patch re-renders only the nodes it
 *   touched. Children are keyed by statement id, so nothing is recreated while a program streams.
 * - Components update their element in place (`update`) and keep their state.
 * - A component that throws shows an error box in its place; the rest of the screen still renders.
 */

import { FAVICON_SERVICE, type Expr, type GistUIError, type GistUINode, type Library, type NodeRef, type Patch, type ToolCall, type ToolProvider } from "@gistui/core";
import type { GistUIAction } from "@gistui/headless/actions";
import { autofixEnded, canAutofix, Engine, runFor, type StreamRun } from "@gistui/headless/engine";
import { onRuntimeEvent, setsColor } from "@gistui/headless/host";
import { themeCss, type GistUITokens } from "@gistui/headless/theme";
import { applyDesign } from "./design";
import { h, setAttrs, syncChildren } from "./dom";
import type { Binding, ChildEntry, DomContext, DomInstance, DomLibrary, DomRenderer } from "./types";

export interface MountOptions {
  library: DomLibrary;
  /** A response stream (text or UTF-8 bytes). A new stream object starts a new render. */
  stream?: ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string> | null;
  /** Alternatively, a growing source string; only the appended part is parsed. */
  source?: string;
  /** With `source`: whether more text is still coming. Defaults to false. */
  streaming?: boolean;
  /** Chat text with ```gistui fences: text outside fences goes to `onProse`. */
  inline?: boolean;
  onProse?: (text: string, line: number) => void;
  onAction?: (action: GistUIAction) => void;
  /** Called with the final errors when the stream ends ([] when valid). */
  onError?: (errors: GistUIError[]) => void;
  /**
   * When the stream ends with mistakes (an unknown prop, a missing argument, a misspelled component,
   * a dangling reference…), repair the program in code, with no model call, and show the repaired
   * version. On by default; `onError` then reports what is left (usually nothing).
   */
  autofix?: boolean;
  /** Called after a repair, with what was changed. */
  onAutofix?: (result: { changes: string[]; errors: GistUIError[] }) => void;
  /** Interactive components are locked until the stream is `done` (default) or each is `ready`. */
  lockUntil?: "done" | "ready";
  theme?: "light" | "dark" | "system";
  /** Colour theme (neutral, slate, …, red). When set, it wins over the accent a program picks. */
  color?: string;
  /** Design tokens set from code; they win over `color`. */
  tokens?: GistUITokens;
  /** Tokens for dark mode. */
  darkTokens?: GistUITokens;
  className?: string;
  /**
   * Read-only tools for `@query`, which calls them by itself when the UI renders: a map of async
   * functions, or an MCP client (`{ callTool, allow }`). Nothing else can be called.
   */
  tools?: ToolProvider;
  /** Tools that change something, for `@mutation`: run only from a user's action (`@run`). */
  mutations?: ToolProvider;
  /** Called before every tool call (to log, check or confirm); return or resolve `false` to block it. */
  onToolCall?: (call: ToolCall) => boolean | void | Promise<boolean | void>;
  /**
   * Hosts that images, video and backgrounds may load from: `["cdn.example.com", "*.example.com"]`.
   * Relative URLs and the page's own host always load. Set this when the model sees private data:
   * a program is untrusted, and an image URL can carry data to another server without a click.
   * Without it, any host is allowed for a URL the program wrote out, and a URL it assembled from
   * data (`"https://…?d=" + value`) is not loaded.
   */
  allowedHosts?: readonly string[];
  /**
   * Shows the icon of each cited site on `Source` cards. Off by default: an icon is a request to a
   * third-party service for every cited site. `true` uses a public favicon service; a string is your
   * own, with `{host}` for the site's host name. With `allowedHosts`, list the service's host too.
   */
  favicons?: boolean | string;
  /**
   * Stops `every:` data refreshes while true (for a UI that is no longer the current one, such as an
   * earlier answer in a chat). The UI still loads its data and still answers the person.
   */
  paused?: boolean;
  /** Values for the program's `$state` variables (instead of its defaults). */
  initialState?: Readonly<Record<string, unknown>>;
  /** Called when a `$state` variable changes. */
  onStateChange?: (name: string, value: unknown) => void;
  /** `@open(url)` opens the link in a new tab. Default true. */
  openLinks?: boolean;
  /** Extra classes per component type, e.g. `{ Card: "rounded-3xl" }`. */
  classNames?: Readonly<Record<string, string>>;
  /** Called after each batch of patches (devtools). */
  onFlush?: (patches: readonly Patch[]) => void;
}

export interface GistUIMount {
  /** The `.gistui` root element. */
  readonly element: HTMLElement;
  /**
   * Changes the options given (the others stay): a longer `source` streams in; another `source`, a new
   * `stream`, or a `source` once `stream` is unset starts over. A library with the same schemas and other
   * renderers (`library.extend`) rebuilds only the components whose renderer changed. A value of
   * `undefined` unsets an option, so its default applies again.
   */
  update(options: Partial<MountOptions>): void;
  destroy(): void;
}

let scopes = 0;
const MAX_DEPTH = 64;
type Input = NonNullable<MountOptions["stream"]>;

export function mount(target: Element, options: MountOptions): GistUIMount {
  const host = new Host(target, options);
  return {
    element: host.root,
    update: (o) => host.update(o),
    destroy: () => host.destroy(),
  };
}

/**
 * For framework bindings, which know all their options at once: calls `view.update()` with exactly
 * the options that differ between `prev` and `next`. One that is gone (or `undefined`) in `next` is
 * sent as `undefined`, which unsets it; when nothing differs, nothing is called.
 */
export function syncOptions(view: GistUIMount, prev: Readonly<Partial<MountOptions>>, next: Readonly<Partial<MountOptions>>): void {
  const changed: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof MountOptions>) {
    if (!Object.is(prev[k], next[k])) changed[k] = next[k];
  }
  if (Object.keys(changed).length) view.update(changed);
}

/**
 * An engine whose callbacks reach whichever Host shows it now. A stream can be read only once, so
 * its run (and the engine in it) is kept per stream object and outlives the Host that started it:
 * mounting the same stream again gives the same engine. Every Host showing it is told about a flush;
 * events, prose and tool calls go to the one that took it last.
 */
class HostEngine extends Engine {
  /** The Hosts showing this engine, the latest last. */
  readonly hosts: Set<Host>;
  /** What the program is parsed with (the Host's library and mode may change later). */
  readonly core: Library;
  readonly inline: boolean;

  constructor(host: Host) {
    const hosts = new Set([host]);
    const me: { engine?: Engine } = {};
    const latest = (): MountOptions | undefined => {
      let last: Host | undefined;
      for (const x of hosts) last = x;
      return last?.opts;
    };
    const { library, inline = false, initialState, allowedHosts } = host.opts;
    super(library.core, {
      inline,
      allowedHosts,
      onProse: (t, l) => latest()?.onProse?.(t, l),
      // The root is (re)attached after a flush, once the runtime has caught up (state declared).
      onFlush: (p) => {
        for (const x of [...hosts]) {
          // Not one that left meanwhile (an earlier one's callback may destroy it), nor one that
          // made this engine and does not show it yet.
          if (!hosts.has(x) || x.engine !== me.engine) continue;
          x.syncRoot();
          x.opts.onFlush?.(p);
        }
      },
      runtime: {
        // Read on every call, so new tools apply without starting over (core checks what a program
        // may call: read-only `tools` for @query, `mutations` for @mutation).
        tools: () => latest()?.tools,
        mutations: () => latest()?.mutations,
        onToolCall: (call) => latest()?.onToolCall?.(call),
        favicons: host.opts.favicons === true ? FAVICON_SERVICE : host.opts.favicons || undefined,
        initialState,
        onEvent: (e) => {
          const o = latest();
          if (o) onRuntimeEvent(e, o);
        },
      },
    });
    me.engine = this;
    this.hosts = hosts;
    this.core = library.core;
    this.inline = inline;
  }
}

// What a component read from its context (so only those that did render again when it changes).
const READ_STREAMING = 1;
const READ_LOCK = 2;
const READ_COLOR = 4;
const LOOK = ["theme", "color", "tokens", "darkTokens", "className"] as const;

class Host {
  readonly root: HTMLDivElement;
  private readonly styleEl: HTMLStyleElement;
  private readonly scope = `g${++scopes}`;
  opts: MountOptions;
  engine: Engine;
  streaming = false;
  private rootView: NodeView | null = null;
  /** What `placeRoot` put in the root element last. */
  private placed: readonly Node[] = [];
  /** Stream mode: the stream shown, and its run. */
  private stream: Input | null = null;
  private run: StreamRun | null = null;
  private offRun: (() => void) | null = null;
  private destroyed = false;
  readonly views = new Set<NodeView>();

  constructor(target: Element, opts: MountOptions) {
    this.opts = opts;
    this.root = h("div", { class: "gistui" });
    this.styleEl = h("style");
    target.append(this.root);
    this.engine = new HostEngine(this);
    this.applyLook();
    this.applyInput();
    this.engine.runtime.setPaused(opts.paused === true);
  }

  /** Renders whatever root the engine's store has (called after every flush). */
  syncRoot(): void {
    if (this.destroyed) return;
    const root = this.engine.store.root;
    if (root && this.rootView?.id !== root) {
      this.rootView?.destroy();
      this.rootView = null;
      this.rootView = new NodeView(this, root, 0, null);
    } else if (!root && this.rootView) {
      this.rootView.destroy();
      this.rootView = null;
    }
    this.placeRoot();
  }

  /**
   * Puts the scoped <style> and the root view's nodes first in the root element. Only what was put
   * there by this is ever removed: what a component appended (an open lightbox) stays, after them.
   */
  placeRoot(): void {
    const next = [...(this.styleEl.textContent ? [this.styleEl] : []), ...(this.rootView?.nodes ?? [])];
    syncChildren(this.root, next, new Set(this.placed));
    this.placed = next;
  }

  /**
   * Shows `engine` from now on: the views of the current one go, and it is let go of. `streaming`
   * is set in between, so the new views are created in that state (not rendered again for it).
   */
  private show(engine: Engine, streaming: boolean, stream: Input | null = null, run: StreamRun | null = null): void {
    this.rootView?.destroy();
    this.rootView = null;
    this.leave();
    this.engine = engine;
    this.stream = stream;
    this.run = run;
    if (engine instanceof HostEngine) {
      // Last in the set: the one its events and tool calls go to.
      engine.hosts.delete(this);
      engine.hosts.add(this);
    }
    this.setStreaming(streaming);
    this.syncRoot();
  }

  /**
   * Lets go of the current engine. A stream's engine belongs to its run (another mount may show it,
   * or take it over in a moment), so the run is released; any other engine is ours to dispose.
   */
  private leave(): void {
    this.offRun?.();
    this.offRun = null;
    const eng = this.engine;
    if (eng instanceof HostEngine) eng.hosts.delete(this);
    if (this.run) this.run.release();
    else eng.dispose();
    this.run = null;
    this.stream = null;
  }

  /** Reads `stream`, or feeds `source` (only the appended part; all of it again with `reparse`). */
  private applyInput(reparse = false): void {
    const { stream, source } = this.opts;
    if (stream) {
      // The stream being shown goes on, whatever else changed: it cannot be read a second time.
      if (stream === this.stream) return;
      // (After a run was let go of for good, `runFor` gives one that replays what it had received.)
      const run = runFor(stream, () => new HostEngine(this));
      const eng = run.engine;
      run.retain();
      this.show(eng, !run.done, stream, run);
      const done = () => {
        // An earlier listener (another mount's `onError`) may have destroyed this mount.
        if (this.destroyed || this.engine !== eng) return;
        this.setStreaming(false);
        this.finish(eng);
      };
      // A stream that ended before this mount took it: this mount still gets its errors (and repair).
      if (run.done) done();
      else this.offRun = run.onDone(done);
      return;
    }
    const streaming = source !== undefined && (this.opts.streaming ?? false);
    // After a stream, or with other schemas, a source starts over in an engine of its own; so does
    // one that is not the last one with more text. No source at all shows nothing.
    let eng = this.engine;
    if (this.stream || reparse || (source === undefined ? eng.used : eng.ended ? source !== eng.consumed : !source.startsWith(eng.consumed))) {
      this.show((eng = new HostEngine(this)), streaming);
    }
    if (source === undefined) {
      this.setStreaming(false);
      return;
    }
    if (!eng.ended) {
      // Before the text goes in: what it adds is created knowing that more is coming (locked).
      if (streaming) this.setStreaming(true);
      const delta = source.slice(eng.consumed.length);
      if (delta) {
        eng.consumed = source;
        eng.push(delta);
      }
      if (!streaming) {
        eng.end();
        this.finish(eng);
      } else eng.flush();
    }
    this.setStreaming(streaming);
  }

  /**
   * The stream ended: report its errors, or first repair the program (autofix, its own chunk) and
   * show the repaired version. Input that arrives meanwhile wins: the repair is then dropped.
   */
  private finish(eng: Engine): void {
    const errors = eng.stream.errors();
    if (this.opts.autofix === false || !canAutofix(errors)) {
      this.opts.onError?.(errors);
      return;
    }
    // Repaired with what the engine parses with, which is not the current library after a change.
    const [core, inline] = eng instanceof HostEngine ? [eng.core, eng.inline] : [this.opts.library.core, this.opts.inline ?? false];
    autofixEnded(eng, core, inline).then(
      (r) => {
        if (this.engine !== eng || this.destroyed) return;
        if (!r) {
          this.opts.onError?.(errors);
          return;
        }
        // In place: only what the repair changed re-renders.
        eng.rewrite(r.source);
        this.opts.onAutofix?.({ changes: r.changes, errors: r.errors });
        this.opts.onError?.(r.errors);
      },
      () => {
        if (this.engine === eng && !this.destroyed) this.opts.onError?.(errors);
      },
    );
  }

  private setStreaming(v: boolean): void {
    if (this.streaming === v) return;
    this.streaming = v;
    setAttrs(this.root, { "aria-busy": v ? "true" : undefined });
    // Locked components and anything showing streaming state update once, at the start and the end.
    for (const view of [...this.views]) view.optionsChanged(false, READ_STREAMING, null);
  }

  /** Theme, colour and scoped tokens on the root element (nothing is written that did not change). */
  private applyLook(): void {
    const { theme = "system", color, tokens, darkTokens, className } = this.opts;
    const css = themeCss(this.scope, tokens, darkTokens) ?? "";
    if (this.styleEl.textContent !== css) this.styleEl.textContent = css;
    const cls = className ? `gistui ${className}` : "gistui";
    if (this.root.className !== cls) this.root.className = cls;
    setAttrs(this.root, {
      "data-gistui-theme": theme,
      "data-gistui-color": color && color !== "neutral" ? color : undefined,
      "data-gistui-scope": css ? this.scope : undefined,
    });
    this.placeRoot();
  }

  get hostColor(): string | undefined {
    return this.opts.color ?? (setsColor(this.opts.tokens) || setsColor(this.opts.darkTokens) ? "custom" : undefined);
  }

  update(next: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const prev = this.opts;
    const color = this.hostColor;
    const eng = this.engine;
    // An `undefined` unsets an option; the library is the one option that cannot be unset.
    const o = (this.opts = { ...prev, ...next, library: next.library ?? prev.library });
    const library = o.library !== prev.library;
    // Other schemas, or the other mode, parse a program differently, so a source starts over. A
    // stream cannot be read again: its engine stays (the program stays parsed with the earlier
    // schemas) and is rendered with the new renderers. With the same schemas (`library.extend`)
    // nothing is parsed again in either mode.
    // The allowed hosts are applied while parsing, so other hosts parse again too (compared by value:
    // a binding passes a new array on every change).
    const reparse = (library && o.library.core !== prev.library.core) || (o.inline ?? false) !== (prev.inline ?? false) || o.allowedHosts?.join("\n") !== prev.allowedHosts?.join("\n");
    if (reparse || o.stream !== prev.stream || o.source !== prev.source || (o.streaming ?? false) !== (prev.streaming ?? false)) this.applyInput(reparse);
    if (LOOK.some((k) => k in next)) this.applyLook();
    this.engine.runtime.setPaused(o.paused === true);
    // A new engine has new views. Otherwise only the views that depend on what changed render again:
    // those whose renderer is another one now, whose type has other classes, or that read the
    // colour or the lock.
    if (this.engine !== eng) return;
    const reads = (this.hostColor !== color ? READ_COLOR : 0) | ((o.lockUntil ?? "done") !== (prev.lockUntil ?? "done") ? READ_LOCK : 0);
    const classes = changedKeys(prev.classNames, o.classNames);
    if (library || reads || classes) for (const view of [...this.views]) view.optionsChanged(library, reads, classes);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rootView?.destroy();
    this.rootView = null;
    this.leave();
    this.root.remove();
  }
}

/** The keys whose value differs between two flat records (null when none does). */
function changedKeys(a: Readonly<Record<string, string>> | undefined, b: Readonly<Record<string, string>> | undefined): ReadonlySet<string> | null {
  if (a === b) return null;
  const out = new Set<string>();
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if (a?.[k] !== b?.[k]) out.add(k);
  return out.size ? out : null;
}

/** One node of the program: its component instance and the views of its children. */
class NodeView {
  /** What this view puts in its parent: one element, a fragment's elements, or nothing. */
  nodes: Node[] = [];
  private inst: DomInstance | null = null;
  /** The renderer `inst` was made by: another one for the type (a new library) makes a new instance. */
  private renderer: DomRenderer | null = null;
  private type = "";
  private readonly kids = new Map<string, NodeView>();
  private readonly propKids = new Map<string, NodeView>();
  /** Where the component last placed its children (`ctx.place`); they are kept in sync there. */
  private placed: Element | null = null;
  private placedNow = false;
  /** Which host values (READ_*) the instance read from its contexts. */
  reads = 0;
  /** It read `children` or `childList`: without `place`, it lays them out itself. */
  private readKids = false;
  readonly watches = new Map<string, () => void>();
  readonly provided = new Map<symbol, unknown>();
  newProvision = false;
  cleanups: (() => void)[] = [];
  private skeleton: HTMLElement | null = null;
  private errorBox: HTMLElement | null = null;
  private readonly off: () => void;
  private dead = false;
  private rendering = false;
  private dirty = false;

  constructor(
    private readonly host: Host,
    readonly id: string,
    private readonly depth: number,
    readonly parent: NodeView | null,
    public injected: ReadonlyMap<symbol, unknown> | undefined = undefined,
  ) {
    host.views.add(this);
    this.off = host.engine.runtime.subscribe(id, () => this.render());
    this.render();
  }

  private get childNodes(): Node[] {
    const out: Node[] = [];
    for (const v of this.kids.values()) out.push(...v.nodes);
    return out;
  }

  /** A child's elements changed: put them in place again, or tell our parent if we are a fragment. */
  childChanged(from: NodeView): void {
    if (this.dead) return;
    // A child still being created reports before we registered it: we place it ourselves.
    const isProp = [...this.propKids.values()].includes(from);
    if (!isProp && ![...this.kids.values()].includes(from)) return;
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    if (isProp) {
      this.render();
      return;
    }
    if (this.type === "#fragment") {
      this.setNodes(this.childNodes);
      return;
    }
    if (this.placed) syncChildren(this.placed, this.childNodes);
    // A component that lays its children out itself has to do so again, unless it watches this
    // child and is about to be told anyway. One that could not be shown gets another try.
    else if (this.errorBox || (this.readKids && !this.watches.has(from.id))) this.render();
  }

  private setNodes(next: Node[]): void {
    const same = next.length === this.nodes.length && next.every((n, i) => n === this.nodes[i]);
    this.nodes = next;
    if (same) return;
    if (this.parent) this.parent.childChanged(this);
    else this.host.placeRoot();
  }

  /** Keeps a view per child id (a repeated id gets `id~n`); creates and destroys as needed. */
  private syncKids(ids: readonly string[]): void {
    const seen = new Map<string, number>();
    const keep = new Set<string>();
    const order: [string, NodeView][] = [];
    for (const cid of ids) {
      const n = seen.get(cid) ?? 0;
      seen.set(cid, n + 1);
      const key = n ? `${cid}~${n}` : cid;
      keep.add(key);
      let v = this.kids.get(key);
      if (!v) v = new NodeView(this.host, cid, this.depth + 1, this);
      order.push([key, v]);
    }
    for (const [key, v] of this.kids) if (!keep.has(key)) v.destroy();
    this.kids.clear();
    for (const [key, v] of order) this.kids.set(key, v);
  }

  private teardownInstance(): void {
    for (const off of this.watches.values()) off();
    this.watches.clear();
    for (const fn of this.cleanups.splice(0)) fn();
    this.provided.clear();
    this.inst?.destroy?.();
    this.inst = null;
    this.renderer = null;
    this.placed = null;
    this.reads = 0;
    this.readKids = false;
    this.errorBox = null;
    for (const v of this.propKids.values()) v.destroy();
    this.propKids.clear();
  }

  /** The renderer for a component type (null for what is not a component: a fragment, a skeleton). */
  private rendererOf(type: string): DomRenderer | null {
    if (type === "#unknown") return unknownRenderer;
    return type === "" || type.startsWith("#") ? null : (this.host.opts.library.components.get(type) ?? unknownRenderer);
  }

  /**
   * Host options changed: renders again only if this view depends on what did. `library`: its
   * component has another renderer now; `reads`: it read one of these values; `classes`: its type
   * is one of those whose extra classes changed.
   */
  optionsChanged(library: boolean, reads: number, classes: ReadonlySet<string> | null): void {
    // One that could not be shown is tried again with any change (the end of the stream, say).
    if (this.errorBox || this.reads & reads || classes?.has(this.type) || (library && this.rendererOf(this.type) !== this.renderer)) this.render();
  }

  render(): void {
    if (this.dead) return;
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    this.rendering = true;
    try {
      for (let pass = 0; pass < 4; pass++) {
        this.dirty = false;
        this.renderOnce();
        if (!this.dirty) break;
      }
    } finally {
      this.rendering = false;
    }
  }

  private renderOnce(): void {
    const node = this.host.engine.runtime.view(this.id);
    if (!node) {
      this.teardownInstance();
      this.syncKids([]);
      this.type = "";
      this.setNodes([]);
      return;
    }
    if (this.depth > MAX_DEPTH) {
      this.teardownInstance();
      this.type = "#deep";
      this.setNodes([h("div", { class: "gistui-error" }, "This section is nested too deeply to render.")]);
      return;
    }
    if (node.type === "#pending") {
      this.teardownInstance();
      this.type = "#pending";
      this.skeleton ??= h("div", { class: "gistui-skeleton", "aria-busy": "true", "aria-label": "Loading" });
      setAttrs(this.skeleton, { "data-expected": node.expected });
      this.setNodes([this.skeleton]);
      return;
    }
    if (node.type === "#fragment") {
      this.teardownInstance();
      this.type = "#fragment";
      this.syncKids(node.children);
      this.setNodes(this.childNodes);
      return;
    }
    if (node.type === "#expr") {
      this.teardownInstance();
      this.type = "#expr";
      this.syncKids([]);
      this.setNodes([]);
      return;
    }

    const renderer = this.rendererOf(node.type) ?? unknownRenderer;
    const usedProps = new Set<string>();
    const watched = new Set<string>();
    // An instance that goes on gets its children's views first. A new one is created before them, so
    // what it provides is there when they render (no second render for each of them): their views
    // are made when it first asks for its children (`children`, `childList`, `place`), or right
    // after it.
    const reuse = this.inst !== null && this.type === node.type && this.renderer === renderer;
    const kids = { synced: false };
    const syncKids = () => {
      if (kids.synced) return;
      kids.synced = true;
      this.syncKids(node.children);
    };
    if (reuse) syncKids();
    const ctx = this.context(node, usedProps, watched, syncKids);
    let next: DomInstance;
    try {
      this.placedNow = false;
      if (reuse && this.inst!.update?.(ctx)) {
        next = this.inst!;
        const box = this.placed;
        if (box && !this.placedNow) {
          // It placed its children earlier and not this time. A component that lays them out by
          // hand now (a Form that became a step form) has moved them out of that element: it is
          // forgotten, so they are not pulled back. Otherwise they are kept in sync there.
          const nodes = this.childNodes;
          if (nodes.some((n) => n.parentNode !== null && n.parentNode !== box)) this.placed = null;
          else syncChildren(box, nodes);
        }
      } else {
        const old = this.inst;
        if (old) {
          for (const fn of this.cleanups.splice(0)) fn();
          this.provided.clear();
        }
        // The new instance says where its children go, and is asked again what it reads.
        this.placed = null;
        this.reads = 0;
        this.readKids = false;
        const created = renderer(ctx);
        this.inst = created;
        this.renderer = renderer;
        if (old) {
          if (old.el.parentNode && old.el !== created.el) old.el.replaceWith(created.el);
          old.destroy?.();
        }
        syncKids();
        next = created;
      }
      this.errorBox = null;
    } catch (e) {
      // A context that outlives the failed call must not create children for it.
      kids.synced = true;
      this.teardownInstance();
      this.errorBox = h("div", { class: "gistui-error", role: "alert" }, `This section could not be shown: ${(e as Error)?.message ?? String(e)}`);
      this.type = node.type;
      this.setNodes([this.errorBox]);
      return;
    }
    this.type = node.type;
    // Descendants that rendered before this component provided something: let them see it now.
    if (this.newProvision) {
      this.newProvision = false;
      for (const v of this.descendants()) v.render();
    }
    for (const [id, off] of this.watches) {
      if (!watched.has(id)) {
        off();
        this.watches.delete(id);
      }
    }
    for (const [k, v] of this.propKids) {
      if (!usedProps.has(k)) {
        v.destroy();
        this.propKids.delete(k);
      }
    }
    this.setNodes([next.el]);
  }

  private context(node: GistUINode, usedProps: Set<string>, watched: Set<string>, syncKids: () => void): DomContext {
    const host = this.host;
    const runtime = host.engine.runtime;
    const view = this;
    let children: Node[] | undefined;
    let childList: ChildEntry[] | undefined;
    return {
      node,
      type: node.type,
      props: node.props,
      get children() {
        syncKids();
        view.readKids = true;
        return (children ??= view.childNodes);
      },
      get childList() {
        syncKids();
        view.readKids = true;
        return (childList ??= [...view.kids.values()].map((v): ChildEntry => ({ id: v.id, node: runtime.view(v.id), nodes: v.nodes })));
      },
      watch(ids: readonly string[]) {
        for (const id of ids) {
          watched.add(id);
          if (!view.watches.has(id)) view.watches.set(id, runtime.subscribe(id, () => view.render()));
        }
      },
      place(container: Element) {
        syncKids();
        // One place at a time: the children leave an element they were placed in before.
        view.placed = container;
        view.placedNow = true;
        syncChildren(container, view.childNodes);
      },
      renderNode(ref: NodeRef | string | null | undefined, key: string, inject?: ReadonlyMap<symbol, unknown>): Node | null {
        const target = typeof ref === "string" ? ref : ref?.$ref;
        if (!target) return null;
        usedProps.add(key);
        let v = view.propKids.get(key);
        if (v && v.id !== target) {
          v.destroy();
          v = undefined;
        }
        if (!v) {
          v = new NodeView(host, target, view.depth + 1, view, inject);
          view.propKids.set(key, v);
        } else if (inject && !sameMap(v.injected, inject)) {
          v.injected = inject;
          v.render();
        }
        return v.nodes[0] ?? null;
      },
      runtime,
      emit: (a: GistUIAction) => host.opts.onAction?.(a),
      run: (steps: Expr | undefined) => {
        if (steps) void runtime.run(steps, node.id);
      },
      // The host's current values, also when read from a context kept from an earlier render; the
      // view remembers that they were read, and renders again when they change.
      get streaming() {
        view.reads |= READ_STREAMING;
        return host.streaming;
      },
      get locked() {
        const done = (host.opts.lockUntil ?? "done") === "done";
        view.reads |= done ? READ_LOCK | READ_STREAMING : READ_LOCK;
        return done ? host.streaming : node.partial;
      },
      binding(): Binding {
        const e = node.dyn?.bind;
        const name = e?.k === "state" ? e.name : null;
        return {
          bound: name !== null,
          value: name ? runtime.getState(name) : undefined,
          set: (v: unknown) => {
            if (name) runtime.setState(name, v);
          },
          subscribe: (cb: () => void) => (name ? runtime.subscribeState(name, cb) : () => {}),
        };
      },
      design: (el: HTMLElement, base?: Readonly<Record<string, string | number>>) => applyDesign(el, node.type, node.props, host.opts.classNames, base, () => view.render()),
      get hostColor() {
        view.reads |= READ_COLOR;
        return host.hostColor;
      },
      refresh: () => view.render(),
      provide<T>(key: symbol, value: T) {
        // Descendants that already rendered have not seen it: they render again. (The children of
        // a new instance are created after it, so there are none yet and nothing renders twice.)
        if (!view.provided.has(key) && (view.kids.size || view.propKids.size)) view.newProvision = true;
        view.provided.set(key, value);
      },
      consume<T>(key: symbol): T | undefined {
        if (view.injected?.has(key)) return view.injected.get(key) as T;
        for (let v: NodeView | null = view.parent; v; v = v.parent) {
          if (v.provided.has(key)) return v.provided.get(key) as T;
          if (v.injected?.has(key)) return v.injected.get(key) as T;
        }
        return undefined;
      },
      onDestroy(fn: () => void) {
        view.cleanups.push(fn);
      },
    };
  }

  /** Every view below this one (children and component-valued props). */
  private descendants(out: NodeView[] = []): NodeView[] {
    for (const v of [...this.kids.values(), ...this.propKids.values()]) {
      out.push(v);
      v.descendants(out);
    }
    return out;
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.off();
    this.host.views.delete(this);
    this.teardownInstance();
    for (const v of this.kids.values()) v.destroy();
    this.kids.clear();
    for (const n of this.nodes) if (n.parentNode && this.parent === null) n.parentNode.removeChild(n);
  }
}

/** A component the library does not have: its children, in a plain box. */
const unknownRenderer = (ctx: DomContext): DomInstance => {
  const el = h("div", { class: "gistui-unknown", "data-gistui": "Unknown", "data-component": String(ctx.props.component ?? ctx.type) });
  ctx.place(el);
  return {
    el,
    update(c) {
      c.place(el);
      return true;
    },
  };
};

function sameMap(a: ReadonlyMap<symbol, unknown> | undefined, b: ReadonlyMap<symbol, unknown>): boolean {
  if (!a || a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}
