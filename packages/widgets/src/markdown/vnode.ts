/**
 * A tiny virtual DOM for the Markdown widget. Rendering goes AST → VNode, then either to real DOM
 * (`toDom`, `patch`) or to an escaped HTML string (`toHtml`), so both outputs share one structure.
 * Content only ever reaches the DOM through `createTextNode` / `setAttribute`, never `innerHTML`.
 */

export type VNode = string | VEl;

export interface VEl {
  t: string;
  /** Attributes in output order. An empty value renders as a boolean attribute. */
  a?: [string, string][];
  c?: VNode[];
}

const VOID = new Set(["br", "hr", "img", "input"]);

export function toDom(v: VNode, doc: Document): Node {
  if (typeof v === "string") return doc.createTextNode(v);
  const el = doc.createElement(v.t);
  if (v.a) for (const [k, val] of v.a) el.setAttribute(k, val);
  if (v.c) for (const c of v.c) el.appendChild(toDom(c, doc));
  return el;
}

export function toHtml(v: VNode): string {
  if (typeof v === "string") return escapeText(v);
  let s = `<${v.t}`;
  if (v.a) for (const [k, val] of v.a) s += ` ${k}="${escapeAttr(val)}"`;
  s += ">";
  if (VOID.has(v.t)) return s;
  if (v.c) for (const c of v.c) s += toHtml(c);
  return `${s}</${v.t}>`;
}

export function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => (c === "&" ? "&amp;" : c === '"' ? "&quot;" : c === "<" ? "&lt;" : "&gt;"));
}

/**
 * Updates `dom` (which currently shows `prev`) to show `next` with minimal DOM operations, and
 * returns the node that now represents `next` (the same node unless the element type changed).
 */
export function patch(dom: Node, prev: VNode, next: VNode): Node {
  if (prev === next) return dom;
  const doc = dom.ownerDocument!;
  if (typeof next === "string") {
    if (typeof prev === "string" && dom.nodeType === 3) {
      if (dom.nodeValue !== next) dom.nodeValue = next;
      return dom;
    }
    return replace(dom, doc.createTextNode(next));
  }
  if (typeof prev === "string" || prev.t !== next.t) return replace(dom, toDom(next, doc));
  const el = dom as Element;
  patchAttrs(el, prev.a, next.a);
  patchChildren(el, prev.c ?? [], next.c ?? []);
  return el;
}

/**
 * Updates the children of `el` from `start` on (default: all of them) from `prev` to `next`; the
 * children before `start` are not looked at. Returns the node that now comes first in that range.
 */
export function patchChildren(el: Element, prev: readonly VNode[], next: readonly VNode[], start: Node | null = el.firstChild): Node | null {
  const doc = el.ownerDocument!;
  let child = start;
  let first: Node | null = null;
  for (let i = 0; i < next.length; i++) {
    let node: Node;
    if (i < prev.length && child) {
      node = patch(child, prev[i]!, next[i]!);
      child = node.nextSibling;
    } else node = el.appendChild(toDom(next[i]!, doc));
    if (i === 0) first = node;
  }
  while (child) {
    const nextChild = child.nextSibling;
    el.removeChild(child);
    child = nextChild;
  }
  return first;
}

function patchAttrs(el: Element, prev: VEl["a"], next: VEl["a"]): void {
  if (sameAttrs(prev, next)) return; // compare in JS first: DOM attribute reads are comparatively slow
  const keep = new Set<string>();
  if (next) {
    for (const [k, v] of next) {
      keep.add(k);
      if (el.getAttribute(k) !== v) el.setAttribute(k, v);
    }
  }
  if (prev) for (const [k] of prev) if (!keep.has(k)) el.removeAttribute(k);
}

function sameAttrs(a: VEl["a"], b: VEl["a"]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return (a?.length ?? 0) === 0 && (b?.length ?? 0) === 0;
  for (let i = 0; i < a.length; i++) if (a[i]![0] !== b[i]![0] || a[i]![1] !== b[i]![1]) return false;
  return true;
}

function replace(dom: Node, next: Node): Node {
  dom.parentNode?.replaceChild(next, dom);
  return next;
}
