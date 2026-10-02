import type { Expr, GistUINode, Library, NodeRef, Runtime } from "@gistui/core";
import type { GistUIAction } from "@gistui/headless/actions";

/** What a component renderer gets, on creation and on every update. */
export interface DomContext {
  readonly node: GistUINode;
  readonly type: string;
  /** Resolved props. Component-valued props are `NodeRef`s: render them with `renderNode`. */
  readonly props: Readonly<Record<string, unknown>>;
  /** The live elements of the node's children, in order (a fragment contributes all of its own). */
  readonly children: readonly Node[];
  /**
   * Keeps `container`'s content equal to the children, now and whenever they change, moving the
   * existing elements (nothing is recreated while a program streams).
   */
  place(container: Element): void;
  /**
   * Each child on its own (id, node and elements), for components that put children in separate
   * places, such as one tab panel per Tab.
   */
  readonly childList: readonly ChildEntry[];
  /** Renders this node again whenever one of these nodes changes (to read a child's props, say). */
  watch(ids: readonly string[]): void;
  /**
   * Renders a node (a component-valued prop, or a child somewhere else, such as a page thumbnail).
   * `key` names it, so the same element is reused on updates; one node can be rendered under
   * several keys. `inject` gives that copy values `consume` finds first (a page's mode, say).
   */
  renderNode(ref: NodeRef | string | null | undefined, key: string, inject?: ReadonlyMap<symbol, unknown>): Node | null;
  readonly runtime: Runtime;
  /** Sends an action to the host's `onAction`. */
  emit(action: GistUIAction): void;
  /** Runs a `do:[…]` action list. */
  run(steps: Expr | undefined): void;
  /** True while the program is still streaming. */
  readonly streaming: boolean;
  /** True while an interactive component must not be used (see `lockUntil`). */
  readonly locked: boolean;
  /** The state variable a `bind:$var` prop is bound to. */
  binding(): Binding;
  /** Applies `classNames[type]`, the program's `style:{…}` and a base style to the root element. */
  design(el: HTMLElement, base?: Readonly<Record<string, string | number>>): void;
  /** The host's colour theme (`color`), which wins over a program's accent. */
  readonly hostColor: string | undefined;
  /** Renders this node again (after a lazily loaded module arrives, say). */
  refresh(): void;
  /**
   * Makes a value available to every descendant (a Form's field registry, a Dialog's close). The
   * first time a key is provided, descendants render again so they see it.
   */
  provide<T>(key: symbol, value: T): void;
  /** The closest ancestor's value for `key` (or undefined). */
  consume<T>(key: symbol): T | undefined;
  /** Runs `fn` when this component instance is destroyed. */
  onDestroy(fn: () => void): void;
}

export interface ChildEntry {
  readonly id: string;
  readonly node: GistUINode | undefined;
  readonly nodes: readonly Node[];
}

export interface Binding {
  bound: boolean;
  value: unknown;
  set(v: unknown): void;
  /** Called when the bound value changes from elsewhere. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
}

/**
 * A rendered component. `update` patches `el` in place and keeps its internal state (an open menu,
 * a selected tab); returning false (or leaving it out) makes the renderer create a new instance.
 */
export interface DomInstance {
  readonly el: Element;
  update?(ctx: DomContext): boolean;
  destroy?(): void;
}

export type DomRenderer = (ctx: DomContext) => DomInstance;

/** A component library for the DOM renderer: schemas (for parsing and the prompt) and renderers. */
export interface DomLibrary {
  core: Library;
  components: ReadonlyMap<string, DomRenderer>;
  /** Swaps renderers and keeps every schema, so the prompt and props do not change. */
  extend(renderers: Readonly<Record<string, DomRenderer>>): DomLibrary;
}
