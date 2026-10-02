/**
 * The reactive runtime (plan §4.5): state, expressions, queries, mutations and actions, for every
 * framework. It sits on top of a stream's node store and gives each node a *view*: the node with its
 * runtime props evaluated (`node.dyn`), and for `#expr` nodes the children an expression produces
 * (`@each`, ternaries, computed text).
 *
 *   const rt = new Runtime(stream, { tools: { get_sales }, mutations: { update_goal }, onEvent })
 *   rt.view(id)             // the node to render (store node + evaluated props, or a generated node)
 *   rt.subscribe(id, fn)    // called when that view changes
 *   rt.run(node.dyn.do)     // runs a `do:[…]` action list
 *   rt.setState("range", "7d")
 *
 * - Every evaluation records what it read (`$state`, statements, queries, mutations), so a change
 *   re-evaluates only the nodes that depend on it, and only nodes whose result changed notify.
 * - Components produced at runtime (`@each(rows, r => Card(r.name))`) become generated nodes with
 *   stable ids (keyed by an item's `id`/`key`, else its index), so every renderer shows them unchanged.
 *   Their props are checked against the component's schema like static ones.
 * - Queries: `@query("tool", args, default:…, every:60)` calls a read-only tool from `tools`; deduped
 *   and cached by tool + args, re-run when the args change, never while their statement is still
 *   streaming. Mutations (`@mutation`) call tools from `mutations`, only from a user's action.
 *   See ./tools.ts for the rule.
 * - Actions: `@run(ref)`, `@set($v, x)`, `@reset($a, …)`, `@send(text)`, `@open(url)` (http/https/
 *   mailto/tel only), `@emit(name, payload)`; a failed mutation stops the rest.
 * - The program is untrusted: evaluation has a step budget, generated nodes and tool calls are
 *   capped, and only own properties are read, so no program can hang or crash the host.
 * - No `eval` / `new Function`: expressions are walked, so it runs under a strict CSP.
 */

import type { Arg, CompExpr, Expr, TableData } from "./ast";
import { coerceValue } from "./coerce";
import { mayLoad } from "./url-policy";
import type { Program } from "./program";
import type { CompiledComponent, Library, PropSpec } from "./schema";
import { deepEqual, isNodeRef, type GistUINode, type NodeRef, type NodeStore } from "./store";
import type { GistUIStream } from "./stream";
import { toNumber } from "./table";
import { resolveTool, type ToolCall, type ToolSource } from "./tools";
import { BLOCKED_KEYS, own } from "./util";

export type { ToolCall, ToolClient, ToolFn, ToolMap, ToolProvider, ToolSource } from "./tools";

/** What the runtime reports to the host. */
export type RuntimeEvent =
  | { type: "send"; message: string; nodeId?: string | undefined }
  | { type: "open"; url: string; nodeId?: string | undefined }
  | { type: "emit"; event: string; payload: unknown; nodeId?: string | undefined }
  | { type: "state"; name: string; value: unknown }
  | { type: "error"; message: string; code: "tool-not-found" | "tool-failed" | "blocked-url" | "unknown-step" | "limit"; nodeId?: string | undefined };

export interface RuntimeOptions {
  /** Read-only tools: `@query` calls them by itself when the UI renders. */
  tools?: ToolSource;
  /** Tools that change something: `@mutation`, run only from a user's action (`@run`). */
  mutations?: ToolSource;
  /**
   * Called before every tool call (to log, check arguments, or ask the user). Return or resolve
   * `false` to block the call.
   */
  onToolCall?: ((call: ToolCall) => boolean | void | Promise<boolean | void>) | undefined;
  /** Most tool calls in any 10 seconds (default 60); further calls fail until the window clears. */
  maxToolCalls?: number | undefined;
  /** Values for `$state` variables, used instead of the program's defaults. */
  initialState?: Readonly<Record<string, unknown>> | undefined;
  onEvent?: ((e: RuntimeEvent) => void) | undefined;
  /** Smallest `every:` refresh interval, in seconds. Default 5. */
  minInterval?: number | undefined;
  /**
   * `false`: the UI is built, but no tool is called and no timer runs until `start()`. For a render
   * that nobody will look at yet (a server render, which must not call tools or leave timers behind).
   */
  live?: boolean | undefined;
  /**
   * Where the icon of a cited site comes from, with `{host}` for its host name. Not set: no site
   * icons (a citation shows a letter). An icon is a request to that service for every cited site,
   * so it is the host's choice, and it follows `allowedHosts` like any image.
   */
  favicons?: string | undefined;
  /** URL schemes `@open` may use. */
  schemes?: readonly string[] | undefined;
}

export interface QueryStatus {
  loading: boolean;
  error: string | null;
  /** Last successful result (undefined before the first one). */
  data: unknown;
  updatedAt: number | null;
}

export interface MutationStatus {
  status: "idle" | "pending" | "success" | "error";
  data: unknown;
  error: string | null;
}

/** A lambda value. A class, so a program (or tool data) cannot forge one with an object literal. */
class Lambda {
  constructor(
    readonly params: readonly string[],
    readonly body: Expr,
    readonly scope: Scope,
  ) {}
}

interface Scope {
  locals: ReadonlyMap<string, unknown> | null;
  deps: Set<string>;
  /** Id prefix for components generated in this scope. */
  owner: string;
  path: string;
}

interface Entry {
  /** The store node this entry was computed from. */
  src: GistUINode;
  view: GistUINode;
  deps: Set<string>;
  /** Generated nodes this entry produced (released when it no longer does). */
  derived: Set<string>;
}

/** Limits: generous for real programs, small enough that a hostile one cannot hang the page. */
const MAX_DEPTH = 64;
const MAX_STEPS = 500_000;
const MAX_EACH = 5_000;
const MAX_DERIVED = 20_000;
const MAX_STRING = 1_000_000;
const MAX_POLLING = 20;
/** Assembled strings remembered for the URL policy; past this, every string counts as assembled. */
const MAX_BUILT = 20_000;
const MAX_CACHE = 200;
const MAX_TIMER_MS = 2 ** 31 - 1;
const TOOL_WINDOW_MS = 10_000;

class LimitError extends Error {}

const isLambda = (v: unknown): v is Lambda => v instanceof Lambda;
const isTable = (v: unknown): v is TableData =>
  typeof v === "object" && v !== null && Array.isArray((v as TableData).columns) && Array.isArray((v as TableData).rows);

const records = new WeakMap<TableData, Record<string, unknown>[]>();
/**
 * A pipe table as records (`[{Month: "Apr", Revenue: 84500}, …]`) for expressions. A number cell
 * written with formatting (`$1,184`, `12%`) keeps its text, so it displays as written; arithmetic,
 * comparisons and the math built-ins still read it as a number. Built once per table (a table is
 * an immutable snapshot).
 */
export function tableRecords(t: TableData): Record<string, unknown>[] {
  let r = records.get(t);
  if (!r) records.set(t, (r = t.rows.map((_, n) => Object.fromEntries(t.columns.map((c, i) => [c.name, cellValue(t, n, i)])))));
  return r;
}
function cellValue(t: TableData, row: number, col: number): unknown {
  const v = t.rows[row]?.[col] ?? null;
  const text = t.text[row]?.[col]?.trim();
  return typeof v === "number" && text !== undefined && text !== String(v) ? text : v;
}
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : isTable(v) ? tableRecords(v) : v == null ? [] : [v]);
/** Compares numerically when both sides read as numbers (`"$948"` < `"$1,184"`), else as text. */
const order = (l: unknown, r: unknown): number => {
  const a = num(l);
  const b = num(r);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  if (typeof l === "string" && typeof r === "string") return l < r ? -1 : l > r ? 1 : 0;
  return NaN;
};
const truthy = (v: unknown) => Boolean(v) && !(Array.isArray(v) && v.length === 0);
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? (toNumber(v) ?? NaN) : typeof v === "boolean" ? Number(v) : NaN);
const primitive = (v: unknown) => v === null || typeof v !== "object";
/** `==`: structural for lists and objects; `1 == "1"` for primitives, as text. */
const equal = (l: unknown, r: unknown): boolean => (l == null && r == null) || deepEqual(l, r) || (l != null && r != null && primitive(l) && primitive(r) && String(l) === String(r));
/** Arithmetic that has no number for an answer (text that is not a number, overflow) gives `null`. */
const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);

const toolError = (code: "tool-not-found" | "tool-failed", message: string): Error => Object.assign(new Error(message), { code });

export class Runtime {
  readonly store: NodeStore;
  private readonly lib: Library;
  private readonly state = new Map<string, unknown>();
  private readonly declared = new Map<string, Expr>();
  private readonly entries = new Map<string, Entry>();
  private readonly derived = new Map<string, GistUINode>();
  private readonly derivedRefs = new Map<string, number>();
  private readonly subs = new Map<string, Set<() => void>>();
  private readonly queries = new Map<string, Query>();
  private readonly cache = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly mutations = new Map<string, MutationStatus>();
  private readonly evaluating = new Set<string>();
  /** Values of expression statements within one pass (a shared chain is evaluated once, not 2^n times). */
  private readonly memo = new Map<string, { value: unknown; deps: Set<string>; derived: Set<string> }>();
  private readonly reported = new Set<string>();
  private toolCalls: number[] = [];
  private polling = 0;
  /** Strings the program assembled that may hold an address (see `assembled`). */
  private built = new Set<string>();
  private allBuilt = false;
  private paused = false;
  private live: boolean;
  private passDepth = 0;
  private steps = 0;
  /** Generated nodes produced by the evaluation in progress. */
  private collecting: Set<string> | null = null;
  private lastProgram: Program | null = null;
  private disposed = false;

  constructor(
    private readonly stream: GistUIStream,
    private readonly opts: RuntimeOptions = {},
  ) {
    this.store = stream.store;
    this.lib = stream.program.lib;
    this.live = opts.live !== false;
    stream.beforeCommit = () => this.declare();
    this.sync();
  }

  // ─── Views ────────────────────────────────────────────────────────────

  /** The node to render: the store node with its runtime props evaluated, or a generated node. */
  view(id: string): GistUINode | undefined {
    const src = this.store.get(id);
    if (!src) return this.derived.get(id);
    if (!src.dyn) return src;
    const e = this.entries.get(id);
    if (e && e.src === src) return e.view;
    return this.compute(id, src).view;
  }

  /** Called when `view(id)` may have changed (the store node, its runtime props, or a generated node). */
  subscribe(id: string, fn: () => void): () => void {
    let set = this.subs.get(id);
    if (!set) this.subs.set(id, (set = new Set()));
    set.add(fn);
    const off = this.store.subscribe(id, fn);
    return () => {
      off();
      set!.delete(fn);
      if (!set!.size) this.subs.delete(id);
    };
  }

  private notify(id: string): void {
    for (const fn of [...(this.subs.get(id) ?? [])]) fn();
  }

  /** One evaluation pass: the step budget and the statement memo are per pass. */
  private pass<T>(owner: string, fn: () => T, fallback: () => T): T {
    if (this.passDepth++ === 0) {
      this.steps = 0;
      this.memo.clear();
    }
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof LimitError)) throw e;
      this.limit(owner, e.message);
      return fallback();
    } finally {
      this.passDepth--;
    }
  }

  // ─── URLs that load by themselves ─────────────────────────────────────

  /**
   * Remembers a string the program put together (`+`, `@join`, `@fmt`). Only strings that can hold
   * an address or a Markdown image are kept. Past the cap everything counts as assembled, which
   * errs on the side of not loading.
   */
  private assembled(s: string): string {
    if (this.allBuilt || !(s.includes("//") || s.includes("![") || s.includes("\\"))) return s;
    if (this.built.size >= MAX_BUILT) {
      this.allBuilt = true;
      this.built.clear();
    } else this.built.add(s);
    return s;
  }

  /**
   * May this URL be loaded without a click (an image, a video, a background)? Renderers ask this
   * for URLs the core cannot see as props: the images of a Markdown text (`within` is that text).
   * See url-policy.ts for the rule.
   */
  loads(url: string, within?: string): boolean {
    const built = this.allBuilt || this.built.has(url) || (within !== undefined && this.built.has(within));
    return mayLoad(url, this.stream.urls, built);
  }

  /** The icon of a cited site, when the host turned site icons on (`favicons`) and the URL policy allows the service. */
  favicon(host: string | undefined): string | undefined {
    const template = this.opts.favicons;
    if (!template || !host || !/^[a-z0-9.-]+$/i.test(host)) return undefined;
    const url = template.replace("{host}", host);
    return mayLoad(url, this.stream.urls, false) ? url : undefined;
  }

  /** A runtime value for a prop, checked like a static one; a refused URL is reported once. */
  private checked(v: unknown, spec: PropSpec, name: string, nodeId: string): unknown {
    const r = coerceValue(v, spec, name, (url) => this.loads(url));
    if (r.issue?.code === "blocked-url") this.blocked(nodeId, r.issue.message);
    return r.value;
  }

  /** `style:{…}` from an expression: its background image follows the same rule as an Image. */
  private styleOf(v: unknown, nodeId: string): unknown {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const image = own(v, "image");
    if (typeof image !== "string" || this.loads(image)) return v;
    this.blocked(nodeId, `style.image: "${image.slice(0, 80)}" is not on an allowed host`);
    const { image: _dropped, ...rest } = v as Record<string, unknown>;
    return rest;
  }

  private blocked(nodeId: string, message: string): void {
    const key = `${nodeId}\u0000${message}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.opts.onEvent?.({ type: "error", code: "blocked-url", message, nodeId });
  }

  /** Reports a limit once per place (a program over a limit would otherwise report on every flush). */
  private limit(owner: string, message: string): void {
    const key = `${owner}\u0000${message}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.opts.onEvent?.({ type: "error", code: "limit", message, nodeId: owner });
  }

  /** Evaluates a node's runtime props (or an `#expr` node's children) and records what they read. */
  private compute(id: string, src: GistUINode): Entry {
    const sc: Scope = { locals: null, deps: new Set(), owner: id, path: "" };
    const derived = new Set<string>();
    const outer = this.collecting;
    this.collecting = derived;
    let view: GistUINode;
    try {
      view = this.pass(
        id,
        () => {
          if (src.type === "#expr") {
            const children: string[] = [];
            const value = src.dyn!.value;
            // A statement that is still streaming shows nothing yet (a query must not run on half its args).
            if (value && (!src.partial || !this.isQuery(value))) this.addChild(this.ev(value, sc), `${id}~`, children, sc);
            return { ...src, type: "#fragment", children };
          }
          const comp = this.lib.get(src.type);
          const props: Record<string, unknown> = { ...src.props };
          for (const [k, e] of Object.entries(src.dyn!)) {
            if (k === "do" || k === "bind") continue; // run on click / bound by the component
            const v = this.ev(e, { ...sc, path: `/${k}` });
            if (v === undefined || isLambda(v)) continue;
            // The same schema check as a static value: an expression cannot smuggle in a wrong type.
            const spec = comp && Object.hasOwn(comp.spec.props, k) ? comp.spec.props[k] : undefined;
            const c = k === "style" ? this.styleOf(v, id) : spec ? this.checked(v, spec, k, id) : v;
            if (c !== undefined) props[k] = c;
          }
          return { ...src, props };
        },
        // Over a limit: the node renders with its static props only.
        () => (src.type === "#expr" ? { ...src, type: "#fragment", children: [] } : src),
      );
    } finally {
      this.collecting = outer;
      if (outer) for (const d of derived) outer.add(d);
    }
    // An unchanged result keeps its identity, so nothing re-renders.
    const prev = this.entries.get(id);
    if (prev && deepEqual(prev.view, view)) view = prev.view;
    const e: Entry = { src, view, deps: sc.deps, derived };
    this.entries.set(id, e);
    this.retain(derived, prev?.derived);
    return e;
  }

  /** Reference counts for generated nodes: one no entry produces any more is dropped. */
  private retain(now: ReadonlySet<string>, before?: ReadonlySet<string>): void {
    for (const id of now) this.derivedRefs.set(id, (this.derivedRefs.get(id) ?? 0) + 1);
    if (!before) return;
    for (const id of before) {
      const n = (this.derivedRefs.get(id) ?? 1) - 1;
      if (n > 0) this.derivedRefs.set(id, n);
      else {
        this.derivedRefs.delete(id);
        this.derived.delete(id);
      }
    }
  }

  /** Re-evaluates every entry that read `dep`; notifies the ones whose view changed. */
  private invalidate(dep: string | ReadonlySet<string>): void {
    const hit = typeof dep === "string" ? (deps: Set<string>) => deps.has(dep) : (deps: Set<string>) => anyIn(deps, dep);
    this.memo.clear();
    for (const [id, e] of [...this.entries]) {
      if (!hit(e.deps)) continue;
      const src = this.store.get(id);
      if (!src || !src.dyn) {
        this.entries.delete(id);
        this.retain(new Set(), e.derived);
        continue;
      }
      const before = e.view;
      const after = this.compute(id, src).view;
      if (before !== after && !deepEqual(before, after)) this.notify(id);
    }
  }

  /**
   * Call after the stream flushes: re-evaluates what read a statement that changed, and stops the
   * queries of statements that are gone.
   */
  sync(): void {
    this.declare();
    const program = this.stream.program;
    const { exprs } = program.program;
    for (const [name, q] of this.queries) {
      const e = exprs.get(name);
      if (e && this.isQuery(e)) continue;
      this.stopQuery(q);
      this.queries.delete(name);
    }
    const changed = program.takeChanged();
    if (program !== this.lastProgram) {
      // A new program (a repair was applied in place): everything that read a statement is stale.
      this.lastProgram = program;
      this.invalidate(ANY_STATEMENT);
    } else if (changed.size) {
      const keys = new Set<string>();
      for (const id of changed) keys.add(`s:${id}`);
      this.invalidate(keys);
    }
  }

  /**
   * Picks up new `$state` declarations (existing values are kept, as in edit mode). The stream calls
   * this before each commit, so a component the commit renders already sees its bound value.
   */
  private declare(): void {
    const fresh: string[] = [];
    for (const [name, expr] of this.stream.program.program.state) {
      // The newest declaration is what @reset restores; a value set at runtime is kept.
      this.declared.set(name, expr);
      if (this.state.has(name)) continue;
      const initial = this.opts.initialState;
      const init = initial && Object.hasOwn(initial, name) ? initial[name] : this.pass(`$${name}`, () => this.ev(expr, { locals: null, deps: new Set(), owner: "$", path: "" }), () => null);
      this.state.set(name, init);
      fresh.push(name);
    }
    // Anything that read the variable before it was declared (as null) now gets its value.
    for (const name of fresh) {
      this.invalidate(`$${name}`);
      this.notify(`$${name}`);
    }
  }

  // ─── State ────────────────────────────────────────────────────────────

  getState(name: string): unknown {
    return this.state.has(name) ? this.state.get(name) : null;
  }

  setState(name: string, value: unknown): void {
    const key = name.replace(/^\$/, "");
    if (deepEqual(this.state.get(key), value) && this.state.has(key)) return;
    this.state.set(key, value);
    this.opts.onEvent?.({ type: "state", name: key, value });
    this.invalidate(`$${key}`);
    this.notify(`$${key}`);
  }

  /** Subscribes to one `$state` variable (for two-way bindings). */
  subscribeState(name: string, fn: () => void): () => void {
    return this.subscribeKey(`$${name.replace(/^\$/, "")}`, fn);
  }

  private subscribeKey(key: string, fn: () => void): () => void {
    let set = this.subs.get(key);
    if (!set) this.subs.set(key, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  /** Status of the query a statement defines (`sales = @query(…)`). */
  queryStatus(name: string): QueryStatus {
    const q = this.queries.get(name);
    return q ? { loading: q.loading, error: q.error, data: q.data, updatedAt: q.updatedAt } : { loading: false, error: null, data: undefined, updatedAt: null };
  }

  subscribeQuery(name: string, fn: () => void): () => void {
    return this.subscribeKey(`q:${name}`, fn);
  }

  // ─── Evaluation ───────────────────────────────────────────────────────

  /** Evaluates an expression outside any node (hosts, tests). */
  evaluate(e: Expr, locals?: Readonly<Record<string, unknown>>): unknown {
    return this.pass("#eval", () => this.ev(e, { locals: locals ? new Map(Object.entries(locals)) : null, deps: new Set(), owner: "#eval", path: "" }), () => undefined);
  }

  private ev(e: Expr, sc: Scope): unknown {
    if (++this.steps > MAX_STEPS) throw new LimitError("An expression takes too many steps to evaluate");
    switch (e.k) {
      case "str":
      case "num":
      case "bool":
      case "enum":
        return e.v;
      case "null":
        return null;
      case "flag":
        return true;
      case "state":
        sc.deps.add(`$${e.name}`);
        return this.state.has(e.name) ? this.state.get(e.name) : null;
      case "ref":
        return this.ref(e.name, sc);
      case "comp":
        return this.build(e, `${sc.owner}~${sc.path}`, sc);
      case "builtin":
        return this.builtin(e.name.replace(/^@/, "").toLowerCase(), e.args, sc);
      case "arr":
        return e.items.map((x, i) => this.ev(x, { ...sc, path: `${sc.path}.${i}` }));
      case "obj":
        return Object.fromEntries(e.entries.filter(([k]) => !BLOCKED_KEYS.has(k)).map(([k, x]) => [k, this.ev(x, { ...sc, path: `${sc.path}.${k}` })]));
      case "un": {
        const v = this.ev(e.e, sc);
        return e.op === "!" ? !truthy(v) : -num(v);
      }
      case "bin":
        return this.bin(e.op, e.l, e.r, sc);
      case "cond":
        return truthy(this.ev(e.c, sc)) ? this.ev(e.t, sc) : this.ev(e.f, sc);
      case "member": {
        const o = this.ev(e.o, sc);
        return this.member(o, e.name);
      }
      case "index": {
        const o = this.ev(e.o, sc);
        const i = this.ev(e.i, sc);
        if (isTable(o)) return tableRecords(o)[num(i)];
        if (Array.isArray(o)) return o[num(i) < 0 ? o.length + num(i) : num(i)];
        return own(o, String(i));
      }
      case "lambda":
        return new Lambda(e.params, e.body, sc);
    }
  }

  private member(o: unknown, name: string): unknown {
    if (isTable(o)) {
      if (name === "rows") return tableRecords(o);
      if (name === "length") return o.rows.length;
      const i = o.columns.findIndex((c) => c.name === name || c.name.toLowerCase() === name.toLowerCase());
      return i < 0 ? undefined : o.rows.map((_, n) => cellValue(o, n, i));
    }
    if (Array.isArray(o)) {
      if (name === "length") return o.length;
      // Pluck: `rows.total` is every row's total.
      return o.map((x) => own(x, name));
    }
    if (typeof o === "string" && name === "length") return o.length;
    return own(o, name);
  }

  private bin(op: string, le: Expr, re: Expr, sc: Scope): unknown {
    if (op === "&&") {
      const l = this.ev(le, sc);
      return truthy(l) ? this.ev(re, sc) : l;
    }
    if (op === "||") {
      const l = this.ev(le, sc);
      return truthy(l) ? l : this.ev(re, sc);
    }
    const l = this.ev(le, sc);
    const r = this.ev(re, sc);
    switch (op) {
      case "==":
        return equal(l, r);
      case "!=":
        return !equal(l, r);
      case "<":
        return order(l, r) < 0;
      case ">":
        return order(l, r) > 0;
      case "<=":
        return order(l, r) <= 0;
      case ">=":
        return order(l, r) >= 0;
      case "+": {
        if (typeof l !== "string" && typeof r !== "string") return finite(num(l) + num(r));
        const s = `${l ?? ""}${r ?? ""}`;
        if (s.length > MAX_STRING) throw new LimitError("A text value grew too long");
        return this.assembled(s);
      }
      case "-":
        return finite(num(l) - num(r));
      case "*":
        return finite(num(l) * num(r));
      case "/":
        return num(r) === 0 ? null : finite(num(l) / num(r));
      case "%":
        return num(r) === 0 ? null : finite(num(l) % num(r));
    }
    return undefined;
  }

  /** A name: a lambda parameter, a data statement, an expression statement, or a component. */
  private ref(name: string, sc: Scope): unknown {
    if (sc.locals?.has(name)) return sc.locals.get(name);
    sc.deps.add(`s:${name}`);
    const prog = this.stream.program.program;
    if (prog.data.has(name)) return prog.data.get(name);
    const expr = prog.exprs.get(name);
    if (expr) {
      if (expr.k === "builtin" && /^@?query$/i.test(expr.name)) return this.query(name, expr, sc);
      if (expr.k === "builtin" && /^@?mutation$/i.test(expr.name)) {
        sc.deps.add(`m:${name}`);
        return this.mutations.get(name) ?? { status: "idle", data: null, error: null };
      }
      if (this.evaluating.has(name) || this.evaluating.size > MAX_DEPTH) return undefined; // a cycle
      // Outside a lambda the value depends on nothing local: once per pass is enough.
      const hit = sc.locals ? undefined : this.memo.get(name);
      if (hit) {
        for (const d of hit.deps) sc.deps.add(d);
        if (this.collecting) for (const d of hit.derived) this.collecting.add(d);
        return hit.value;
      }
      const inner: Scope = { locals: sc.locals, deps: new Set(), owner: name, path: "" };
      const derived = new Set<string>();
      const outer = this.collecting;
      this.collecting = derived;
      this.evaluating.add(name);
      let value: unknown;
      try {
        value = this.ev(expr, inner);
      } finally {
        this.evaluating.delete(name);
        this.collecting = outer;
        if (outer) for (const d of derived) outer.add(d);
      }
      for (const d of inner.deps) sc.deps.add(d);
      if (!sc.locals) this.memo.set(name, { value, deps: inner.deps, derived });
      return value;
    }
    if (this.store.has(name)) return { $ref: name } satisfies NodeRef;
    return undefined;
  }

  private isQuery(e: Expr): boolean {
    return e.k === "builtin" && /^@?query$/i.test(e.name);
  }

  private args(args: readonly Arg[], sc: Scope): { pos: unknown[]; named: Map<string, unknown> } {
    const pos: unknown[] = [];
    const named = new Map<string, unknown>();
    for (const a of args) {
      if (a.name) named.set(a.name, this.ev(a.value, sc));
      else pos.push(this.ev(a.value, sc));
    }
    return { pos, named };
  }

  private call(fn: unknown, args: unknown[]): unknown {
    if (!isLambda(fn)) return undefined;
    const locals = new Map(fn.scope.locals ?? []);
    fn.params.forEach((p, i) => locals.set(p, args[i]));
    return this.ev(fn.body, { ...fn.scope, locals });
  }

  /** A value to compare or sum by: a lambda, a property name, or the item itself. */
  private by(key: unknown): (x: unknown) => unknown {
    if (isLambda(key)) return (x) => this.call(key, [x]);
    if (typeof key === "string") return (x) => own(x, key);
    return (x) => x;
  }

  private builtin(name: string, args: readonly Arg[], sc: Scope): unknown {
    if (name === "each") {
      const [listE, fnE] = args;
      if (!listE || !fnE) return [];
      let list = listOf(this.ev(listE.value, sc));
      if (list.length > MAX_EACH) {
        this.limit(sc.owner, `@each shows the first ${MAX_EACH} of ${list.length} items`);
        list = list.slice(0, MAX_EACH);
      }
      const fn = this.ev(fnE.value, sc);
      if (!isLambda(fn)) return [];
      // An item's `id` or `key` names its generated nodes; a repeated one falls back to its position.
      const seen = new Set<string>();
      return list.map((item, i) => {
        let key = String(own(item, "id") ?? own(item, "key") ?? i);
        if (seen.has(key)) key = `${key}#${i}`;
        seen.add(key);
        const locals = new Map(fn.scope.locals ?? []);
        fn.params.forEach((p, j) => locals.set(p, j === 0 ? item : i));
        return this.ev(fn.body, { ...fn.scope, locals, path: `${sc.path}[${key}]` });
      });
    }
    if (name === "query" || name === "mutation") return undefined; // statement-level only
    const { pos, named } = this.args(args, sc);
    const [a, b, c] = pos;
    switch (name) {
      case "count":
        return Array.isArray(a) ? a.length : isTable(a) ? a.rows.length : typeof a === "string" ? a.length : a && typeof a === "object" ? Object.keys(a).length : 0;
      case "first":
        return listOf(a)[0] ?? null;
      case "last": {
        const l = listOf(a);
        return l[l.length - 1] ?? null;
      }
      case "sum":
      case "avg":
      case "min":
      case "max": {
        const vals = listOf(a).map(this.by(b)).map(num).filter((n) => Number.isFinite(n));
        if (!vals.length) return name === "sum" ? 0 : null;
        // Loops, not `Math.min(...vals)`: a spread throws on a very long list.
        let acc = vals[0]!;
        for (let i = 1; i < vals.length; i++) {
          const v = vals[i]!;
          acc = name === "min" ? (v < acc ? v : acc) : name === "max" ? (v > acc ? v : acc) : acc + v;
        }
        return name === "avg" ? acc / vals.length : acc;
      }
      case "sort": {
        const key = this.by(b);
        const dir = String(c ?? named.get("dir") ?? "asc").toLowerCase() === "desc" ? -1 : 1;
        return [...listOf(a)].sort((x, y) => {
          const p = key(x);
          const q = key(y);
          const np = num(p);
          const nq = num(q);
          const [sp, sq] = [String(p ?? ""), String(q ?? "")];
          const d = Number.isFinite(np) && Number.isFinite(nq) ? np - nq : sp < sq ? -1 : sp > sq ? 1 : 0;
          return d * dir;
        });
      }
      case "filter":
        return listOf(a).filter((x) => truthy(this.by(b)(x)));
      case "round": {
        const d = Math.max(0, Math.min(10, Math.round(num(b ?? 0)) || 0));
        return Math.round(num(a) * 10 ** d) / 10 ** d;
      }
      case "abs":
        return Math.abs(num(a));
      case "floor":
        return Math.floor(num(a));
      case "ceil":
        return Math.ceil(num(a));
      case "fmt":
        return this.assembled(fmt(a, String(b ?? "")));
      case "join": {
        const s = listOf(a).map((x) => String(x ?? "")).join(typeof b === "string" ? b : ", ");
        if (s.length > MAX_STRING) throw new LimitError("A text value grew too long");
        return this.assembled(s);
      }
      case "status":
        return undefined;
    }
    return undefined;
  }

  // ─── Generated components ─────────────────────────────────────────────

  /** A component produced at runtime becomes a generated node; returns a reference to it. */
  private build(e: CompExpr, id: string, sc: Scope): NodeRef {
    const comp = this.lib.get(e.name) ?? this.lib.get(this.lib.closest(e.name) ?? "");
    const props: Record<string, unknown> = {};
    const dyn: Record<string, Expr> = {};
    const children: string[] = [];
    let pi = 0;
    // A prop from an evaluated value, checked against the schema like a static one.
    const set = (name: string, v: unknown) => {
      if (v === undefined || isLambda(v)) return;
      const spec = comp && Object.hasOwn(comp.spec.props, name) ? comp.spec.props[name] : undefined;
      const c = name === "style" ? this.styleOf(v, id) : spec ? this.checked(v, spec, name, id) : v;
      if (c !== undefined) props[name] = c;
    };
    // As in the program: props given by name, flag or bare enum word keep their slot.
    const free = (name: string) => !sc.locals?.has(name) && this.ref(name, { ...sc, deps: new Set() }) === undefined;
    const given = new Set<string>();
    if (comp) {
      for (const a of e.args) {
        const name = a.name ? comp.propLookup.get(a.name.toLowerCase()) : a.value.k === "flag" ? a.value.name : a.value.k === "ref" && free(a.value.name) ? (comp.flags.has(a.value.name) ? a.value.name : comp.enumWords.get(a.value.name)) : undefined;
        if (name) given.add(name);
      }
    }
    const advance = () => {
      while (comp && pi < comp.positional.length && (comp.positional[pi]! in props || given.has(comp.positional[pi]!))) pi++;
    };
    const taken = new Set<string>();
    e.args.forEach((a, i) => {
      const at: Scope = { ...sc, path: `${sc.path}/${i}` };
      if (a.name) {
        if (BLOCKED_KEYS.has(a.name)) return;
        const prop = a.name === "style" ? "style" : (comp?.propLookup.get(a.name.toLowerCase()) ?? a.name);
        // A prop the component does not have is dropped, as in the program (`style` is the design layer's).
        if (comp && prop !== "style" && !Object.hasOwn(comp.spec.props, prop)) return;
        // Steps and bindings stay expressions (run on click / bound by the component), with the
        // item's lambda parameters filled in, so a button in `@each` acts on its own row.
        const t = comp && Object.hasOwn(comp.spec.props, prop) ? comp.spec.props[prop]!.type : undefined;
        if (t === "action" || t === "state") {
          dyn[prop] = sc.locals ? bindLocals(a.value, sc.locals) : a.value;
          return;
        }
        set(prop, this.ev(a.value, at));
        return;
      }
      if (a.value.k === "flag") {
        props[a.value.name] = true;
        return;
      }
      if (comp && a.value.k === "ref" && !(sc.locals?.has(a.value.name))) {
        if (comp.flags.has(a.value.name)) {
          props[a.value.name] = true;
          return;
        }
        const w = comp.enumWords.get(a.value.name);
        if (w && this.ref(a.value.name, { ...at, deps: new Set() }) === undefined) {
          props[w] = a.value.name;
          advance();
          return;
        }
      }
      advance();
      const slot = comp && pi < comp.positional.length ? comp.spec.props[comp.positional[pi]!] : undefined;
      if (slot?.type === "enum" && a.value.k === "ref" && !sc.locals?.has(a.value.name) && this.ref(a.value.name, { ...at, deps: new Set() }) === undefined && (slot.open || slot.values.includes(a.value.name))) {
        props[comp!.positional[pi]!] = a.value.name;
        pi++;
        advance();
        return;
      }
      const v = this.ev(a.value, at);
      if (comp && pi < comp.positional.length) {
        set(comp.positional[pi]!, v);
        pi++;
        advance();
      } else if (!comp || comp.hasChildren) this.addChild(v, `${id}/${i}`, children, at);
      else {
        // As in the program: further positional values fill optional props in signature order.
        const name = Object.keys(comp.spec.props).find((p) => !comp.positional.includes(p) && !given.has(p) && !(p in props) && !taken.has(p) && p !== "style");
        if (name) {
          taken.add(name);
          if (v !== null) set(name, v);
        }
      }
    });
    const type = comp ? comp.spec.name : "#unknown";
    if (!comp) props.component = e.name;
    this.putDerived({ id, type, props, children, partial: false, stmt: sc.owner, ...(Object.keys(dyn).length ? { dyn } : {}) });
    return { $ref: id };
  }

  /** Adds one value as children: components, text, or a list of them. */
  private addChild(v: unknown, id: string, out: string[], sc: Scope): void {
    if (v == null || v === false || isLambda(v)) return;
    if (isNodeRef(v)) {
      out.push(v.$ref);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => this.addChild(x, `${id}.${i}`, out, sc));
      return;
    }
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    this.putDerived({ id, type: this.lib.textComponent, props: { [this.lib.textProp]: text }, children: [], partial: false, stmt: sc.owner });
    out.push(id);
  }

  private putDerived(n: GistUINode): void {
    this.collecting?.add(n.id);
    const prev = this.derived.get(n.id);
    if (prev && deepEqual(prev, n)) return;
    if (!prev && this.derived.size >= MAX_DERIVED) throw new LimitError(`More than ${MAX_DERIVED} components were generated`);
    this.derived.set(n.id, n);
    if (prev) this.notify(n.id);
  }

  // ─── Queries and mutations ────────────────────────────────────────────

  private query(name: string, e: { args: Arg[] }, sc: Scope): unknown {
    sc.deps.add(`q:${name}`);
    // A query whose arguments read the query itself (directly or through another statement) has
    // no stable arguments: the inner read sees nothing, so there is no feedback loop.
    if (this.evaluating.has(name)) return undefined;
    const node = this.store.get(name);
    this.evaluating.add(name);
    let pos: unknown[];
    let named: Map<string, unknown>;
    try {
      ({ pos, named } = this.args(e.args, { ...sc, path: `/${name}` }));
    } finally {
      this.evaluating.delete(name);
    }
    const tool = String(pos[0] ?? "");
    const def = named.get("default") ?? null;
    // Never on a half-streamed statement.
    if (node?.partial) return def;
    const params = pos[1] ?? named.get("args") ?? {};
    const key = `${tool}\u0000${stableJson(params)}`;
    let q = this.queries.get(name);
    if (!q || q.key !== key) {
      if (q) this.stopQuery(q);
      const fresh: Query = (q = new Query(key, this.cache.get(key), () => this.shared(key, () => this.callTool({ name: tool, args: params, kind: "query", nodeId: name })), (changed) => {
        if (changed === "data") this.remember(key, fresh.data);
        // A query that failed is reported to the host once (it keeps its default value on screen).
        else if (fresh.error !== null) {
          const report = `q:${name}\u0000${fresh.error}`;
          if (!this.reported.has(report)) {
            this.reported.add(report);
            this.opts.onEvent?.({ type: "error", code: fresh.errorCode === "tool-not-found" ? "tool-not-found" : "tool-failed", message: fresh.error, nodeId: name });
          }
        }
        this.invalidate(`q:${name}`);
        this.notify(`q:${name}`);
      }));
      this.queries.set(name, q);
      const every = num(named.get("every"));
      if (Number.isFinite(every) && every > 0) this.poll(q, name, Math.max(every, this.opts.minInterval ?? 5) * 1000);
      // Not during this evaluation: the first result (or failure) re-evaluates what read the query.
      if (this.live) q.start();
    }
    return q.data === undefined ? def : q.data;
  }

  /** Starts `every:` refreshing, within limits: a delay a timer can hold, and a cap on how many poll. */
  private poll(q: Query, name: string, ms: number): void {
    if (ms > MAX_TIMER_MS) return; // longer than a timer can wait (24 days): it never comes due
    if (this.polling >= MAX_POLLING) {
      this.limit(name, `Only ${MAX_POLLING} queries can refresh on a timer`);
      return;
    }
    this.polling++;
    q.every(ms, this.paused || !this.live);
  }

  /** Starts what `live: false` held back: the first call of every query, and the refresh timers. */
  start(): void {
    if (this.live || this.disposed) return;
    this.live = true;
    for (const q of this.queries.values()) {
      q.start();
      if (!this.paused) q.resume();
    }
  }

  /**
   * Pauses or resumes every `every:` refresh timer (for a UI that is no longer the current one, such
   * as an earlier answer in a chat). The UI still loads its data and still answers the person: only
   * the timers stop.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!this.live) return;
    for (const q of this.queries.values()) {
      if (paused) q.pause();
      else q.resume();
    }
  }

  private stopQuery(q: Query): void {
    if (q.polling) this.polling--;
    q.stop();
  }

  /** One request for identical calls made at the same time (two statements, same tool and args). */
  private shared(key: string, load: () => Promise<unknown>): Promise<unknown> {
    let p = this.inflight.get(key);
    if (!p) {
      p = load().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  private remember(key: string, data: unknown): void {
    this.cache.delete(key);
    this.cache.set(key, data);
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
  }

  private async callTool(call: ToolCall): Promise<unknown> {
    const fn = resolveTool(call.kind === "query" ? this.opts.tools : this.opts.mutations, call.name, call.kind);
    if (!fn) {
      throw toolError(
        "tool-not-found",
        call.kind === "query" ? `Tool "${call.name}" is not available to @query (read-only tools go in \`tools\`)` : `Tool "${call.name}" is not available to @mutation (tools that change something go in \`mutations\`)`,
      );
    }
    const now = Date.now();
    this.toolCalls = this.toolCalls.filter((t) => now - t < TOOL_WINDOW_MS);
    if (this.toolCalls.length >= (this.opts.maxToolCalls ?? 60)) throw toolError("tool-failed", "Too many tool calls; try again in a moment");
    this.toolCalls.push(now);
    if (this.opts.onToolCall && (await this.opts.onToolCall(call)) === false) throw toolError("tool-failed", `The call to "${call.name}" was not allowed`);
    return fn(call.args);
  }

  private async mutate(name: string, nodeId?: string): Promise<boolean> {
    const expr = this.stream.program.program.exprs.get(name);
    // Only a `@mutation` statement names a tool to call. Any other statement (`x = @fmt("save")`)
    // must not reach a tool through `@run(x)`.
    if (!expr || expr.k !== "builtin" || !/^@?mutation$/i.test(expr.name)) {
      this.opts.onEvent?.({ type: "error", code: "unknown-step", message: `@run needs a @mutation or @query statement; "${name}" is neither`, nodeId });
      return false;
    }
    const { pos, named } = this.pass(name, () => this.args(expr.args, { locals: null, deps: new Set(), owner: name, path: "" }), () => ({ pos: [], named: new Map<string, unknown>() }));
    const tool = String(pos[0] ?? "");
    const set = (s: MutationStatus) => {
      this.mutations.set(name, s);
      this.invalidate(`m:${name}`);
      this.notify(`m:${name}`);
    };
    set({ status: "pending", data: this.mutations.get(name)?.data ?? null, error: null });
    try {
      const data = await this.callTool({ name: tool, args: pos[1] ?? named.get("args") ?? {}, kind: "mutation", nodeId });
      set({ status: "success", data, error: null });
      return true;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      set({ status: "error", data: null, error: message });
      this.opts.onEvent?.({ type: "error", code: (err as { code?: string }).code === "tool-not-found" ? "tool-not-found" : "tool-failed", message, nodeId });
      return false;
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────────

  /** Runs a `do:[…]` list (or one step) in order; stops at the first failure. Call it from a user's action. */
  async run(steps: Expr, nodeId?: string, locals?: Readonly<Record<string, unknown>>): Promise<void> {
    const list = steps.k === "arr" ? steps.items : [steps];
    const sc: Scope = { locals: locals ? new Map(Object.entries(locals)) : null, deps: new Set(), owner: nodeId ?? "#run", path: "" };
    const value = (e: Expr | undefined, scope: Scope = sc): unknown => (e ? this.pass(sc.owner, () => this.ev(e, scope), () => null) : undefined);
    for (const step of list) {
      if (this.disposed) return;
      if (step.k !== "builtin") {
        this.opts.onEvent?.({ type: "error", code: "unknown-step", message: "An action step must be @run, @set, @reset, @send, @open or @emit", nodeId });
        return;
      }
      const name = step.name.replace(/^@/, "").toLowerCase();
      const [a0, a1] = step.args;
      switch (name) {
        case "run": {
          const target = a0?.value.k === "ref" ? a0.value.name : null;
          if (!target) break;
          const expr = this.stream.program.program.exprs.get(target);
          if (expr && this.isQuery(expr)) {
            await this.queries.get(target)?.fetch(true);
            break;
          }
          if (!(await this.mutate(target, nodeId))) return;
          break;
        }
        case "set":
          if (a0?.value.k === "state") this.setState(a0.value.name, a1 ? value(a1.value) : null);
          break;
        case "reset":
          for (const a of step.args) {
            if (a.value.k !== "state") continue;
            const decl = this.declared.get(a.value.name);
            this.setState(a.value.name, decl ? value(decl, { ...sc, deps: new Set() }) : null);
          }
          break;
        case "send":
          this.opts.onEvent?.({ type: "send", message: String(value(a0?.value) ?? ""), nodeId });
          break;
        case "open": {
          // As a browser reads it: control characters are dropped, spaces at the ends too. A backslash
          // can pass for a slash, so a URL with one is refused.
          const url = String(value(a0?.value) ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
          const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
          if (!scheme || url.includes("\\") || !(this.opts.schemes ?? ["http", "https", "mailto", "tel"]).includes(scheme)) {
            this.opts.onEvent?.({ type: "error", code: "blocked-url", message: `Blocked URL "${url.slice(0, 80)}"`, nodeId });
            return;
          }
          this.opts.onEvent?.({ type: "open", url, nodeId });
          break;
        }
        case "emit":
          this.opts.onEvent?.({ type: "emit", event: String(value(a0?.value) ?? ""), payload: a1 ? value(a1.value) : null, nodeId });
          break;
        default:
          this.opts.onEvent?.({ type: "error", code: "unknown-step", message: `Unknown action @${name}`, nodeId });
          return;
      }
    }
  }

  /** Stops refresh timers; later calls do nothing. */
  dispose(): void {
    this.disposed = true;
    for (const q of this.queries.values()) q.stop();
    this.queries.clear();
    this.polling = 0;
    this.stream.beforeCommit = null;
  }
}

/** Matches every `s:<statement>` dependency (see `sync`). */
const ANY_STATEMENT: ReadonlySet<string> = {
  has: (k: string) => k.startsWith("s:"),
} as ReadonlySet<string>;

const anyIn = (deps: Set<string>, keys: ReadonlySet<string>): boolean => {
  for (const d of deps) if (keys.has(d)) return true;
  return false;
};

class Query {
  loading = false;
  error: string | null = null;
  /** `tool-not-found` when the tool does not exist, otherwise undefined. */
  errorCode: string | undefined;
  updatedAt: number | null = null;
  polling = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private interval = 0;
  private seq = 0;
  private stopped = false;

  constructor(
    readonly key: string,
    public data: unknown,
    private readonly load: () => Promise<unknown>,
    private readonly changed: (what: "data" | "status") => void,
  ) {}

  /** The first fetch, after the evaluation that created the query has finished. */
  start(): void {
    this.loading = true;
    queueMicrotask(() => void this.fetch(true));
  }

  async fetch(force = false): Promise<void> {
    if (this.stopped || (this.loading && !force)) return;
    const seq = ++this.seq;
    this.loading = true;
    this.changed("status");
    try {
      const data = await this.load();
      if (this.stopped || seq !== this.seq) return;
      this.data = data;
      this.error = null;
      this.updatedAt = Date.now();
      this.loading = false;
      this.changed("data");
    } catch (e) {
      if (this.stopped || seq !== this.seq) return;
      this.error = (e as Error).message ?? String(e);
      this.errorCode = (e as { code?: string }).code;
      this.loading = false;
      this.changed("status");
    }
  }

  every(ms: number, paused: boolean): void {
    this.polling = true;
    this.interval = ms;
    if (!paused) this.resume();
  }

  /** Stops the refresh timer; `resume()` starts it again. Fetches asked for in other ways still run. */
  pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  resume(): void {
    if (this.timer || !this.polling || this.stopped) return;
    // A hidden page does not refresh; it catches up on the next tick after it is shown again.
    this.timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) void this.fetch();
    }, this.interval);
  }

  stop(): void {
    this.stopped = true;
    this.polling = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Replaces lambda parameters with their values, as literals (for steps that run later). */
function bindLocals(e: Expr, locals: ReadonlyMap<string, unknown>): Expr {
  const lit = (v: unknown): Expr | null => {
    if (v === null || v === undefined) return { k: "null" };
    if (typeof v === "string") return { k: "str", v };
    if (typeof v === "number") return { k: "num", v };
    if (typeof v === "boolean") return { k: "bool", v };
    if (Array.isArray(v)) {
      const items = v.map(lit);
      return items.every(Boolean) ? { k: "arr", items: items as Expr[] } : null;
    }
    if (typeof v === "object" && !isNodeRef(v) && !isTable(v) && !isLambda(v)) {
      const entries = Object.entries(v).map(([k, x]) => [k, lit(x)] as const);
      return entries.every(([, x]) => x) ? { k: "obj", entries: entries as [string, Expr][] } : null;
    }
    return null;
  };
  const walk = (x: Expr, shadow: ReadonlySet<string>): Expr => {
    switch (x.k) {
      case "ref":
        return !shadow.has(x.name) && locals.has(x.name) ? (lit(locals.get(x.name)) ?? x) : x;
      case "comp":
      case "builtin":
        return { ...x, args: x.args.map((a) => ({ ...a, value: walk(a.value, shadow) })) };
      case "arr":
        return { ...x, items: x.items.map((i) => walk(i, shadow)) };
      case "obj":
        return { ...x, entries: x.entries.map(([k, v]) => [k, walk(v, shadow)] as [string, Expr]) };
      case "bin":
        return { ...x, l: walk(x.l, shadow), r: walk(x.r, shadow) };
      case "un":
        return { ...x, e: walk(x.e, shadow) };
      case "cond":
        return { ...x, c: walk(x.c, shadow), t: walk(x.t, shadow), f: walk(x.f, shadow) };
      case "member":
        return { ...x, o: walk(x.o, shadow) };
      case "index":
        return { ...x, o: walk(x.o, shadow), i: walk(x.i, shadow) };
      case "lambda":
        return { ...x, body: walk(x.body, new Set([...shadow, ...x.params])) };
      default:
        return x;
    }
  };
  return walk(e, new Set());
}

function stableJson(v: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) return "null";
  if (Array.isArray(v)) return `[${v.map((x) => stableJson(x, depth + 1)).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k], depth + 1)}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** `@fmt(v, "$" | "%" | "date" | "number" | "compact")`. */
function fmt(v: unknown, kind: string): string {
  const n = num(v);
  switch (kind.toLowerCase()) {
    case "$":
    case "usd":
    case "currency":
      return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }) : String(v ?? "");
    case "%":
    case "percent":
      return Number.isFinite(n) ? `${(Math.abs(n) <= 1 && n !== 0 ? n * 100 : n).toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : String(v ?? "");
    case "compact":
      return Number.isFinite(n) ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }) : String(v ?? "");
    case "date": {
      // A date-only ISO string is a calendar day, not UTC midnight (which shifts a day west of UTC).
      const day = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim()) : null;
      const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : typeof v === "number" ? new Date(v) : new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v ?? "") : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    default:
      return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v ?? "");
  }
}

export type { CompiledComponent };
