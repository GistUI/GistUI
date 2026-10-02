import { hyphenWord } from "./parser";
/**
 * Materializer: statements → nodes in a NodeStore, as patches rather than trees.
 *
 * - Node ids are statement ids, or paths under them for inline nodes (`mau/1`, `tabs/0.2`), so they
 *   are stable while a statement streams and after it completes.
 * - A reference to a statement that has not arrived yet becomes a `#pending` placeholder with the
 *   referenced id. When the statement arrives it replaces the placeholder in place, and the parent
 *   does not change.
 * - A reverse-dependency graph re-materializes only the statements that depend on a changed one, and
 *   only when the change matters to them (a data value they inline, a definition, a deletion or a kind
 *   change). Each statement is materialized at most once per change, so shared refs stay linear.
 */

import type { Arg, Cell, CompExpr, Expr, Stmt, StrExpr, TableData } from "./ast";
import { coerceValue } from "./coerce";
import { mayLoad, type UrlPolicy } from "./url-policy";
import type { GistUIError } from "./errors";
import type { CompiledComponent, Library, PropSpec, TableMapping } from "./schema";
import { signature } from "./signature";
import { isNodeRef, NodeStore, type GistUINode, type NodeRef } from "./store";
import { toNumber } from "./table";
import { BLOCKED_KEYS, own, sameAst } from "./util";

const isTableData = (v: unknown): v is TableData =>
  typeof v === "object" && v !== null && Array.isArray((v as TableData).columns) && Array.isArray((v as TableData).rows) && Array.isArray((v as TableData).text);

type Kind = "node" | "data" | "dyn" | "state";

/** How a statement uses a dependency, as bit flags. */
const CHILD = 1; // as a child or node ref: only deletion, definition as data, or a kind change matter
const VALUE = 2; // its value is inlined: every change matters
const EXPR = 4; // read by a runtime expression: tracked for reachability and final reporting only

interface Rec {
  id: string;
  line: number;
  order: number;
  kind: Kind;
  expr: Expr | null;
  table: TableData | null;
  overrides: Map<string, Expr>;
  appends: Expr[];
  complete: boolean;
  owned: Set<string>;
  deps: Map<string, number>;
  errors: GistUIError[];
  parseErrors: GistUIError[];
  data?: unknown;
  openString?: StrExpr;
  /** Inline components built by the last tail parse, reused while their AST is unchanged. */
  tailCache?: Map<string, CacheEntry>;
  /** The last complete definition, kept while a redefinition streams (restored if that fails to parse). */
  backup?: Pick<Rec, "kind" | "expr" | "table" | "overrides" | "appends" | "line" | "parseErrors">;
  /** References this statement dropped: to statements never defined (at the end) or deleted. */
  dropped: Set<string>;
  /** For a component statement: which argument of the call filled each prop (for the printer). */
  argOf: Map<string, number>;
  /** Size of a data value, counted in leaves (inlined data included). */
  weight: number;
}

/** Limits that keep a hostile or runaway program from exhausting memory or time. */
const MAX_DATA_WEIGHT = 200_000;
const MAX_OWNED = 5_000;
const MAX_NODES = 50_000;
/**
 * Most components one render shows. A statement used in several places is shown once per place, so
 * a few lines can ask for far more than they define (`a = Stack(b, b)`, `b = Stack(c, c)`, …).
 */
const MAX_INSTANCES = 50_000;

class LimitReached extends Error {}

interface CacheEntry {
  expr: CompExpr;
  owned: string[];
  deps: [string, number][];
}

/** Where the string that is still streaming ended up, for the text fast path. */
export interface OpenTextTarget {
  nodeId: string;
  prop: string;
}

interface Ctx {
  rec: Rec;
  complete: boolean;
  /** Set when a data statement turns out to depend on a runtime value. */
  sawDyn: boolean;
  /** Tail cache from the previous parse of this statement, when it may be reused. */
  cache: Map<string, CacheEntry> | null;
  nextCache: Map<string, CacheEntry> | null;
  ownedLog: string[];
  depLog: [string, number][];
  weight: number;
}

export class Program {
  readonly store: NodeStore;
  private recs = new Map<string, Rec>();
  private deleted = new Set<string>();
  private rdeps = new Map<string, Map<string, number>>();
  private pending = new Set<string>();
  private orderSeq = 0;
  private final = false;
  openText: OpenTextTarget | null = null;

  constructor(
    readonly lib: Library,
    store?: NodeStore,
    /** Which hosts a URL that loads by itself may point to (see url-policy.ts). */
    private readonly urls?: UrlPolicy,
  ) {
    this.store = store ?? new NodeStore();
  }

  /** The URL policy for a value written out in the program (not built from pieces at runtime). */
  private readonly loads = (url: string): boolean => mayLoad(url, this.urls, false);

  /** Applies one parsed statement. `complete` is false for the open tail of a stream. */
  apply(stmt: Stmt, line: number, complete: boolean, parseErrors: GistUIError[] = [], openString?: StrExpr): void {
    if (!complete) this.openText = null;
    switch (stmt.kind) {
      case "assign":
        if (stmt.value.k === "null") {
          if (complete) this.delete(stmt.id);
          return;
        }
        this.define(stmt.id, classify(stmt.value), stmt.value, null, line, complete, parseErrors, openString);
        return;
      case "table":
        this.define(stmt.id, "data", null, stmt.table, line, complete, parseErrors);
        return;
      case "state":
        this.define(`$${stmt.id}`, "state", stmt.value, null, line, complete, parseErrors);
        return;
      case "patch":
      case "append": {
        if (!complete) return;
        const target = this.recs.get(stmt.id);
        const ok = target && (target.kind === "node" || (stmt.kind === "append" && target.kind === "data" && target.expr?.k === "arr"));
        if (!target || !ok) {
          this.globalError({
            code: "patch-target-missing",
            severity: "error",
            stmtId: stmt.id,
            line,
            message:
              stmt.kind === "patch"
                ? `\`${stmt.id}.${stmt.prop}\` patches a statement that is not a component`
                : `\`${stmt.id} +=\` appends to a statement that is not a component or list`,
          });
          return;
        }
        if (stmt.kind === "patch") {
          target.overrides.set(stmt.prop, this.resolvePatchValue(target, stmt.prop, stmt.value));
          // `id.children = …` replaces the children, also the ones appended so far.
          if (stmt.prop === "children") target.appends = [];
        }
        else if (target.kind === "node") target.appends.push(stmt.value);
        else if (target.expr?.k === "arr") target.expr = { k: "arr", items: [...target.expr.items, stmt.value] };
        this.materialize(target);
        this.propagate([target.id], { defined: false, kindChanged: false, deleted: false });
        return;
      }
    }
  }

  /** A patch has no enclosing call, so bare words are resolved against the target's prop here. */
  private resolvePatchValue(target: Rec, prop: string, value: Expr): Expr {
    if (target.expr?.k !== "comp") return value;
    const comp = this.lib.get(target.expr.name) ?? this.lib.get(this.lib.closest(target.expr.name) ?? "");
    const name = comp?.propLookup.get(prop.toLowerCase());
    const spec = name ? comp!.spec.props[name] : undefined;
    if (spec?.type !== "enum") return value;
    const word = hyphenWord(value);
    return word !== undefined ? { k: "enum", v: word } : value;
  }

  /** Removes a statement that only ever streamed partially (its final text failed to parse). */
  dropPartial(id: string): void {
    const rec = this.recs.get(id);
    if (rec && !rec.complete) {
      if (rec.backup) {
        // It was redefining a complete statement: that definition stands.
        const prevKind = rec.kind;
        Object.assign(rec, rec.backup, { complete: true });
        delete rec.backup;
        delete rec.openString;
        this.materialize(rec);
        this.propagate([id], { defined: false, kindChanged: prevKind !== rec.kind, deleted: false });
        return;
      }
      this.delete(id);
    }
    this.deleted.delete(id);
  }

  /** Every node this program put in the store: statement nodes and the inline nodes they own. */
  nodeIds(): Set<string> {
    const out = new Set<string>();
    for (const r of this.recs.values()) {
      if (this.store.has(r.id)) out.add(r.id);
      for (const n of r.owned) out.add(n);
    }
    return out;
  }

  /** Ends the stream: drops unresolved refs, reports them, detects cycles and unreachable statements. */
  finish(): void {
    this.final = true;
    for (const id of [...this.pending]) {
      this.pending.delete(id);
      this.store.remove(id);
    }
    const missing = [...this.rdeps.keys()].filter((t) => !this.recs.has(t));
    this.propagate(missing, { defined: false, kindChanged: false, deleted: true });
    if (!this.recs.has("root")) {
      const first = [...this.recs.values()].filter((r) => r.kind === "node").sort((a, b) => a.order - b.order)[0];
      if (first) this.store.setRoot(first.id);
    }
    this.checkChildren();
    this.checkCycles();
  }

  private capDue = false;

  /**
   * Keeps what one render shows within `MAX_INSTANCES`: from the leaves up, a component whose
   * subtree would show more drops the children (and component props) that no longer fit, and its
   * statement gets a `limit` error. Runs before each commit, when something was materialized.
   */
  capInstances(): void {
    if (!this.capDue) return;
    this.capDue = false;
    const root = this.store.root;
    // Without a component shown in two places, a render shows at most what the store holds.
    if (!root || !this.store.shared) return;
    const size = new Map<string, number>();
    const open = new Set<string>();
    // Post-order without recursion (a chain of components can be deep).
    const stack: { id: string; seen: boolean }[] = [{ id: root, seen: false }];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const node = this.store.get(top.id);
      if (!node || size.has(top.id)) {
        stack.pop();
        continue;
      }
      if (!top.seen) {
        top.seen = true;
        open.add(top.id);
        for (const c of node.children) if (!size.has(c) && !open.has(c)) stack.push({ id: c, seen: false });
        for (const v of Object.values(node.props)) for (const r of refsOf(v)) if (!size.has(r) && !open.has(r)) stack.push({ id: r, seen: false });
        continue;
      }
      stack.pop();
      open.delete(top.id);
      // A reference back to a component still open is a cycle: it is cut at the end of the stream.
      const cost = (id: string) => (open.has(id) ? 0 : (size.get(id) ?? 1));
      let total = 1;
      let props: Record<string, unknown> | null = null;
      for (const [name, v] of Object.entries(node.props)) {
        const refs = refsOf(v);
        if (!refs.length) continue;
        const sum = refs.reduce((n, r) => n + cost(r), 0);
        // The first thing a component shows is kept whatever its size (it was capped itself), so a
        // large subtree never empties everything above it.
        if (total > 1 && total + sum > MAX_INSTANCES) {
          props ??= { ...node.props };
          delete props[name];
        } else total += sum;
      }
      let kept = node.children.length;
      for (let i = 0; i < node.children.length; i++) {
        const c = cost(node.children[i]!);
        if (total > 1 && total + c > MAX_INSTANCES) {
          kept = i;
          break;
        }
        total += c;
      }
      size.set(top.id, total);
      if (props || kept < node.children.length) {
        this.store.put({ ...node, props: props ?? node.props, children: node.children.slice(0, kept) });
        const rec = this.recs.get(node.stmt);
        const message = `"${node.stmt}" would show more than ${MAX_INSTANCES} components; the rest is left out`;
        if (rec && !rec.errors.some((e) => e.code === "limit" && e.message === message)) rec.errors.push({ code: "limit", severity: "error", stmtId: rec.id, line: rec.line, message });
      }
    }
  }

  /**
   * Children a component does not accept. Checked at the end, when every referenced statement has
   * arrived (the prompt asks for `root` first, so children are usually defined after their parent).
   */
  private checkChildren(): void {
    for (const rec of this.recs.values()) {
      if (rec.kind !== "node") continue;
      rec.errors = rec.errors.filter((e) => e.code !== "invalid-child" || !e.use);
      for (const id of rec.owned) {
        const node = this.store.get(id);
        const comp = node ? this.lib.get(node.type) : undefined;
        if (!node || !comp?.childOf) continue;
        for (const c of node.children) {
          const t = this.store.get(c)?.type;
          if (!t || t.startsWith("#") || comp.childOf.has(t)) continue;
          rec.errors.push({ code: "invalid-child", severity: "warning", stmtId: rec.id, line: rec.line, use: t, message: `${node.type} does not accept ${t} as a child`, hint: signature(comp) });
        }
      }
    }
  }

  /** All statement and program errors, in statement order. */
  errors(): GistUIError[] {
    const recs = [...this.recs.values()].sort((a, b) => a.order - b.order);
    const out: GistUIError[] = [];
    for (const r of recs) out.push(...r.parseErrors, ...r.errors);
    out.push(...this.programErrors);
    if (this.final) out.push(...this.finalErrors());
    return out;
  }

  private programErrors: GistUIError[] = [];
  private cycleErrors: GistUIError[] = [];

  private globalError(e: GistUIError): void {
    this.programErrors.push(e);
  }

  /** Statement ids in definition order (for the printer and edit merge). */
  statementIds(): string[] {
    return [...this.recs.values()].sort((a, b) => a.order - b.order).map((r) => r.id);
  }

  /** The effective AST of a statement, with patches and appends folded in. */
  statement(
    id: string,
  ): { kind: Kind; expr: Expr | null; table: TableData | null; overrides: ReadonlyMap<string, Expr>; appends: readonly Expr[]; dropped: ReadonlySet<string>; argOf: ReadonlyMap<string, number> } | undefined {
    const r = this.recs.get(id);
    return r && { kind: r.kind, expr: r.expr, table: r.table, overrides: r.overrides, appends: r.appends, dropped: r.dropped, argOf: r.argOf };
  }

  private version = 0;
  private changedIds = new Set<string>();

  /** Statement ids defined, changed or deleted since the last call (the runtime re-evaluates their readers). */
  takeChanged(): Set<string> {
    const ids = this.changedIds;
    this.changedIds = new Set();
    return ids;
  }

  private runtimeView: { version: number; state: Map<string, Expr>; data: Map<string, unknown>; exprs: Map<string, Expr> } | null = null;

  /**
   * Runtime view: state defaults, data values and runtime expressions by statement id. Maps, since
   * the ids come from the program (`constructor`, `__proto__`…); rebuilt only after a change.
   */
  get program(): { state: ReadonlyMap<string, Expr>; data: ReadonlyMap<string, unknown>; exprs: ReadonlyMap<string, Expr> } {
    if (this.runtimeView?.version === this.version) return this.runtimeView;
    const state = new Map<string, Expr>();
    const data = new Map<string, unknown>();
    const exprs = new Map<string, Expr>();
    for (const r of this.recs.values()) {
      if (r.kind === "state") {
        // A declaration still streaming has no value yet (`$name = "Hel`); a redefinition keeps the old one.
        const e = r.complete ? r.expr : r.backup?.kind === "state" ? r.backup.expr : null;
        if (e) state.set(r.id.slice(1), e);
      } else if (r.kind === "data") data.set(r.id, r.data);
      else if (r.kind === "dyn" && r.expr) exprs.set(r.id, r.expr);
    }
    this.runtimeView = { version: this.version, state, data, exprs };
    return this.runtimeView;
  }

  // ─── Definitions ──────────────────────────────────────────────────────────

  private define(
    id: string,
    kind: Kind,
    expr: Expr | null,
    table: TableData | null,
    line: number,
    complete: boolean,
    parseErrors: GistUIError[],
    openString?: StrExpr,
  ): void {
    const prev = this.recs.get(id);
    const rec: Rec = prev ?? {
      id,
      line,
      order: this.orderSeq++,
      kind,
      expr,
      table,
      overrides: new Map(),
      appends: [],
      complete,
      owned: new Set(),
      deps: new Map(),
      errors: [],
      parseErrors: [],
      dropped: new Set(),
      argOf: new Map(),
      weight: 1,
    };
    const prevKind = prev?.kind;
    const prevRows = prev?.table?.rows.length ?? 0;
    const sameTable = prev?.table && table && prev.table.columns.length === table.columns.length;
    if (prev) {
      // A redefinition starts streaming over a complete statement: keep that one in case this fails.
      if (prev.complete && !complete) prev.backup = { kind: prev.kind, expr: prev.expr, table: prev.table, overrides: prev.overrides, appends: prev.appends, line: prev.line, parseErrors: prev.parseErrors };
      else if (complete) delete prev.backup;
      // A new definition replaces the old one, including any patches applied to it.
      if (prev.complete || complete) {
        rec.overrides = new Map();
        rec.appends = [];
      }
      rec.kind = kind;
      rec.expr = expr;
      rec.table = table;
      rec.line = line;
    }
    rec.complete = complete;
    if (complete && this.lib.reserved.has(id)) {
      parseErrors = [
        ...parseErrors,
        {
          code: "reserved-id",
          severity: "warning",
          stmtId: id,
          line,
          message: `"${id}" is a flag name in this library; as a bare word it means the flag where the component has one`,
        },
      ];
    }
    rec.parseErrors = parseErrors;
    if (openString) rec.openString = openString;
    else delete rec.openString;
    this.recs.set(id, rec);
    // Defined again after `id = null`: what referred to it dropped the reference, and takes it back.
    const wasDeleted = this.deleted.delete(id);
    this.materialize(rec, !complete && prev !== undefined && !prev.complete);
    if (table && sameTable && table.rows.length > prevRows) {
      this.store.note({ op: "rows", id, append: table.rows.slice(prevRows) });
    }
    this.propagate([id], { defined: !prev, kindChanged: wasDeleted || (prevKind !== undefined && prevKind !== rec.kind), deleted: false });
  }

  private delete(id: string): void {
    const rec = this.recs.get(id);
    this.deleted.add(id);
    if (!rec) return;
    for (const n of rec.owned) this.store.remove(n);
    this.unlinkDeps(rec);
    this.recs.delete(id);
    this.version++;
    this.changedIds.add(id);
    if (id === "root") this.store.setRoot(null);
    this.propagate([id], { defined: false, kindChanged: false, deleted: true });
  }

  /**
   * Re-materializes the statements affected by a change to `changed`, each once, dependencies first.
   * Only data statements pass a change on: others are referenced by node id, which does not change.
   */
  private propagate(changed: string[], change: { defined: boolean; kindChanged: boolean; deleted: boolean }): void {
    const affected = new Set<string>();
    const direct = new Set(changed);
    const stack: [string, boolean][] = changed.map((id) => [id, true]);
    while (stack.length) {
      const [id, first] = stack.pop()!;
      const deps = this.rdeps.get(id);
      if (!deps) continue;
      const isData = this.recs.get(id)?.kind === "data";
      const structural = first && (change.defined || change.kindChanged || change.deleted);
      const childStructural = first && (change.kindChanged || change.deleted);
      for (const [dep, mode] of deps) {
        if (affected.has(dep) || direct.has(dep)) continue;
        const need = (mode & VALUE && (structural || isData)) || (mode & CHILD && (childStructural || isData));
        if (!need) continue;
        affected.add(dep);
        if (this.recs.get(dep)?.kind === "data") stack.push([dep, false]);
      }
    }
    if (!affected.size) return;
    // Topological order over the affected set (a cycle is broken arbitrarily; it is reported at the end).
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const rec = this.recs.get(id);
      if (rec) for (const d of rec.deps.keys()) if (affected.has(d)) visit(d);
      order.push(id);
    };
    for (const id of affected) visit(id);
    const kindChanged: string[] = [];
    for (const id of order) {
      const rec = this.recs.get(id);
      if (!rec) continue;
      const before = rec.kind;
      this.materialize(rec);
      if (rec.kind !== before) kindChanged.push(id);
    }
    if (kindChanged.length) this.propagate(kindChanged, { defined: false, kindChanged: true, deleted: false });
  }

  // ─── Materialization ─────────────────────────────────────────────────────

  /** `reuse`: this is the next parse of a streaming tail, so unchanged inline components may be reused. */
  private materialize(rec: Rec, reuse = false): void {
    const oldOwned = rec.owned;
    this.unlinkDeps(rec);
    rec.owned = new Set();
    rec.errors = [];
    rec.dropped = new Set();
    rec.argOf = new Map();
    this.version++;
    this.changedIds.add(rec.id);
    const ctx: Ctx = {
      rec,
      complete: rec.complete,
      sawDyn: false,
      cache: reuse ? (rec.tailCache ?? null) : null,
      nextCache: rec.complete ? null : new Map(),
      ownedLog: [],
      depLog: [],
      weight: 0,
    };
    try {
      this.build(rec, ctx, oldOwned);
    } catch (e) {
      if (!(e instanceof LimitReached)) throw e;
      // Too large: the statement is left out (what it built so far is removed with it).
      for (const n of rec.owned) this.store.remove(n);
      rec.owned = new Set();
      if (rec.kind === "data") rec.data = undefined;
      rec.errors.push({ code: "limit", severity: "error", stmtId: rec.id, line: rec.line, message: e.message });
    }
    this.finishMaterialize(rec, ctx, oldOwned);
  }

  private build(rec: Rec, ctx: Ctx, oldOwned: Set<string>): void {
    if (rec.kind === "data" && !rec.table && rec.expr) {
      rec.data = this.value(rec.expr, undefined, rec.id, ctx, undefined);
      rec.weight = Math.max(1, ctx.weight);
      if (ctx.sawDyn) {
        // It reads a runtime value after all: treat the whole statement as a runtime expression.
        for (const n of rec.owned) if (!oldOwned.has(n)) this.store.remove(n);
        rec.owned = new Set();
        this.unlinkDeps(rec);
        rec.kind = "dyn";
        delete rec.data;
      }
    }

    switch (rec.kind) {
      case "node":
        this.comp(rec.expr as CompExpr, rec.id, ctx, true);
        break;
      case "dyn":
        this.collect(rec.expr!, ctx, new Set());
        this.putNode(ctx, { id: rec.id, type: "#expr", props: {}, children: [], dyn: { value: rec.expr! } });
        break;
      case "data":
        if (rec.table) {
          rec.data = rec.table;
          rec.weight = Math.max(1, rec.table.rows.length * rec.table.columns.length);
        }
        break;
      case "state":
        this.collect(rec.expr!, ctx, new Set());
        break;
    }
  }

  private finishMaterialize(rec: Rec, ctx: Ctx, oldOwned: Set<string>): void {
    if (ctx.nextCache) rec.tailCache = ctx.nextCache;
    else delete rec.tailCache;
    if (rec.kind === "node" || rec.kind === "dyn") this.pending.delete(rec.id);
    else if (this.pending.has(rec.id)) {
      this.pending.delete(rec.id);
      this.store.remove(rec.id);
    }
    for (const n of oldOwned) if (!rec.owned.has(n)) this.store.remove(n);
    this.capDue = true;
    if (rec.id === "root") this.store.setRoot(rec.kind === "node" || rec.kind === "dyn" ? "root" : null);
    for (const [target, mode] of rec.deps) {
      let m = this.rdeps.get(target);
      if (!m) this.rdeps.set(target, (m = new Map()));
      m.set(rec.id, mode);
    }
  }

  private unlinkDeps(rec: Rec): void {
    for (const target of rec.deps.keys()) {
      const m = this.rdeps.get(target);
      if (!m) continue;
      m.delete(rec.id);
      if (!m.size) this.rdeps.delete(target);
    }
    rec.deps = new Map();
  }

  private dep(ctx: Ctx, target: string, mode: number): void {
    ctx.rec.deps.set(target, (ctx.rec.deps.get(target) ?? 0) | mode);
    if (ctx.nextCache) ctx.depLog.push([target, mode]);
  }

  private putNode(ctx: Ctx, n: Omit<GistUINode, "partial" | "stmt">): string {
    if (ctx.rec.owned.size >= MAX_OWNED) throw new LimitReached(`"${ctx.rec.id}" builds more than ${MAX_OWNED} components`);
    if (this.store.size >= MAX_NODES && !this.store.has(n.id)) throw new LimitReached(`The program has more than ${MAX_NODES} components`);
    ctx.rec.owned.add(n.id);
    if (ctx.nextCache) ctx.ownedLog.push(n.id);
    const node = n as { -readonly [K in keyof GistUINode]: GistUINode[K] };
    node.partial = !ctx.complete;
    node.stmt = ctx.rec.id;
    this.store.put(node);
    return n.id;
  }

  private err(ctx: Ctx, e: Omit<GistUIError, "stmtId" | "line">): void {
    if (!ctx.complete) return;
    ctx.rec.errors.push({ ...e, stmtId: ctx.rec.id, line: ctx.rec.line });
  }

  private comp(expr: CompExpr, id: string, ctx: Ctx, top: boolean): string {
    if (top || !ctx.nextCache || expr.partial) return this.buildComp(expr, id, ctx, top);
    const hit = ctx.cache?.get(id);
    if (hit && this.store.has(id) && sameAst(hit.expr, expr)) {
      for (const o of hit.owned) {
        ctx.rec.owned.add(o);
        ctx.ownedLog.push(o);
      }
      for (const [t, m] of hit.deps) this.dep(ctx, t, m);
      ctx.nextCache.set(id, hit);
      return id;
    }
    const o = ctx.ownedLog.length;
    const d = ctx.depLog.length;
    this.buildComp(expr, id, ctx, top);
    ctx.nextCache.set(id, { expr, owned: ctx.ownedLog.slice(o), deps: ctx.depLog.slice(d) });
    return id;
  }

  private buildComp(expr: CompExpr, id: string, ctx: Ctx, top: boolean): string {
    let comp = this.lib.get(expr.name);
    let type = expr.name;
    if (!comp) {
      const fix = this.lib.closest(expr.name);
      if (fix) {
        comp = this.lib.get(fix)!;
        type = fix;
        this.err(ctx, {
          code: "unknown-component",
          severity: "error",
          message: `Unknown component "${expr.name}"; using "${fix}"`,
          use: fix,
          fixed: true,
          hint: signature(comp),
        });
      } else {
        this.err(ctx, { code: "unknown-component", severity: "error", message: `Unknown component "${expr.name}"` });
      }
    }
    // A `children` patch replaces the children the call wrote; appends made after it are added last.
    const replaceKids = top && ctx.rec.overrides.has("children");
    const args: Arg[] = top && ctx.rec.appends.length && !replaceKids ? [...expr.args, ...ctx.rec.appends.map((value) => ({ value }))] : expr.args;
    const props: Record<string, unknown> = {};
    const dyn: Record<string, Expr> = {};
    const children: string[] = [];
    const waiting = new Set<string>();

    if (!comp) {
      props.component = expr.name;
      args.forEach((a, i) => {
        if (a.name) {
          const v = this.value(a.value, undefined, `${id}/${a.name}`, ctx, undefined);
          if (v === undefined || BLOCKED_KEYS.has(a.name)) return;
          if (isDynMarker(v)) dyn[a.name] = v.$dyn;
          else props[a.name] = v;
        } else if (!replaceKids) this.child(a.value, `${id}/${i}`, children, ctx, null);
      });
      return this.putNode(ctx, { id, type: "#unknown", props, children, ...(Object.keys(dyn).length ? { dyn } : {}) });
    }

    const setProp = (key: string, value: Expr, seg: string) => {
      const name = Object.hasOwn(comp.spec.props, key) ? key : comp.propLookup.get(key.toLowerCase());
      if (name && top && /^\d+$/.test(seg)) ctx.rec.argOf.set(name, Number(seg));
      if (!name) {
        if (key === "children" && comp.hasChildren) return this.child(value, `${id}/${seg}`, children, ctx, comp);
        // `style:{…}` works on every component (the design layer); renderers validate its values.
        if (key === "style") {
          if (isRuntime(value)) {
            this.collect(value, ctx, new Set());
            dyn.style = value;
            return;
          }
          const v = this.value(value, { type: "object" }, `${id}/style`, ctx, "style");
          if (isDynMarker(v)) dyn.style = v.$dyn;
          else if (v && typeof v === "object" && !Array.isArray(v)) {
            // A background image loads by itself, like an Image.
            const image = own(v, "image");
            if (typeof image === "string" && !this.loads(image)) {
              this.err(ctx, { code: "blocked-url", severity: "warning", message: `style.image: "${image.slice(0, 80)}" is not on an allowed host`, fixed: true });
              const { image: _dropped, ...rest } = v as Record<string, unknown>;
              props.style = rest;
            } else props.style = v;
          }
          return;
        }
        this.err(ctx, {
          code: "unknown-prop",
          severity: "warning",
          arg: seg,
          message: `${type} has no prop "${key}"`,
          hint: signature(comp),
        });
        return;
      }
      const spec = comp.spec.props[name]!;
      if (value === ctx.rec.openString && spec.type === "string") this.openText = { nodeId: id, prop: name };
      if (isRuntime(value)) {
        this.collect(value, ctx, new Set());
        dyn[name] = value;
        delete props[name];
        return;
      }
      const v = this.value(value, spec, `${id}/${seg}`, ctx, name);
      delete dyn[name];
      if (v === undefined) {
        delete props[name];
        if (value.k === "ref" && !this.final && !this.recs.has(value.name) && !this.deleted.has(value.name)) waiting.add(name);
        return;
      }
      if (isDynMarker(v)) {
        dyn[name] = v.$dyn;
        delete props[name];
        return;
      }
      const before = ctx.rec.errors.length;
      const c = this.coerce(v, spec, name, type, ctx);
      for (let k = before; k < ctx.rec.errors.length; k++) ctx.rec.errors[k] = { ...ctx.rec.errors[k]!, prop: name, arg: seg };
      if (c === undefined) delete props[name];
      else props[name] = c;
    };

    let pi = 0;
    // A prop given by name anywhere in the call (`key:value`, a flag, a bare enum word) keeps its
    // slot, so positional values fill the remaining slots in order: `Callout(variant:info, "Title",
    // "Text")` and `Callout("Title", "Text", info)` both work. Slots filled another way (a table
    // mapping) are skipped too.
    const given = new Set<string>();
    for (const a of args) {
      const name = a.name ? comp.propLookup.get(a.name.toLowerCase()) : a.value.k === "flag" ? a.value.name : a.value.k === "ref" && !this.recs.has(a.value.name) && !this.deleted.has(a.value.name) ? comp.enumWords.get(a.value.name) : undefined;
      if (name) given.add(name);
    }
    const advance = () => {
      while (pi < comp.positional.length && (comp.positional[pi]! in props || given.has(comp.positional[pi]!))) pi++;
    };
    let opt: string[] | undefined;
    const optionalSlots = () => Object.keys(comp.spec.props).filter((p) => !comp.positional.includes(p) && !given.has(p) && !(p in props) && p !== "style");
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a.name) {
        const named = comp.propLookup.get(a.name.toLowerCase());
        if (named && top && i < expr.args.length) ctx.rec.argOf.set(named, i);
        setProp(a.name, a.value, a.name);
        continue;
      }
      if (a.value.k === "flag") {
        props[a.value.name] = true;
        if (top && i < expr.args.length) ctx.rec.argOf.set(a.value.name, i);
        continue;
      }
      if (a.value.k === "ref") {
        const target = this.recs.get(a.value.name);
        // A pipe table for a component that maps tables onto its props and children.
        if (comp.spec.table && target?.kind === "data" && isTableData(target.data)) {
          this.dep(ctx, a.value.name, VALUE);
          this.expandTable(comp.spec.table, target.data, id, props, children, ctx);
          advance();
          continue;
        }
        // A bare enum value (`Tag("Live", success)`), unless a statement has that name.
        const enumProp = target || this.deleted.has(a.value.name) ? undefined : comp.enumWords.get(a.value.name);
        if (enumProp && !(enumProp in props)) {
          this.dep(ctx, a.value.name, CHILD | VALUE);
          props[enumProp] = a.value.name;
          if (top && i < expr.args.length) ctx.rec.argOf.set(enumProp, i);
          advance();
          continue;
        }
      }
      advance();
      // A bare word in an enum's positional slot (`Icon(plane)`) is that value when no statement has
      // the name (an open enum accepts any word).
      const slot = pi < comp.positional.length ? comp.spec.props[comp.positional[pi]!] : undefined;
      if (slot?.type === "enum" && a.value.k === "ref" && !this.recs.has(a.value.name) && !this.deleted.has(a.value.name) && (slot.open || slot.values.includes(a.value.name))) {
        this.dep(ctx, a.value.name, CHILD | VALUE);
        props[comp.positional[pi]!] = a.value.name;
        if (top && i < expr.args.length) ctx.rec.argOf.set(comp.positional[pi]!, i);
        pi++;
        advance();
        continue;
      }
      if (pi < comp.positional.length) {
        // `null` (or an empty slot) leaves an optional positional out.
        if (a.value.k !== "null" || comp.spec.props[comp.positional[pi]!]!.required) setProp(comp.positional[pi]!, a.value, String(i));
        pi++;
        advance();
      } else if (comp.hasChildren) {
        if (!replaceKids) this.child(a.value, `${id}/${i}`, children, ctx, comp);
      } else if ((opt ??= optionalSlots()).length) {
        // OpenUI's convention: further positional values fill the optional props in signature order
        // (`null` skips one), so `ListItem("Title", "Detail", "Meta", "icon")` works.
        const name = opt.shift()!;
        if (a.value.k !== "null") setProp(name, a.value, String(i));
        this.err(ctx, { code: "positional-optional", severity: "warning", message: `${type}: optional "${name}" passed by position; write ${name}:value` });
      } else {
        this.err(ctx, {
          code: "excess-args",
          severity: "error",
          arg: String(i),
          message: `${type} takes ${comp.positional.length} positional argument(s); extra ones are ignored`,
          fixed: true,
          hint: signature(comp),
        });
      }
    }
    if (top) for (const [key, value] of ctx.rec.overrides) setProp(key, value, `@${key}`);
    if (replaceKids && comp.hasChildren) ctx.rec.appends.forEach((value, i) => this.child(value, `${id}/+${i}`, children, ctx, comp));

    if (ctx.complete) {
      for (const [name, spec] of Object.entries(comp.spec.props)) {
        if (spec.required && !(name in props) && !(name in dyn) && !waiting.has(name)) {
          this.err(ctx, {
            code: "missing-required",
            severity: "error",
            prop: name,
            message: `${type} is missing required "${name}"`,
            hint: signature(comp),
          });
        }
      }
    }
    const node: Omit<GistUINode, "partial" | "stmt"> = Object.keys(dyn).length
      ? { id, type, props, children, dyn }
      : { id, type, props, children };
    return this.putNode(ctx, node);
  }

  /** Applies a component's table mapping: labels/values props and one child per column. */
  private expandTable(m: TableMapping, t: TableData, id: string, props: Record<string, unknown>, children: string[], ctx: Ctx): void {
    const num = (c: Cell): number | null => (typeof c === "number" ? c : c == null ? null : toNumber(String(c)));
    let first = 0;
    if (m.labels) {
      props[m.labels] = t.text.map((r) => r[0] ?? "");
      first = 1;
    }
    if (m.values) props[m.values] = t.rows.map((r) => num(r[first] ?? null));
    if (!m.columns) return;
    const c = m.columns;
    for (let j = first; j < t.columns.length; j++) {
      const col = t.columns[j]!;
      const cells = c.numeric ? t.rows.map((r) => num(r[j] ?? null)) : t.text.map((r) => r[j] ?? "");
      const p: Record<string, unknown> = { [c.label]: col.name, [c.values]: cells };
      if (c.type && col.hinted) p[c.type] = col.type;
      children.push(this.putNode(ctx, { id: `${id}/col${j}`, type: c.component, props: p, children: [] }));
    }
  }

  /** Adds children for one child argument. Strings become Markdown text nodes; arrays spread. */
  private child(e: Expr, id: string, out: string[], ctx: Ctx, parent: CompiledComponent | null): void {
    switch (e.k) {
      case "str": {
        const prop = this.lib.textProp;
        if (e === ctx.rec.openString) this.openText = { nodeId: id, prop };
        out.push(this.putNode(ctx, { id, type: this.lib.textComponent, props: { [prop]: e.v }, children: [] }));
        return;
      }
      case "num":
      case "bool":
        out.push(this.putNode(ctx, { id, type: this.lib.textComponent, props: { [this.lib.textProp]: String(e.v) }, children: [] }));
        return;
      case "null":
        return;
      case "comp":
        out.push(this.comp(e, id, ctx, false));
        return;
      case "arr":
        e.items.forEach((item, j) => this.child(item, `${id}.${j}`, out, ctx, parent));
        return;
      case "ref": {
        const target = this.recs.get(e.name);
        if (!target) {
          this.dep(ctx, e.name, CHILD);
          if (this.deleted.has(e.name)) {
            ctx.rec.dropped.add(e.name);
            return;
          }
          if (this.final) {
            this.unresolved(ctx, e.name);
            return;
          }
          this.placeholder(e.name, parent);
          out.push(e.name);
          return;
        }
        if (target.kind === "node" || target.kind === "dyn") {
          this.dep(ctx, e.name, CHILD);
          out.push(e.name);
          return;
        }
        this.dep(ctx, e.name, VALUE);
        this.spread(target.data, id, out, ctx);
        return;
      }
      case "enum":
      case "flag":
        out.push(
          this.putNode(ctx, {
            id,
            type: this.lib.textComponent,
            props: { [this.lib.textProp]: e.k === "enum" ? e.v : e.name },
            children: [],
          }),
        );
        return;
      case "obj":
        this.err(ctx, { code: "invalid-child", severity: "warning", message: "An object cannot be a child; pass it to a component as a prop" });
        return;
      default:
        this.collect(e, ctx, new Set());
        out.push(this.putNode(ctx, { id, type: "#expr", props: {}, children: [], dyn: { value: e } }));
    }
  }

  /** Spreads a data value in children position: node refs and strings become children. */
  private spread(v: unknown, id: string, out: string[], ctx: Ctx): void {
    if (isNodeRef(v)) {
      out.push(v.$ref);
      return;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push(this.putNode(ctx, { id, type: this.lib.textComponent, props: { [this.lib.textProp]: String(v) }, children: [] }));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, j) => this.spread(x, `${id}.${j}`, out, ctx));
      return;
    }
    if (v == null) return;
    this.err(ctx, {
      code: "invalid-child",
      severity: "warning",
      message: "A data value cannot be a child; pass it to a component such as Table(…) or Chart(…)",
    });
  }

  private placeholder(id: string, parent: CompiledComponent | null): void {
    if (this.store.has(id)) return;
    const expected = parent?.childOf && parent.childOf.size === 1 ? [...parent.childOf][0] : undefined;
    this.pending.add(id);
    this.store.put({
      id,
      type: "#pending",
      props: {},
      children: [],
      partial: true,
      stmt: id,
      ...(expected ? { expected } : {}),
    });
  }

  private unresolved(ctx: Ctx, name: string): void {
    ctx.rec.dropped.add(name);
    this.err(ctx, {
      code: "unresolved-ref",
      severity: "error",
      ref: name,
      message: `"${name}" is referenced but never defined`,
      fixed: true,
    });
  }

  /**
   * Resolves a static expression to a prop value. Components become node refs, refs to data are
   * inlined, refs to components become node refs. Returns undefined for a value that is not there
   * (yet), or a `$dyn` marker for a runtime value.
   */
  private value(e: Expr, spec: PropSpec | undefined, path: string, ctx: Ctx, prop: string | undefined): unknown {
    switch (e.k) {
      case "str":
      case "num":
      case "bool":
      case "enum":
        ctx.weight++;
        return e.v;
      case "null":
        return null;
      case "flag":
        return true;
      case "comp":
        return { $ref: this.comp(e, path, ctx, false) } satisfies NodeRef;
      case "arr": {
        const itemSpec = spec?.type === "array" && spec.items ? (spec.items as PropSpec) : spec?.type === "nodes" ? { type: "node" as const } : undefined;
        const out: unknown[] = [];
        let dyn = false;
        e.items.forEach((item, j) => {
          const v = this.value(item, itemSpec, `${path}.${j}`, ctx, undefined);
          if (isDynMarker(v)) dyn = true;
          else if (v !== undefined) out.push(v);
        });
        return dyn ? dynMarker(e) : out;
      }
      case "obj": {
        const out: Record<string, unknown> = {};
        let dyn = false;
        for (const [k, item] of e.entries) {
          const v = this.value(item, undefined, `${path}.${k}`, ctx, undefined);
          if (isDynMarker(v)) dyn = true;
          else if (v !== undefined && !BLOCKED_KEYS.has(k)) out[k] = v;
        }
        return dyn ? dynMarker(e) : out;
      }
      case "ref": {
        const target = this.recs.get(e.name);
        const nodeProp = spec?.type === "node" || spec?.type === "nodes";
        if (!target) {
          if (this.deleted.has(e.name)) {
            this.dep(ctx, e.name, VALUE);
            ctx.rec.dropped.add(e.name);
            return undefined;
          }
          if (this.final && spec?.type !== "string") {
            this.dep(ctx, e.name, VALUE);
            this.unresolved(ctx, e.name);
            return undefined;
          }
          if (nodeProp) {
            this.dep(ctx, e.name, CHILD | VALUE);
            this.placeholder(e.name, null);
            return { $ref: e.name } satisfies NodeRef;
          }
          // A bare word in a text slot that no statement defines is that word as text
          // (`SectionItem(billing, "Billing")`); if a statement with the name arrives, it wins.
          // While streaming it stays pending: the statement may still arrive.
          if (spec?.type === "string" && this.final) {
            this.dep(ctx, e.name, VALUE);
            this.err(ctx, { code: "bare-text", severity: "warning", message: `"${e.name}" is not defined; used as the text "${e.name}"` });
            return e.name;
          }
          this.dep(ctx, e.name, VALUE);
          return undefined;
        }
        if (target.kind === "node") {
          this.dep(ctx, e.name, CHILD | (nodeProp ? 0 : VALUE));
          return { $ref: e.name } satisfies NodeRef;
        }
        if (target.kind === "data") {
          // A data value that contains itself (directly or through others) has no finite value.
          if (target === ctx.rec || (ctx.rec.kind === "data" && this.dataReaches(target, ctx.rec.id))) {
            if (target !== ctx.rec) this.dep(ctx, e.name, VALUE);
            ctx.rec.dropped.add(e.name);
            this.err(ctx, { code: "cycle", severity: "error", ref: e.name, message: `"${ctx.rec.id}" contains itself through "${e.name}"`, fixed: true });
            return undefined;
          }
          this.dep(ctx, e.name, VALUE);
          ctx.weight += target.weight;
          if (ctx.weight > MAX_DATA_WEIGHT) throw new LimitReached(`"${ctx.rec.id}" holds more than ${MAX_DATA_WEIGHT} values`);
          return target.data;
        }
        this.dep(ctx, e.name, EXPR | VALUE);
        ctx.sawDyn = true;
        return dynMarker(e);
      }
      default:
        this.collect(e, ctx, new Set());
        ctx.sawDyn = true;
        void prop;
        return dynMarker(e);
    }
  }

  /** True when data statement `from` reads `id`, directly or through other data statements. */
  private dataReaches(from: Rec, id: string): boolean {
    if (!from.deps.size) return false;
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const r = stack.pop()!;
      for (const d of r.deps.keys()) {
        if (d === id) return true;
        if (seen.has(d)) continue;
        seen.add(d);
        const next = this.recs.get(d);
        if (next?.kind === "data" && next.deps.size) stack.push(next);
      }
    }
    return false;
  }

  /** Records the statements and state a runtime expression reads. */
  private collect(e: Expr, ctx: Ctx, bound: Set<string>): void {
    switch (e.k) {
      case "ref":
        if (!bound.has(e.name)) this.dep(ctx, e.name, EXPR);
        return;
      case "state":
        this.dep(ctx, `$${e.name}`, EXPR);
        return;
      case "comp":
      case "builtin":
        for (const a of e.args) this.collect(a.value, ctx, bound);
        return;
      case "arr":
        for (const i of e.items) this.collect(i, ctx, bound);
        return;
      case "obj":
        for (const [, v] of e.entries) this.collect(v, ctx, bound);
        return;
      case "bin":
        this.collect(e.l, ctx, bound);
        this.collect(e.r, ctx, bound);
        return;
      case "un":
        this.collect(e.e, ctx, bound);
        return;
      case "cond":
        this.collect(e.c, ctx, bound);
        this.collect(e.t, ctx, bound);
        this.collect(e.f, ctx, bound);
        return;
      case "member":
        this.collect(e.o, ctx, bound);
        return;
      case "index":
        this.collect(e.o, ctx, bound);
        this.collect(e.i, ctx, bound);
        return;
      case "lambda": {
        const inner = new Set(bound);
        for (const p of e.params) inner.add(p);
        this.collect(e.body, ctx, inner);
        return;
      }
    }
  }

  /** Deterministic coercions; an invalid value falls back to the prop's default (or is dropped). */
  private coerce(v: unknown, spec: PropSpec, name: string, type: string, ctx: Ctx): unknown {
    const r = coerceValue(v, spec, `${type}.${name}`, this.loads);
    if (r.issue) {
      if (r.issue.code === "blocked-url") this.err(ctx, { ...r.issue, fixed: true });
      // A close value was used instead (`sucess` → `success`): repaired.
      else if (r.issue.use) this.err(ctx, { ...r.issue, fixed: true, hint: spec.type === "enum" ? `${name}:${spec.values.join("|")}` : signature(this.lib.get(type)!) });
      else {
        // Falling back to the default (or dropping an optional prop) is a deterministic repair.
        const fixed = spec.default !== undefined || !spec.required;
        this.err(ctx, { ...r.issue, hint: signature(this.lib.get(type)!), ...(fixed ? { fixed } : {}) });
      }
    }
    return r.value;
  }

  // ─── End-of-stream checks ─────────────────────────────────────────────────

  /**
   * Cuts and reports cycles reachable from the root, through children and through component-valued
   * props. Iterative, so a very deep (hostile) program cannot overflow the stack.
   */
  private checkCycles(): void {
    this.cycleErrors = [];
    const root = this.store.root;
    if (!root) return;
    const state = new Map<string, 1 | 2>();
    interface Frame {
      id: string;
      next: string[];
      at: number;
      cut: Set<string> | null;
    }
    const open = (id: string): Frame => {
      state.set(id, 1);
      const node = this.store.get(id);
      const next = node ? [...node.children] : [];
      if (node) for (const v of Object.values(node.props)) refsIn(v, next, new Set());
      return { id, next, at: 0, cut: null };
    };
    const stack = [open(root)];
    while (stack.length) {
      const f = stack[stack.length - 1]!;
      if (f.at < f.next.length) {
        const c = f.next[f.at++]!;
        const st = state.get(c);
        if (st === undefined) stack.push(open(c));
        else if (st === 1) {
          const node = this.store.get(f.id)!;
          this.cycleErrors.push({ code: "cycle", severity: "error", stmtId: node.stmt, line: this.recs.get(node.stmt)?.line, ref: c, message: `"${node.stmt}" contains itself through "${c}"`, fixed: true } as GistUIError);
          (f.cut ??= new Set()).add(c);
        }
        continue;
      }
      if (f.cut) {
        const node = this.store.get(f.id)!;
        const cut = f.cut;
        const props: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node.props)) {
          const kept = withoutRefs(v, cut);
          if (kept !== undefined) props[k] = kept;
        }
        this.store.put({ ...node, children: node.children.filter((c) => !cut.has(c)), props });
      }
      state.set(f.id, 2);
      stack.pop();
    }
  }

  private finalErrors(): GistUIError[] {
    const out: GistUIError[] = [...this.cycleErrors];
    if (!this.store.root) {
      out.push({ code: "no-root", severity: "error", message: "The program has no `root = …` statement" });
      return out;
    }
    if (!this.recs.has("root")) {
      // The first component stands in as the root: nothing is lost, so this is a warning.
      out.push({
        code: "no-root",
        severity: "warning",
        fixed: true,
        message: `The program has no \`root = …\` statement; "${this.store.root}" is used as the root`,
      });
    }
    const reach = new Set<string>();
    const stack = [this.recs.has("root") ? "root" : this.store.root];
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      const r = this.recs.get(id);
      if (r) for (const d of r.deps.keys()) stack.push(d);
    }
    for (const r of this.recs.values()) {
      if (!reach.has(r.id)) {
        out.push({
          code: "unreachable",
          severity: "warning",
          stmtId: r.id,
          line: r.line,
          message: `"${r.id}" is defined but not used`,
        });
      }
    }
    return out;
  }
}

function classify(e: Expr): Kind {
  if (e.k === "comp") return "node";
  return isStatic(e) ? "data" : "dyn";
}

function isStatic(e: Expr): boolean {
  switch (e.k) {
    case "str":
    case "num":
    case "bool":
    case "null":
    case "enum":
    case "comp":
    case "ref":
      return true;
    case "arr":
      return e.items.every(isStatic);
    case "obj":
      return e.entries.every(([, v]) => isStatic(v));
    default:
      return false;
  }
}

/** Expressions that always need the runtime, whatever they reference. */
function isRuntime(e: Expr): boolean {
  switch (e.k) {
    case "state":
    case "builtin":
    case "bin":
    case "un":
    case "cond":
    case "member":
    case "index":
    case "lambda":
      return true;
    default:
      return false;
  }
}

interface DynMarker {
  $dyn: Expr;
}
const dynMarker = (e: Expr): DynMarker => ({ $dyn: e });
const isDynMarker = (v: unknown): v is DynMarker => typeof v === "object" && v !== null && "$dyn" in v;

/** Collects the node ids a prop value references. Shared arrays (inlined data) are walked once. */
function refsIn(v: unknown, out: string[], seen: Set<object>): void {
  if (isNodeRef(v)) {
    out.push(v.$ref);
    return;
  }
  if (!Array.isArray(v) || seen.has(v)) return;
  seen.add(v);
  for (const x of v) refsIn(x, out, seen);
}

/** A prop value without references to `ids` (undefined when the value itself was one). */
/** The components a prop value shows: one reference, or a list of them. */
function refsOf(v: unknown): string[] {
  if (isNodeRef(v)) return [v.$ref];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (isNodeRef(x)) out.push(x.$ref);
  return out;
}

function withoutRefs(v: unknown, ids: ReadonlySet<string>): unknown {
  if (isNodeRef(v)) return ids.has(v.$ref) ? undefined : v;
  if (!Array.isArray(v) || !v.some((x) => typeof x === "object" && x !== null)) return v;
  const out = v.map((x) => withoutRefs(x, ids)).filter((x) => x !== undefined);
  return out.length === v.length && out.every((x, i) => x === v[i]) ? v : out;
}
