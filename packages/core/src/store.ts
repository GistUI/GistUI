/**
 * Per-node immutable store. Every node is keyed by a stable id: a statement id (`kpis`) or a path
 * under one for inline nodes (`mau/1`). Unchanged nodes keep their object identity, so a renderer
 * that subscribes per id only re-renders what changed.
 */

import type { Expr, TableData } from "./ast";

/** A prop value that points at another node. */
export interface NodeRef {
  $ref: string;
}

export const isNodeRef = (v: unknown): v is NodeRef =>
  typeof v === "object" && v !== null && "$ref" in v && typeof (v as NodeRef).$ref === "string";

/**
 * Special node types:
 *   `#pending` – a referenced statement that has not arrived yet (a skeleton slot)
 *   `#expr`    – a value computed at runtime (`dyn.value`): a ternary, `@each`, a query…
 *   `#unknown` – a component the library does not have; renders its children and text
 */
export interface GistUINode {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly string[];
  /** Props whose value is an expression evaluated by the runtime (state, builtins, operators). */
  readonly dyn?: Readonly<Record<string, Expr>>;
  /** True while this node's statement is still streaming. */
  readonly partial: boolean;
  /** Statement that owns this node. */
  readonly stmt: string;
  /** For `#pending`: the component type expected in this slot, when it can be inferred. */
  readonly expected?: string;
}

export type Patch =
  | { op: "create"; id: string; node: GistUINode }
  /** `dyn` is present when the node's runtime expressions changed (null = it has none now). */
  | { op: "props"; id: string; diff: Record<string, unknown>; partial?: boolean; dyn?: GistUINode["dyn"] | null }
  | { op: "children"; id: string; ids: readonly string[] }
  | { op: "text"; id: string; prop: string; append: string }
  | { op: "rows"; id: string; append: TableData["rows"] }
  | { op: "remove"; id: string }
  | { op: "root"; id: string | null };

export interface SnapshotNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: SnapshotNode[];
  dyn?: Readonly<Record<string, Expr>>;
  partial: boolean;
}

type Listener = () => void;

export class NodeStore {
  private nodes = new Map<string, GistUINode>();
  private subs = new Map<string, Set<Listener>>();
  private rootSubs = new Set<Listener>();
  private patchSubs = new Set<(patches: readonly Patch[]) => void>();
  private queue: Patch[] = [];
  private touched = new Set<string>();
  private rootChanged = false;
  private snapCache = new Map<string, { node: GistUINode; snap: SnapshotNode; kids: SnapshotNode[] }>();
  private _root: string | null = null;
  /** How many places show each component (its parent's children, or a component prop). */
  private uses = new Map<string, number>();
  private sharedIds = 0;

  /**
   * True while some component is shown in more than one place. Only then can a render show more
   * components than the store holds (see `Program.capInstances`).
   */
  get shared(): boolean {
    return this.sharedIds > 0;
  }

  private use(id: string, d: number): void {
    const n = this.uses.get(id) ?? 0;
    const m = n + d;
    if (n < 2 && m >= 2) this.sharedIds++;
    else if (n >= 2 && m < 2) this.sharedIds--;
    if (m > 0) this.uses.set(id, m);
    else this.uses.delete(id);
  }

  private link(children: readonly string[] | null, props: Readonly<Record<string, unknown>> | null, d: number): void {
    if (children) for (const c of children) this.use(c, d);
    if (!props) return;
    for (const k in props) {
      const v = props[k];
      if (isNodeRef(v)) this.use(v.$ref, d);
      else if (Array.isArray(v)) for (const x of v) if (isNodeRef(x)) this.use(x.$ref, d);
    }
  }

  get root(): string | null {
    return this._root;
  }

  get(id: string): GistUINode | undefined {
    return this.nodes.get(id);
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  ids(): IterableIterator<string> {
    return this.nodes.keys();
  }

  get size(): number {
    return this.nodes.size;
  }

  /** Subscribes to one node. The listener runs once per commit in which that node changed. */
  subscribe(id: string, fn: Listener): () => void {
    let set = this.subs.get(id);
    if (!set) this.subs.set(id, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) this.subs.delete(id);
    };
  }

  subscribeRoot(fn: Listener): () => void {
    this.rootSubs.add(fn);
    return () => this.rootSubs.delete(fn);
  }

  /** Receives every committed batch of patches, in order. */
  onPatches(fn: (patches: readonly Patch[]) => void): () => void {
    this.patchSubs.add(fn);
    return () => this.patchSubs.delete(fn);
  }

  /** Inserts or updates a node. Returns the stored node (the previous object if nothing changed). */
  put(next: GistUINode): GistUINode {
    const prev = this.nodes.get(next.id);
    if (!prev || prev.type !== next.type || prev.stmt !== next.stmt || prev.expected !== next.expected) {
      if (prev) {
        this.queue.push({ op: "remove", id: next.id });
        this.link(prev.children, prev.props, -1);
      }
      this.link(next.children, next.props, 1);
      this.nodes.set(next.id, next);
      this.queue.push({ op: "create", id: next.id, node: next });
      this.touched.add(next.id);
      return next;
    }
    let diff: Record<string, unknown> | null = null;
    const props: Record<string, unknown> = {};
    for (const k in next.props) {
      const a = prev.props[k];
      const b = next.props[k];
      if (a === b || deepEqual(a, b)) props[k] = a;
      else {
        props[k] = b;
        (diff ??= {})[k] = b;
      }
    }
    for (const k in prev.props) {
      if (!(k in next.props)) (diff ??= {})[k] = undefined;
    }
    const childrenSame = sameIds(prev.children, next.children);
    const dynSame = sameDyn(prev.dyn, next.dyn);
    const partialSame = prev.partial === next.partial;
    if (!diff && childrenSame && dynSame && partialSame) return prev;
    const dyn = dynSame ? prev.dyn : next.dyn;
    const node: GistUINode = {
      id: next.id,
      type: next.type,
      props: diff ? props : prev.props,
      children: childrenSame ? prev.children : next.children,
      partial: next.partial,
      stmt: next.stmt,
      ...(next.expected !== undefined ? { expected: next.expected } : {}),
      ...(dyn ? { dyn } : {}),
    };
    if (!childrenSame || diff) {
      this.link(childrenSame ? null : prev.children, diff ? prev.props : null, -1);
      this.link(childrenSame ? null : node.children, diff ? node.props : null, 1);
    }
    this.nodes.set(node.id, node);
    if (diff || !dynSame || !partialSame) {
      const p: Extract<Patch, { op: "props" }> = { op: "props", id: node.id, diff: diff ?? {} };
      if (!partialSame) p.partial = node.partial;
      if (!dynSame) p.dyn = node.dyn ?? null;
      this.queue.push(p);
    }
    if (!childrenSame) this.queue.push({ op: "children", id: node.id, ids: node.children });
    this.touched.add(node.id);
    return node;
  }

  /** Appends streamed text to a string prop without re-materializing the node. */
  appendText(id: string, prop: string, append: string): void {
    const prev = this.nodes.get(id);
    if (!prev || !append) return;
    const cur = prev.props[prop];
    const node: GistUINode = { ...prev, props: { ...prev.props, [prop]: (typeof cur === "string" ? cur : "") + append } };
    this.nodes.set(id, node);
    this.queue.push({ op: "text", id, prop, append });
    this.touched.add(id);
  }

  remove(id: string): void {
    const prev = this.nodes.get(id);
    if (!prev) return;
    this.nodes.delete(id);
    this.link(prev.children, prev.props, -1);
    this.queue.push({ op: "remove", id });
    this.touched.add(id);
  }

  setRoot(id: string | null): void {
    if (this._root === id) return;
    this._root = id;
    this.rootChanged = true;
    this.queue.push({ op: "root", id });
  }

  /** Queues a patch that carries no node change (e.g. `rows` for a streaming table). */
  note(p: Patch): void {
    this.queue.push(p);
  }

  /** Delivers queued patches and notifies subscribers. Returns the committed patches. */
  commit(): Patch[] {
    if (!this.queue.length) return [];
    const patches = this.queue;
    const touched = this.touched;
    const rootChanged = this.rootChanged;
    this.queue = [];
    this.touched = new Set();
    this.rootChanged = false;
    for (const fn of this.patchSubs) fn(patches);
    for (const id of touched) {
      const set = this.subs.get(id);
      if (set) for (const fn of [...set]) fn();
    }
    if (rootChanged) for (const fn of [...this.rootSubs]) fn();
    return patches;
  }

  /**
   * The tree from the root, with NodeRef props replaced by their snapshots. Unchanged subtrees keep
   * their identity between calls. A node already on the current path (a cycle) is cut off.
   */
  snapshot(): SnapshotNode | null {
    if (!this._root) return null;
    const live = new Map<string, SnapshotNode | null>();
    const snap = this.snap(this._root, new Set(), live);
    for (const id of this.snapCache.keys()) if (!live.has(id)) this.snapCache.delete(id);
    return snap;
  }

  /** `live` memoizes each node once per pass, so a shared subtree (a DAG) is walked once. */
  private snap(id: string, path: Set<string>, live: Map<string, SnapshotNode | null>): SnapshotNode | null {
    const node = this.nodes.get(id);
    // A node already on the path is a cycle; a path this long is a hostile chain, cut off here.
    if (!node || path.has(id) || path.size >= MAX_TREE_DEPTH) return null;
    const done = live.get(id);
    if (done !== undefined) return done;
    path.add(id);
    const kids: SnapshotNode[] = [];
    for (const c of node.children) {
      const s = this.snap(c, path, live);
      if (s) kids.push(s);
    }
    const refSnaps: SnapshotNode[] = [];
    const props: Record<string, unknown> = {};
    // One memo per node: an array shared inside its props (inlined data) is resolved once.
    const arrays = new Map<object, unknown>();
    for (const [k, v] of Object.entries(node.props)) props[k] = this.resolveRefs(v, path, live, refSnaps, arrays);
    path.delete(id);
    const all = [...kids, ...refSnaps];
    const cached = this.snapCache.get(id);
    if (cached && cached.node === node && sameList(cached.kids, all)) {
      live.set(id, cached.snap);
      return cached.snap;
    }
    const snap: SnapshotNode = { id, type: node.type, props, children: kids, partial: node.partial };
    snapshots.add(snap);
    if (node.dyn) snap.dyn = node.dyn;
    this.snapCache.set(id, { node, snap, kids: all });
    live.set(id, snap);
    return snap;
  }

  private resolveRefs(v: unknown, path: Set<string>, live: Map<string, SnapshotNode | null>, out: SnapshotNode[], arrays: Map<object, unknown>): unknown {
    if (isNodeRef(v)) {
      const s = this.snap(v.$ref, path, live);
      if (s) out.push(s);
      return s;
    }
    if (Array.isArray(v)) {
      if (!v.some((x) => typeof x === "object" && x !== null)) return v;
      const done = arrays.get(v);
      if (done !== undefined) return done;
      const next = v.map((x) => this.resolveRefs(x, path, live, out, arrays));
      arrays.set(v, next);
      return next;
    }
    return v;
  }
}

/** Deepest tree `snapshot()` follows (renderers stop far earlier). */
const MAX_TREE_DEPTH = 400;
const snapshots = new WeakSet<object>();
/** True for a node made by `snapshot()` (a data object that merely has `type` and `children` is not one). */
export const isSnapshotNode = (v: unknown): v is SnapshotNode => typeof v === "object" && v !== null && snapshots.has(v);

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameDyn(a: GistUINode["dyn"], b: GistUINode["dyn"]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

/** Structural equality for plain JSON-like values (props, AST fragments). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return sameObjects(a, b, { n: 0, same: null });
}

interface EqualState {
  n: number;
  /** Pairs already found equal; used once a comparison gets large (values that share parts). */
  same: Map<object, Set<object>> | null;
}

function sameValues(a: unknown, b: unknown, st: EqualState): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return sameObjects(a, b, st);
}

function sameObjects(a: object, b: object, st: EqualState): boolean {
  // Past a few thousand comparisons the values are big or share sub-values (inlined data): remember
  // equal pairs, so a shared part is compared once and not once per path to it.
  const memo = ++st.n > 2000 ? (st.same ??= new Map()) : null;
  if (memo?.get(a)?.has(b)) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValues(a[i], b[i], st)) return false;
  } else {
    if (Array.isArray(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) {
      if (!sameValues((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], st)) return false;
    }
  }
  if (memo) {
    let set = memo.get(a);
    if (!set) memo.set(a, (set = new Set()));
    set.add(b);
  }
  return true;
}
