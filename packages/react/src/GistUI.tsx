/**
 * `<GistUI>`: renders a GistUI program from a stream or a growing string.
 *
 * - Each `NodeView` subscribes to its own node id (`useSyncExternalStore`) and is memoized, so a patch
 *   re-renders only the nodes it touched. Keys are statement ids, so nothing remounts while streaming.
 * - Patches are flushed once per animation frame; until the root exists they flush immediately.
 * - The root and every top-level section have their own error boundary.
 * - A complete `source` is parsed during the first render, so it also renders on the server.
 */

import { FAVICON_SERVICE, isNodeRef, type GistUIError, type NodeRef, type Patch, type Runtime, type ToolCall, type ToolProvider } from "@gistui/core";
import { Component, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { EngineContext, HostColorContext, RootElementContext, StreamingContext, useEngine, type DevtoolsHooks, type EngineContextValue, type GistUIAction } from "./context";
import { ClassNamesContext } from "./design";
import { autofixEnded, canAutofix, Engine, runFor } from "@gistui/headless/engine";
import type { ComponentProps, GistUILibrary } from "./library";
import { themeCss, type GistUITokens } from "@gistui/headless/theme";
import { onRuntimeEvent, setsColor } from "@gistui/headless/host";

export interface GistUIProps {
  library: GistUILibrary;
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
  /** Interactive components are locked until the stream is `done` (default, as in OpenUI) or each is `ready`. */
  lockUntil?: "done" | "ready";
  theme?: "light" | "dark" | "system";
  /**
   * Colour theme, like shadcn/ui themes: neutral, slate, stone, rose, pink, violet, indigo, blue, teal,
   * green, orange, amber, red. When set, it overrides the accent a program picks; leave it unset to let
   * the program choose (`Page(accent:…)`).
   */
  color?: string;
  /** Design tokens set from code (see `defineTheme`); they win over `color`. */
  tokens?: GistUITokens;
  /** Tokens for dark mode (applied with `theme="dark"`, and with `"system"` when the OS is dark). */
  darkTokens?: GistUITokens;
  className?: string;
  devtools?: DevtoolsHooks & { onFlush?: (patches: readonly Patch[]) => void };
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
  /** Called when a `$state` variable changes (bindings, `@set`, `@reset`). */
  onStateChange?: (name: string, value: unknown) => void;
  /** `@open(url)` opens the link in a new tab (http, https, mailto, tel). Default true. */
  openLinks?: boolean;
  /**
   * Extra classes per component type, e.g. `{ Card: "rounded-3xl", Button: "font-semibold" }`
   * (Tailwind or your own CSS). Applies to the components that support the design layer.
   */
  classNames?: Readonly<Record<string, string>>;
}

/** A number per engine. The rendered tree is keyed by it: a new program never inherits component state. */
const engineIds = new WeakMap<Engine, number>();
let engineCount = 0;
/** Engines waiting to be disposed (see the effect that disposes them). */
const disposals = new WeakMap<Engine, ReturnType<typeof setTimeout>>();
/**
 * Host callbacks (`onProse`, `devtools.onFlush`) made while an engine is filled during render (the
 * first render parses a complete `source`). They are held until its effects run: a callback may set
 * the host's state, which must not happen while rendering.
 */
const held = new WeakMap<Engine, (() => void)[]>();
const tell = (eng: Engine, fn: () => void): void => {
  const queue = held.get(eng);
  if (queue) queue.push(fn);
  else fn();
};

/**
 * The same object while its entries are the same. An inline `classNames={{…}}` is a new object on
 * every render; as a context value it would re-render every design-layer component on each chunk.
 */
function useShallowStable<T extends Readonly<Record<string, string>> | undefined>(value: T): T {
  const key = value ? Object.keys(value).map((k) => `${k}\u0000${value[k]}`).join("\u0001") : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}

export function GistUI(props: GistUIProps): ReactNode {
  const { library, stream, source, streaming = false, inline, lockUntil = "done", theme = "system", color, tokens, darkTokens, className, devtools } = props;
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const scopedCss = useMemo(() => themeCss(scope, tokens, darkTokens), [scope, tokens, darkTokens]);
  const latest = useRef(props);
  latest.current = props;

  // By value: an inline array is a new object on every render, and must not start the program over.
  const hostsKey = props.allowedHosts?.join("\n");
  const makeEngine = useCallback(() => {
    const eng: Engine = new Engine(library.core, {
      inline: inline ?? false,
      allowedHosts: hostsKey === undefined ? undefined : hostsKey.split("\n").filter(Boolean),
      onProse: (t, l) => tell(eng, () => latest.current.onProse?.(t, l)),
      onFlush: (p) => tell(eng, () => latest.current.devtools?.onFlush?.(p)),
      runtime: {
        // Read on every call, so new tools or handlers apply without starting over (core checks what
        // a program may call: read-only `tools` for @query, `mutations` for @mutation).
        tools: () => latest.current.tools,
        mutations: () => latest.current.mutations,
        onToolCall: (call) => latest.current.onToolCall?.(call),
        initialState: latest.current.initialState,
        onEvent: (e) => onRuntimeEvent(e, latest.current),
        // Started when the engine is shown (an effect): a server render calls no tool and leaves no timer.
        live: false,
        favicons: latest.current.favicons === true ? FAVICON_SERVICE : latest.current.favicons || undefined,
      },
    });
    engineIds.set(eng, ++engineCount);
    return eng;
  }, [library, inline, hostsKey]);
  // A complete `source` is parsed right here, not in an effect: the server render and the first
  // client render then have the content (the same on both, so hydration matches).
  const [engine, setEngine] = useState(() => {
    const eng = makeEngine();
    if (source !== undefined && !stream && !streaming) {
      held.set(eng, []);
      eng.consumed = source;
      if (source) eng.push(source);
      eng.end();
    }
    return eng;
  });
  const [isStreaming, setStreaming] = useState(Boolean(stream) || (source !== undefined && streaming));
  /**
   * The engine being shown. Set by the effects that feed it, not during render (a stream can end
   * and its repair arrive before the next render), and cleared when they are torn down, so nothing
   * is reported after unmount.
   */
  const active = useRef<Engine | null>(null);
  /** The engine whose end was reported: once each (effects run twice under StrictMode). */
  const reported = useRef<Engine | null>(null);

  // The stream ended: report its errors, or first repair the program (autofix, its own chunk) and
  // show the repaired version. Input that arrives meanwhile wins: the repair is then dropped.
  const finish = useCallback(
    (eng: Engine) => {
      if (reported.current === eng) return;
      reported.current = eng;
      const errors = eng.stream.errors();
      if (latest.current.autofix === false || !canAutofix(errors)) return latest.current.onError?.(errors);
      autofixEnded(eng, library.core, inline ?? false).then(
        (r) => {
          if (active.current !== eng) return;
          if (!r) return latest.current.onError?.(errors);
          // In place: only what the repair changed re-renders.
          eng.rewrite(r.source);
          latest.current.onAutofix?.({ changes: r.changes, errors: r.errors });
          latest.current.onError?.(r.errors);
        },
        () => {
          if (active.current === eng) latest.current.onError?.(errors);
        },
      );
    },
    [library, inline],
  );

  // A new library or mode starts over (not the first run, nor StrictMode's repeat of it).
  const madeBy = useRef(makeEngine);
  useEffect(() => {
    if (madeBy.current === makeEngine) return;
    madeBy.current = makeEngine;
    setEngine(makeEngine());
  }, [makeEngine]);

  // Stream mode.
  useEffect(() => {
    if (!stream) return;
    const run = runFor(stream, makeEngine);
    run.retain();
    active.current = run.engine;
    setEngine(run.engine);
    setStreaming(!run.done);
    const off = run.onDone(() => {
      setStreaming(false);
      finish(run.engine);
    });
    return () => {
      off();
      run.release();
      if (active.current === run.engine) active.current = null;
    };
  }, [stream, makeEngine, finish]);

  // Source mode: push only the appended text; anything else starts over.
  useLayoutEffect(() => {
    if (source === undefined || stream) return;
    let eng = engine;
    if (eng.ended ? source !== eng.consumed : !source.startsWith(eng.consumed)) {
      eng = makeEngine();
      setEngine(eng);
    }
    active.current = eng;
    // What the first-render parse had to tell the host.
    const early = held.get(eng);
    held.delete(eng);
    early?.forEach((fn) => fn());
    if (!eng.ended) {
      const delta = source.slice(eng.consumed.length);
      if (delta) {
        eng.consumed = source;
        eng.push(delta);
      }
      if (streaming) eng.flush();
      else eng.end();
      setStreaming(streaming);
    }
    // Ended just now, or in the initial state (a complete `source`).
    if (eng.ended) finish(eng);
    return () => {
      if (active.current === eng) active.current = null;
    };
  }, [source, streaming, stream, engine, makeEngine, finish]);

  // `paused`: data stops refreshing on timers (the UI still loads, and still answers the person).
  const paused = props.paused === true;
  useEffect(() => engine.runtime.setPaused(paused), [engine, paused]);

  // Disposed when no longer shown; a tick later, because StrictMode unmounts and remounts with the
  // same engine, which must keep working.
  useEffect(() => {
    const pending = disposals.get(engine);
    if (pending !== undefined) clearTimeout(pending);
    disposals.delete(engine);
    engine.runtime.start();
    return () => {
      disposals.set(
        engine,
        setTimeout(() => engine.dispose(), 0),
      );
    };
  }, [engine]);

  const emit = useCallback((a: GistUIAction) => latest.current.onAction?.(a), []);
  const ctx = useMemo<EngineContextValue>(
    () => ({ store: engine.store, runtime: engine.runtime, library, emit, lockUntil, devtools }),
    // `devtools` is read through the context value; a new object each render would re-render every node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, library, emit, lockUntil],
  );

  const classNames = useShallowStable(props.classNames);
  const rootEl = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rootEl}
      className={className ? `gistui ${className}` : "gistui"}
      data-gistui-theme={theme}
      data-gistui-color={color && color !== "neutral" ? color : undefined}
      data-gistui-scope={scopedCss ? scope : undefined}
      aria-busy={isStreaming || undefined}
    >
      {scopedCss && <style>{scopedCss}</style>}
      <EngineContext.Provider value={ctx}>
        <StreamingContext.Provider value={isStreaming}>
          <HostColorContext.Provider value={color ?? (setsColor(tokens) || setsColor(darkTokens) ? "custom" : undefined)}>
            <ClassNamesContext.Provider value={classNames}>
              <RootElementContext.Provider value={rootEl}>
                {/* Keyed by engine: an unrelated program reuses ids (`root`, `f`…) and must not inherit their state. */}
                <RootView key={engineIds.get(engine)} />
              </RootElementContext.Provider>
            </ClassNamesContext.Provider>
          </HostColorContext.Provider>
        </StreamingContext.Provider>
      </EngineContext.Provider>
    </div>
  );
}


function RootView(): ReactNode {
  const { store } = useEngine();
  const subscribe = useCallback((cb: () => void) => store.subscribeRoot(cb), [store]);
  const root = useSyncExternalStore(subscribe, () => store.root, () => store.root);
  return root ? <NodeView id={root} depth={0} /> : null;
}

const MAX_DEPTH = 64;

export const NodeView = memo(function NodeView({ id, depth, section }: { id: string; depth: number; /** Set by the renderer. */ section?: boolean }): ReactNode {
  const { runtime, library, devtools } = useEngine();
  const subscribe = useCallback((cb: () => void) => runtime.subscribe(id, cb), [runtime, id]);
  const node = useSyncExternalStore(subscribe, () => runtime.view(id), () => runtime.view(id));
  devtools?.onNodeRender?.(id);

  // Sections have an error boundary each: the root, its children, and what an expression (`@each`,
  // a ternary) puts in a section's place.
  const isSection = depth <= 1 || section === true;
  const inPlace = isSection && node?.type === "#fragment";
  const childIds = node?.children;
  const children = useMemo(() => {
    if (!childIds?.length) return null;
    const seen = new Map<string, number>();
    return childIds.map((cid) => {
      const n = seen.get(cid) ?? 0;
      seen.set(cid, n + 1);
      // A shared ref may appear twice under one parent (a DAG); the key keeps both.
      return <NodeView key={n ? `${cid}~${n}` : cid} id={cid} depth={depth + 1} section={inPlace || undefined} />;
    });
  }, [childIds, depth, inPlace]);
  const renderNode = useCallback(
    (ref: NodeRef | string | null | undefined) => {
      const target = typeof ref === "string" ? ref : ref?.$ref;
      return target ? <NodeView id={target} depth={depth + 1} /> : null;
    },
    [depth],
  );

  if (!node) return null;
  if (depth > MAX_DEPTH) return <div className="gistui-error">This section is nested too deeply to render.</div>;
  if (node.type === "#pending") {
    return <div className="gistui-skeleton" data-expected={node.expected} aria-busy="true" aria-label="Loading" />;
  }
  // What an expression produced (`@each`, a ternary, computed text): its children, in place.
  if (node.type === "#fragment") return <>{children}</>;
  if (node.type === "#expr") return null;

  const Renderer = (node.type === "#unknown" ? undefined : library.components.get(node.type)) ?? Unknown;
  const el = <Renderer node={node} props={node.props} childIds={node.children} renderNode={renderNode}>{children}</Renderer>;
  return isSection ? (
    <Boundary id={id} node={node}>
      {el}
    </Boundary>
  ) : (
    el
  );
});

function Unknown({ node, children }: ComponentProps): ReactNode {
  return (
    <div className="gistui-unknown" data-gistui={String(node.props.component ?? node.type)}>
      {children}
    </div>
  );
}

/** Every node below `id` (children and component-valued props), `id` included. */
function subtree(runtime: Runtime, id: string, out = new Set<string>()): Set<string> {
  if (out.has(id) || out.size >= 2000) return out;
  out.add(id);
  const node = runtime.view(id);
  if (!node) return out;
  for (const c of node.children) subtree(runtime, c, out);
  for (const v of Object.values(node.props)) for (const x of Array.isArray(v) ? v : [v]) if (isNodeRef(x)) subtree(runtime, x.$ref, out);
  return out;
}

/**
 * Per section. It retries when its node changes, and, while failed, on any change below it: a
 * nested node that threw while half-streamed renders once the rest of it arrives.
 */
class Boundary extends Component<{ id: string; node: unknown; children: ReactNode }, { error: Error | null }> {
  static override contextType = EngineContext;
  declare context: EngineContextValue | null;
  override state = { error: null as Error | null };
  private unwatch: (() => void) | null = null;
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch() {
    this.unwatch?.();
    const runtime = this.context?.runtime;
    if (!runtime) return;
    const retry = () => {
      if (this.state.error) this.setState({ error: null });
    };
    const offs = [...subtree(runtime, this.props.id)].map((id) => runtime.subscribe(id, retry));
    this.unwatch = () => offs.forEach((off) => off());
  }
  override componentDidUpdate(prev: { id: string; node: unknown }) {
    if (!this.state.error) {
      this.unwatch?.();
      this.unwatch = null;
    } else if (prev.id !== this.props.id || prev.node !== this.props.node) this.setState({ error: null });
  }
  override componentWillUnmount() {
    this.unwatch?.();
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="gistui-error" role="alert">
          This section could not be shown: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
