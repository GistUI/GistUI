/** Small DOM helpers shared by the renderer and the components. */

export type AttrValue = string | number | boolean | null | undefined;

/** Creates an element with attributes (`class` and `data-*` included) and children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Readonly<Record<string, AttrValue>> | null, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) setAttrs(el, attrs);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/**
 * Sets attributes: `false`, `null` and `undefined` remove one, `true` sets it empty. An attribute
 * that already has the value is not written again (a write wakes every MutationObserver).
 */
export function setAttrs(el: Element, attrs: Readonly<Record<string, AttrValue>>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) {
      if (el.hasAttribute(k)) el.removeAttribute(k);
      continue;
    }
    const value = v === true ? "" : String(v);
    if (el.getAttribute(k) !== value) el.setAttribute(k, value);
  }
}

/**
 * Makes `container`'s child nodes exactly `nodes`, in order. A node that stays where it is is not
 * touched: moving one takes its focus away, reloads an iframe and restarts a video.
 *
 * With `owned`, only those nodes may be removed: any other child (something another piece of code
 * appended) is left in the container, after `nodes`.
 */
export function syncChildren(container: Element, nodes: readonly Node[], owned?: ReadonlySet<Node>): void {
  let at = container.firstChild;
  let i = 0;
  while (at && at === nodes[i]) {
    at = at.nextSibling;
    i++;
  }
  if (!at && i === nodes.length) return;
  // What leaves goes first: the nodes that stay are then already in order, so nothing after a
  // removed (or replaced) node has to be inserted again.
  const keep = new Set(nodes);
  for (let n = at; n; ) {
    const next = n.nextSibling;
    if (!keep.has(n) && (!owned || owned.has(n))) {
      if (at === n) at = next;
      container.removeChild(n);
    }
    n = next;
  }
  for (; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (at === n) at = n.nextSibling;
    else container.insertBefore(n, at);
  }
}

/** Sets text without touching the DOM when it did not change. */
export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");
export const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : undefined);
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// CSS properties that take plain numbers; any other number is pixels (as React does).
const UNITLESS = new Set([
  "animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice", "borderImageWidth", "columnCount", "columns",
  "flex", "flexGrow", "flexPositive", "flexShrink", "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd", "gridRowSpan",
  "gridRowStart", "gridColumn", "gridColumnEnd", "gridColumnSpan", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight",
  "opacity", "order", "orphans", "scale", "tabSize", "widows", "zIndex", "zoom", "fillOpacity", "floodOpacity", "stopOpacity",
  "strokeDasharray", "strokeDashoffset", "strokeMiterlimit", "strokeOpacity", "strokeWidth",
]);
const STYLE_KEYS = new WeakMap<HTMLElement, Set<string>>();

/**
 * Sets inline styles from a camelCase object (as React's `style`), removing the keys a previous
 * call set that are no longer there. Custom properties (`--x`) are set as given.
 */
export function setStyle(el: HTMLElement, style: Readonly<Record<string, string | number>> | undefined): void {
  const before = STYLE_KEYS.get(el) ?? new Set<string>();
  const now = new Set<string>();
  for (const [k, raw] of Object.entries(style ?? {})) {
    if (raw === undefined || raw === null || raw === "") continue;
    const v = typeof raw === "number" && !k.startsWith("--") && !UNITLESS.has(k) && raw !== 0 ? `${raw}px` : String(raw);
    const prop = k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (el.style.getPropertyValue(prop) !== v) el.style.setProperty(prop, v);
    now.add(prop);
  }
  for (const prop of before) if (!now.has(prop)) el.style.removeProperty(prop);
  STYLE_KEYS.set(el, now);
}
