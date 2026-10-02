/**
 * A horizontal scroller that knows which edges can still scroll: it fades those edges (CSS) and can
 * show arrow buttons that page through. It also tracks pages (one per viewport width) for dots.
 */

import { h, setAttrs } from "../dom";
import { flag } from "./attrs";
import { iconEl } from "./icon";

export interface ScrollState {
  start: boolean;
  end: boolean;
  pages: number;
  index: number;
}

export interface ScrollArea {
  /** The `.gistui-scroll` wrapper. */
  el: HTMLDivElement;
  /** The scrolling element: put content here. */
  view: HTMLDivElement;
  state: ScrollState;
  page(dir: -1 | 1): void;
  go(i: number): void;
  /** Called when edges or pages change. */
  onChange(cb: (s: ScrollState) => void): void;
  /** Shows, hides or removes the arrow buttons (a prop that arrives late in a stream). */
  setArrows(mode: "always" | "hover" | "none"): void;
  destroy(): void;
}

/**
 * Watches which edges of `view` can still scroll and how many pages it holds, and writes
 * `data-can-start` / `data-can-end` on `wrap` (the stylesheet fades those edges). For any scroller
 * with the `.gistui-scroll` > `.gistui-scroll__view` markup, such as a tab list.
 */
export function scrollEdges(wrap: Element, view: HTMLElement, onChange?: (s: ScrollState) => void): { state: ScrollState; measure(): void; destroy(): void } {
  const state: ScrollState = { start: false, end: false, pages: 1, index: 0 };
  const measure = () => {
    const max = view.scrollWidth - view.clientWidth;
    // RTL scrollLeft is negative in modern browsers; use the magnitude.
    const x = Math.abs(view.scrollLeft);
    const pages = view.clientWidth ? Math.max(1, Math.ceil((view.scrollWidth - 2) / view.clientWidth)) : 1;
    const index = max > 1 ? Math.round((x / max) * (pages - 1)) : 0;
    const next = { start: x > 1, end: max - x > 1, pages, index };
    if (next.start === state.start && next.end === state.end && next.pages === state.pages && next.index === state.index) return;
    Object.assign(state, next);
    setAttrs(wrap, { "data-can-start": flag(state.start), "data-can-end": flag(state.end) });
    onChange?.(state);
  };
  view.addEventListener("scroll", measure, { passive: true });
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(measure);
    ro.observe(view);
  }
  if (typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(() => {
      if (ro) for (const c of Array.from(view.children)) ro.observe(c);
      measure();
    });
    mo.observe(view, { childList: true });
  }
  queueMicrotask(measure);
  return {
    state,
    measure,
    destroy() {
      view.removeEventListener("scroll", measure);
      ro?.disconnect();
      mo?.disconnect();
    },
  };
}


export function scrollArea(opts: { arrows?: "always" | "hover" | "none"; viewClass?: string; wrapClass?: string } = {}): ScrollArea {
  let arrows: "always" | "hover" | "none" | null = null;
  const view = h("div", { class: opts.viewClass ? `gistui-scroll__view ${opts.viewClass}` : "gistui-scroll__view" });
  const el = h("div", { class: opts.wrapClass ? `gistui-scroll ${opts.wrapClass}` : "gistui-scroll" }, view);
  const listeners: ((s: ScrollState) => void)[] = [];
  let left: HTMLButtonElement | null = null;
  let right: HTMLButtonElement | null = null;
  const page = (dir: -1 | 1) => view.scrollBy({ left: dir * Math.max(120, view.clientWidth * 0.8), behavior: "smooth" });
  const go = (i: number) => {
    const max = view.scrollWidth - view.clientWidth;
    const pages = view.clientWidth ? Math.max(1, Math.ceil((view.scrollWidth - 2) / view.clientWidth)) : 1;
    view.scrollTo({ left: pages > 1 ? (max * Math.max(0, Math.min(pages - 1, i))) / (pages - 1) : 0, behavior: "smooth" });
  };
  const edges = scrollEdges(el, view, (state) => {
    if (left) left.tabIndex = state.start ? 0 : -1;
    if (right) right.tabIndex = state.end ? 0 : -1;
    for (const cb of listeners) cb(state);
  });
  const setArrows = (mode: "always" | "hover" | "none") => {
    if (mode === arrows) return;
    arrows = mode;
    setAttrs(el, { "data-arrows": mode });
    if (mode === "none") {
      left?.remove();
      right?.remove();
      left = right = null;
    } else if (!left || !right) {
      left = h("button", { type: "button", class: "gistui-scroll__arrow", "data-side": "start", "aria-label": "Scroll left", tabindex: edges.state.start ? 0 : -1 }, iconEl("chevron-left"));
      right = h("button", { type: "button", class: "gistui-scroll__arrow", "data-side": "end", "aria-label": "Scroll right", tabindex: edges.state.end ? 0 : -1 }, iconEl("chevron-right"));
      left.addEventListener("click", () => page(-1));
      right.addEventListener("click", () => page(1));
      view.after(left, right);
    }
  };
  setArrows(opts.arrows ?? "always");
  return {
    el,
    view,
    state: edges.state,
    page,
    go,
    onChange: (cb) => listeners.push(cb),
    setArrows,
    destroy: () => edges.destroy(),
  };
}
