/** Layout components: the same markup, classes and data attributes as `@gistui/react`'s. */

import { h, num, setAttrs, setText, str, syncChildren, type AttrValue } from "../dom";
import type { DomContext, DomInstance, DomRenderer } from "../types";
import { bindingLink } from "../field";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { scrollArea, scrollEdges } from "./scroll";

type Props = Readonly<Record<string, unknown>>;

/**
 * A container: one element whose attributes come from its props, the design layer on top and the
 * children inside. Updates only re-apply attributes, so nothing is rebuilt.
 */
export function container(
  tag: keyof HTMLElementTagNameMap,
  className: string,
  type: string,
  attrs: (p: Props, ctx: DomContext) => Readonly<Record<string, AttrValue>>,
  style?: (p: Props) => Readonly<Record<string, string | number>> | undefined,
): DomRenderer {
  return (ctx) => {
    const el = h(tag, { class: className, "data-gistui": type });
    const apply = (c: DomContext) => {
      setAttrs(el, attrs(c.props, c));
      c.design(el, style?.(c.props));
      c.place(el);
    };
    apply(ctx);
    return {
      el,
      update(c) {
        apply(c);
        return true;
      },
    };
  };
}

/** Accent, rounding and density a program may pick; the host's colour theme wins over the accent. */
const presets = (p: Props, ctx: DomContext) => ({
  "data-gistui-color": ctx.hostColor ? undefined : str(p.accent),
  "data-gistui-radius": str(p.radius),
  "data-gistui-density": str(p.density),
});

export const Page = container("div", "gistui-page", "Page", (p, c) => ({ "data-gap": str(p.gap), "data-width": str(p.width), ...presets(p, c) }));
export const Stack = container("div", "gistui-stack", "Stack", (p) => ({ "data-gap": str(p.gap), "data-align": str(p.align), "data-justify": str(p.justify) }));
export const Row = container("div", "gistui-row", "Row", (p) => ({ "data-gap": str(p.gap), "data-align": str(p.align), "data-justify": str(p.justify), "data-wrap": p.wrap ? true : undefined }));
export const Grid = container("div", "gistui-grid", "Grid", (p) => ({ "data-gap": str(p.gap) }), (p) => ({ "--gistui-cols": Math.min(6, Math.max(1, Math.round(num(p.cols) ?? 3))) }));
const MAX_ROW_SPAN = 12;
export const Cell = container(
  "div",
  "gistui-stack",
  "Cell",
  (p) => ({ "data-span": num(p.span) ? true : undefined, "data-row-span": num(p.rows) ? true : undefined, "data-gap": str(p.gap) }),
  (p) => {
    const s: Record<string, string | number> = {};
    const span = num(p.span);
    const rows = num(p.rows);
    if (span) s["--gistui-span"] = Math.round(span);
    // The stylesheet clamps `span` to the grid's columns; nothing bounds rows, so it is clamped here
    // (a huge row span would make the grid create that many rows).
    if (rows) s["--gistui-row-span"] = Math.max(1, Math.min(MAX_ROW_SPAN, Math.round(rows)));
    return s;
  },
);
export const Box = container(
  "div",
  "gistui-box",
  "Box",
  (p, c) => ({
    "data-dir": str(p.dir) ?? "col",
    "data-gap": str(p.gap),
    "data-align": str(p.align),
    "data-justify": str(p.justify),
    "data-pad": str(p.pad),
    "data-surface": str(p.surface),
    "data-wrap": p.wrap ? true : undefined,
    "data-grow": p.fill ? true : undefined,
    "data-text-align": str(p.text),
    ...presets(p, c),
  }),
  (p) => {
    const w = num(p.w);
    const s: Record<string, string | number> = {};
    if (w) s.flex = `0 0 ${Math.round(w)}px`;
    if (p.grow === true) s.flex = "1 1 0";
    return s;
  },
);
/** Frame: a free-form box; its layout and look come from `style:{…}`. */
export const Frame = container("div", "gistui-frame", "Frame", () => ({}));
export const Card = container("section", "gistui-card", "Card", (p, c) => ({ "data-v": str(p.v) ?? "card", "data-gap": str(p.gap), ...presets(p, c) }));

export const Spacer: DomRenderer = () => ({ el: h("div", { class: "gistui-spacer", "data-gistui": "Spacer", "aria-hidden": "true" }), update: () => true });
export const Separator: DomRenderer = () => ({ el: h("hr", { class: "gistui-separator", "data-gistui": "Separator" }), update: () => true });

export const Header: DomRenderer = (ctx) => {
  const el = h("header", { class: "gistui-header", "data-gistui": "Header" });
  const eyebrow = h("span", { class: "gistui-header__eyebrow" });
  const title = h("h2", { class: "gistui-header__title" });
  const subtitle = h("p", { class: "gistui-header__subtitle" });
  const apply = (c: DomContext) => {
    const p = c.props;
    setAttrs(el, { "data-size": str(p.size), "data-text-align": str(p.align) });
    c.design(el);
    const e = str(p.eyebrow);
    const s = str(p.subtitle);
    setText(eyebrow, e ?? "");
    setText(title, str(p.title) ?? "");
    setText(subtitle, s ?? "");
    syncChildren(el, [...(e ? [eyebrow] : []), title, ...(s ? [subtitle] : [])]);
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
  };
};

/** A Tab is a panel's content; Tabs places it. */
export const Tab: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-tab", "data-gistui": "Tab", style: "display:contents" });
  ctx.place(el);
  return {
    el,
    update(c) {
      c.place(el);
      return true;
    },
  };
};

let tabsSeq = 0;

/**
 * WAI-ARIA tabs (automatic activation), with the data attributes the stylesheet expects. Tab values
 * are the Tab node ids (stable while streaming); `bind:$tab` holds the selected tab's label. Each
 * trigger keeps its element (by tab id), so the tab you clicked still has the focus for arrow keys.
 */
export const Tabs: DomRenderer = (ctx) => {
  const base = `gistui-tabs-${++tabsSeq}`;
  const el = h("div", { class: "gistui-tabs", "data-gistui": "Tabs", "data-scope": "tabs", "data-part": "root", "data-orientation": "horizontal" });
  const scroll = h("div", { class: "gistui-scroll" });
  const list = h("div", { role: "tablist", "aria-orientation": "horizontal", "data-scope": "tabs", "data-part": "list", class: "gistui-scroll__view" });
  const indicator = h("span", { class: "gistui-tabs__indicator", "aria-hidden": "true" });
  scroll.append(list);
  el.append(scroll);
  const panels = new Map<string, HTMLDivElement>();
  interface Trigger {
    b: HTMLButtonElement;
    label: HTMLSpanElement;
    icon: string | undefined;
  }
  const triggers = keep<Trigger>();
  // The tab list scrolls when it overflows: the wrapper says which edges to fade.
  const edges = scrollEdges(scroll, list);
  let own: string | null = null;
  let c = ctx;
  const binding = bindingLink(ctx, () => draw());

  const ids = () => c.childList.map((e) => e.id);
  const labelOf = (id: string) => str(c.childList.find((e) => e.id === id)?.node?.props.label) ?? id;
  const selected = (): string | null => {
    const b = c.binding();
    if (b.bound) return ids().find((id) => labelOf(id) === b.value || id === b.value) ?? ids()[0] ?? null;
    if (own === null || !ids().includes(own)) own = ids()[0] ?? null;
    return own;
  };
  const select = (id: string, focus: boolean) => {
    const b = c.binding();
    if (b.bound) b.set(labelOf(id));
    else own = id;
    draw();
    if (focus) list.querySelector<HTMLElement>(`[data-value="${CSS.escape(id)}"]`)?.focus();
  };
  const measure = () => {
    const t = list.querySelector<HTMLElement>('[data-part="trigger"][data-selected]');
    if (!t) {
      indicator.remove();
      setAttrs(el, { "data-measured": undefined });
      return;
    }
    if (!indicator.parentNode) list.append(indicator);
    setAttrs(el, { "data-measured": true });
    if (str(c.props.v) === "pills") {
      indicator.style.transform = `translate(${t.offsetLeft}px, ${t.offsetTop}px)`;
      indicator.style.width = `${t.offsetWidth}px`;
      indicator.style.height = `${t.offsetHeight}px`;
    } else {
      indicator.style.transform = `translateX(${t.offsetLeft}px)`;
      indicator.style.width = `${t.offsetWidth}px`;
    }
  };
  const draw = () => {
    const value = selected();
    setAttrs(el, { "data-v": str(c.props.v) });
    const tabs: Node[] = c.childList.map((entry, i) => {
      const id = entry.id;
      const label = str(entry.node?.props.label) ?? `Tab ${i + 1}`;
      const icon = str(entry.node?.props.icon);
      const on = id === value;
      const t = triggers.get(id, () => {
        const b = h("button", { type: "button", role: "tab" });
        b.addEventListener("click", () => select(id, false));
        // The bold copy reserves the width, so selecting a tab does not shift its neighbours.
        const made: Trigger = { b, label: h("span", { class: "gistui-tabs__label" }), icon: undefined };
        b.append(made.label);
        return made;
      });
      setAttrs(t.b, {
        id: `${base}-tab-${i}`,
        "aria-selected": on ? "true" : "false",
        "aria-controls": `${base}-panel-${i}`,
        tabindex: on ? 0 : -1,
        "data-scope": "tabs",
        "data-part": "trigger",
        "data-value": id,
        "data-selected": on || undefined,
      });
      setAttrs(t.label, { "data-text": label });
      setText(t.label, label);
      if (icon !== t.icon) {
        t.icon = icon;
        const svg = iconEl(icon);
        syncChildren(t.b, svg ? [svg, t.label] : [t.label]);
      }
      return t.b;
    });
    triggers.prune();
    syncChildren(list, indicator.parentNode === list ? [...tabs, indicator] : tabs);
    const keep = new Set<string>();
    const order: Node[] = [scroll];
    c.childList.forEach((entry, i) => {
      keep.add(entry.id);
      let panel = panels.get(entry.id);
      if (!panel) panels.set(entry.id, (panel = h("div", { role: "tabpanel", tabindex: 0, "data-scope": "tabs", "data-part": "content" })));
      setAttrs(panel, { id: `${base}-panel-${i}`, "aria-labelledby": `${base}-tab-${i}`, hidden: entry.id !== value, "data-selected": entry.id === value || undefined });
      syncChildren(panel, entry.nodes);
      order.push(panel);
    });
    for (const id of [...panels.keys()]) if (!keep.has(id)) panels.delete(id);
    syncChildren(el, order);
    requestAnimationFrame(measure);
  };
  list.addEventListener("keydown", (e) => {
    const all = ids();
    const value = selected();
    const i = value ? all.indexOf(value) : 0;
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const id = all[(to + all.length) % all.length];
    if (id) select(id, true);
  });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
  ro?.observe(list);

  const apply = (next: DomContext) => {
    c = next;
    c.watch(ids());
    binding.sync(c);
    draw();
  };
  apply(ctx);
  const inst: DomInstance = {
    el,
    update(next) {
      apply(next);
      return true;
    },
    destroy() {
      ro?.disconnect();
      edges.destroy();
    },
  };
  return inst;
};

/**
 * A horizontal strip of cards: snap scrolling, faded edges, arrows where it can still move, optional
 * page indicators (`nav: dots | bars | count`) and autoplay (seconds; pauses on hover and focus).
 */
export const Carousel: DomRenderer = (ctx) => {
  let c = ctx;
  const arrowsOf = (x: DomContext) => (str(x.props.arrows) as "always" | "hover" | "none" | undefined) ?? "always";
  const area = scrollArea({ arrows: arrowsOf(ctx), viewClass: "gistui-carousel" });
  setAttrs(area.view, { role: "region", "aria-roledescription": "carousel", "aria-label": "Carousel", tabindex: 0 });
  const nav = h("div", { class: "gistui-carousel__nav" });
  const counter = h("span", { class: "gistui-carousel__count", "aria-live": "polite" });
  const dots: HTMLButtonElement[] = [];
  const el = h("div", { class: "gistui-carousel-wrap", "data-gistui": "Carousel" }, area.el);
  let paused = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  for (const [ev, v] of [["mouseenter", true], ["mouseleave", false], ["focusin", true], ["focusout", false]] as const) el.addEventListener(ev, () => (paused = v));

  const drawNav = () => {
    const mode = str(c.props.nav) ?? "none";
    const { pages, index } = area.state;
    if (mode === "none" || pages < 2) {
      nav.remove();
      return;
    }
    setAttrs(nav, { "data-nav": mode });
    if (mode === "count") {
      setText(counter, `${index + 1} / ${pages}`);
      syncChildren(nav, [counter]);
    } else {
      // One dot per page, kept: the dot just clicked is still the focused element when the strip
      // has scrolled there.
      syncChildren(
        nav,
        Array.from({ length: pages }, (_, i) => {
          let b = dots[i];
          if (!b) {
            dots[i] = b = h("button", { type: "button", class: "gistui-carousel__dot" });
            b.addEventListener("click", () => area.go(i));
          }
          setAttrs(b, { "aria-label": `Page ${i + 1} of ${pages}`, "aria-current": i === index ? "true" : undefined });
          return b;
        }),
      );
      dots.length = pages;
    }
    if (!nav.parentNode) el.append(nav);
  };
  area.onChange(drawNav);
  const apply = (next: DomContext) => {
    c = next;
    // Named arguments arrive last in a stream: `arrows:none` takes the buttons away then.
    area.setArrows(arrowsOf(c));
    const per = num(c.props.per);
    if (per) area.view.style.setProperty("--gistui-slide", `calc((100% - ${Math.max(0, Math.round(per) - 1)} * var(--gistui-space-md)) / ${Math.max(1, per)})`);
    else area.view.style.removeProperty("--gistui-slide");
    c.place(area.view);
    drawNav();
    const autoplay = num(c.props.autoplay);
    if (timer) clearInterval(timer);
    timer = null;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (autoplay && !reduced) {
      timer = setInterval(() => {
        const { pages, index } = area.state;
        if (!paused && pages > 1) area.go(index >= pages - 1 ? 0 : index + 1);
      }, Math.max(2, autoplay) * 1000);
    }
  };
  apply(ctx);
  return {
    el,
    update(next) {
      apply(next);
      return true;
    },
    destroy() {
      if (timer) clearInterval(timer);
      area.destroy();
    },
  };
};
