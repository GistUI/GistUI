/** Tiny DOM helpers. Text always goes through textContent; data never reaches innerHTML. */

const SVG_NS = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Rounds to 2 decimals and turns any non-finite value into 0, so no attribute ever holds NaN. */
export function num(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function setAttrs(el: Element, attrs: Attrs): void {
  for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? "" : typeof v === "number" ? String(num(v)) : v);
  }
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  if (parent) parent.appendChild(el);
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  text?: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  if (text !== undefined) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}

/** Series color: a theme variable with a fallback palette. */
const FALLBACK = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];
export function color(index: number): string {
  const i = ((index % 8) + 8) % 8;
  return `var(--gistui-chart-${i + 1}, ${FALLBACK[i]})`;
}

/** Visually hidden but available to screen readers. */
export const SR_ONLY =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
