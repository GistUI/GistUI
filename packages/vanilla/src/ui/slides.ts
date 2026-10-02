/**
 * Slides and reports, as in `@gistui/react`:
 * - `Slides(…)` (v:deck): a presentation with previous/next, page count, dots, arrow keys, swipe and
 *   fullscreen. `Slides(…, v:viewer)`: the same slides in a document viewer with a thumbnail rail.
 * - `Report(Sheet(…), …)`: paper pages (A4 or Letter) in the viewer, with zoom and Download PDF.
 * Each Slide/Sheet is a normal container, so any component can go on it.
 */

import { NO_FIT, refit, type Fit } from "@gistui/headless";
import { safeUrl } from "@gistui/headless/url";
import { h, setAttrs, setStyle, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag } from "./attrs";
import { ratioOf } from "./content";
import { iconEl } from "./icon";

/** How a Slide/Sheet renders: in a deck (animated), as a static page, or as a thumbnail. */
export interface PageInfo {
  mode: "deck" | "page" | "thumb";
  index: number;
  ids: readonly string[];
  /** Report pages show a footer with the title and page number. */
  kind?: "report" | "slides" | undefined;
  title?: string | undefined;
}
/** Where a Slide reads its page info, and hears when it changes. */
export interface PageSource {
  get(): PageInfo;
  subscribe(cb: () => void): () => void;
}
const PAGE = Symbol("gistui.page");

function pageSource(initial: PageInfo): PageSource & { set(p: PageInfo): void } {
  let info = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => info,
    set(p) {
      info = p;
      for (const cb of [...listeners]) cb();
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** "16 / 9" → 1.777… ; "a4" → 0.707… */
export function aspectOf(ratio: string | undefined, fallback: number): number {
  if (!ratio) return fallback;
  const r = ratio.trim().toLowerCase();
  if (r === "a4") return 210 / 297;
  if (r === "letter") return 8.5 / 11;
  const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(r);
  return m ? Number(m[1]) / Number(m[2]) : fallback;
}

/** A page rendered at its natural size and scaled as a whole, like a PDF page. */
function scaled(): { el: HTMLDivElement; inner: HTMLDivElement; set(base: number, aspect: number, scale: number): void } {
  const inner = h("div", { class: "gistui-viewer__inner" });
  const el = h("div", { class: "gistui-viewer__scaled" }, inner);
  return {
    el,
    inner,
    set(base, aspect, scale) {
      const ht = base / aspect;
      setStyle(el, { width: base * scale, height: ht * scale });
      setStyle(inner, { width: base, height: ht, transform: `scale(${scale})` });
    },
  };
}

function observeSize(el: Element, fn: () => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const ro = new ResizeObserver(fn);
  ro.observe(el);
  return () => ro.disconnect();
}

const SLIDE_BASE = 960;

export const Slides: DomRenderer = (ctx) => {
  const viewer0 = str(ctx.props.v) === "viewer";
  const inst = viewer0 ? viewer(ctx, "slides") : deck(ctx);
  return {
    el: inst.el,
    update(next) {
      if ((str(next.props.v) === "viewer") !== viewer0) return false;
      return inst.update!(next);
    },
    destroy: () => inst.destroy?.(),
  };
};

function deck(ctx: DomContext) {
  let c = ctx;
  let index = 0;
  const src = pageSource({ mode: "deck", index: 0, ids: [] });
  ctx.provide(PAGE, src);
  const stage = h("div", { class: "gistui-slides__stage" });
  const box = scaled();
  const plain = h("div", { style: "display:contents" });
  const bar = h("div");
  const progress = h("div", { class: "gistui-slides__progress", "aria-hidden": "true" }, bar);
  const dots = h("div", { class: "gistui-slides__dots", role: "tablist", "aria-label": "Slides" });
  const prev = h("button", { type: "button", class: "gistui-icon-btn", "aria-label": "Previous slide" }, iconEl("chevron-left"));
  const count = h("span", { class: "gistui-slides__count", "aria-live": "polite" });
  const next = h("button", { type: "button", class: "gistui-icon-btn", "aria-label": "Next slide" }, iconEl("chevron-right"));
  const full = h("button", { type: "button", class: "gistui-icon-btn", "aria-label": "Fullscreen" }, iconEl("external-link"));
  const el = h(
    "div",
    { class: "gistui-slides", "data-gistui": "Slides", role: "region", "aria-roledescription": "slide deck", tabindex: 0 },
    stage,
    progress,
    h("div", { class: "gistui-slides__bar" }, dots, h("div", { class: "gistui-slides__nav" }, prev, count, next, full)),
  );
  const dotButtons: HTMLButtonElement[] = [];
  const ids = () => c.childList.map((e) => e.id);
  const go = (i: number) => {
    index = Math.max(0, Math.min(ids().length - 1, i));
    draw();
  };
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  full.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  });
  el.addEventListener("keydown", (e) => {
    // Keys a control inside a slide already used (Tabs' arrows), or that belong to a field, are not the deck's.
    if (e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && e.target === el)) {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ids().length - 1);
  });
  let touch: number | null = null;
  el.addEventListener("touchstart", (e) => (touch = e.touches[0]?.clientX ?? null));
  el.addEventListener("touchend", (e) => {
    const s = touch;
    const end = e.changedTouches[0]?.clientX;
    touch = null;
    if (s !== null && end !== undefined && Math.abs(end - s) >= 40) go(index + (end < s ? 1 : -1));
  });
  // Slides are laid out at 960px wide and scaled to the stage, like a presentation app.
  const draw = () => {
    const ratio = str(c.props.ratio) === "auto" ? undefined : (ratioOf(c.props.ratio) ?? "16 / 9");
    const all = ids();
    if (index > all.length - 1 && all.length) index = all.length - 1;
    const aspect = aspectOf(ratio, 16 / 9);
    setAttrs(el, { "data-ratio": ratio ? undefined : "auto", "aria-label": str(c.props.title) ?? "Slides" });
    setStyle(el, ratio ? { "--gistui-slide-ratio": ratio, "--gistui-slide-aspect": aspect } : undefined);
    if (ratio) {
      box.set(SLIDE_BASE, aspect, (stage.clientWidth || SLIDE_BASE) / SLIDE_BASE);
      c.place(box.inner);
      syncChildren(stage, [box.el]);
    } else {
      c.place(plain);
      syncChildren(stage, [plain]);
    }
    setStyle(bar, { width: all.length ? `${((index + 1) / all.length) * 100}%` : "0%" });
    // One dot per slide, kept: the dot just clicked is still the focused element.
    syncChildren(
      dots,
      all.map((_, i) => {
        let b = dotButtons[i];
        if (!b) {
          dotButtons[i] = b = h("button", { type: "button", role: "tab", class: "gistui-slides__dot" });
          b.addEventListener("click", () => go(i));
        }
        setAttrs(b, { "aria-current": i === index ? "true" : "false", "aria-selected": i === index ? "true" : "false", "aria-label": `Slide ${i + 1}` });
        return b;
      }),
    );
    dotButtons.length = all.length;
    setAttrs(prev, { disabled: index === 0 });
    setAttrs(next, { disabled: index >= all.length - 1 });
    setText(count, `${all.length ? index + 1 : 0} / ${all.length}`);
    src.set({ mode: "deck", index, ids: all });
  };
  const offSize = observeSize(stage, draw);
  draw();
  return {
    el,
    update(n: DomContext) {
      c = n;
      c.provide(PAGE, src);
      draw();
      return true;
    },
    destroy: offSize,
  };
}

const THUMB = 136;

/** Document viewer shared by Report and Slides(v:viewer): thumbnails, page(s), toolbar. */
function viewer(ctx: DomContext, kind: "report" | "slides") {
  let c = ctx;
  let index = 0;
  let all = kind === "report";
  let zoom = 1;
  let printing = false;
  const src = pageSource({ mode: "page", index: 0, ids: [], kind });
  ctx.provide(PAGE, src);
  const title = h("h2", { class: "gistui-viewer__title" });
  const subtitle = h("p", { class: "gistui-viewer__subtitle" });
  const presentTop = h("button", { type: "button", class: "gistui-icon-btn", "aria-label": "Present" }, iconEl("arrow-up-right"));
  const head = h("header", { class: "gistui-viewer__head" }, h("div", null, title, subtitle), presentTop);
  const rail = h("nav", { class: "gistui-viewer__rail", "aria-label": "Pages" });
  const pages = h("div", { class: "gistui-viewer__pages" });
  const btn = (label: string, icon: string, title = false) => h("button", { type: "button", class: "gistui-viewer__btn", "aria-label": label, title: title ? label : undefined }, iconEl(icon));
  const prev = btn("Previous page", "arrow-left");
  const next = btn("Next page", "arrow-right");
  const countNow = document.createTextNode("");
  const countAll = h("span");
  const allBox = h("input", { type: "checkbox", checked: all });
  const zoomOut = btn("Zoom out", "minus");
  const zoomLabel = h("button", { type: "button", class: "gistui-viewer__zoom", "aria-label": "Reset zoom" });
  const zoomIn = btn("Zoom in", "plus");
  const pdf = btn("Download PDF", "download", true);
  const present = btn("Present", "external-link", true);
  const sep = () => h("span", { class: "gistui-viewer__sep", "aria-hidden": "true" });
  const toolbar = h(
    "div",
    { class: "gistui-viewer__bar", role: "toolbar", "aria-label": kind === "report" ? "Document controls" : "Slide controls" },
    prev,
    h("span", { class: "gistui-viewer__count", "aria-live": "polite" }, countNow, countAll),
    next,
    sep(),
    h("label", { class: "gistui-viewer__toggle" }, allBox, h("span", { class: "gistui-viewer__switch", "aria-hidden": "true" }), "Show all"),
    ...(kind === "report" ? [sep(), zoomOut, zoomLabel, zoomIn, sep(), pdf] : []),
    present,
  );
  const main = h("div", { class: "gistui-viewer__main" }, pages, toolbar);
  const body = h("div", { class: "gistui-viewer__body" }, rail, main);
  const el = h("div", { class: "gistui-viewer", "data-gistui": kind === "report" ? "Report" : "Slides", "data-kind": kind, tabindex: 0, role: "region", "aria-roledescription": kind === "report" ? "document" : "slide deck" }, body);
  const frames = new Map<string, { frame: HTMLDivElement; box: ReturnType<typeof scaled> }>();
  // Each thumbnail keeps its own page source, so redraws only reach the thumbnails that changed.
  const thumbs = new Map<string, { el: HTMLDivElement; box: ReturnType<typeof scaled>; src: ReturnType<typeof pageSource>; inject: Map<symbol, unknown> }>();
  let shownIndex = -1;
  // With "Show all", the page in view becomes the current one.
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            if (!all) return;
            const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            const i = best ? Number((best.target as HTMLElement).dataset.page) : NaN;
            if (Number.isFinite(i) && i !== index) {
              index = i;
              draw();
            }
          },
          { root: main, threshold: [0.35, 0.6, 0.9] },
        );
  const ids = () => c.childList.map((e) => e.id);
  const go = (i: number) => {
    index = Math.max(0, Math.min(ids().length - 1, i));
    draw();
    if (all) pages.querySelector<HTMLElement>(`[data-page="${index}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  const doPresent = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  allBox.addEventListener("change", () => {
    all = allBox.checked;
    draw();
  });
  zoomOut.addEventListener("click", () => {
    zoom = Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10);
    draw();
  });
  zoomIn.addEventListener("click", () => {
    zoom = Math.min(2, Math.round((zoom + 0.1) * 10) / 10);
    draw();
  });
  zoomLabel.addEventListener("click", () => {
    zoom = 1;
    draw();
  });
  // Download PDF: print every page, one per sheet of paper.
  pdf.addEventListener("click", () => {
    printing = true;
    draw();
    // The paper is the size of one sheet, with no margins: one sheet per page, whatever the printer's paper is.
    const sheet = el.querySelector<HTMLElement>(".gistui-viewer__pages .gistui-viewer__scaled");
    const paper = sheet ? document.createElement("style") : null;
    if (paper && sheet) {
      paper.textContent = `@page { size: ${sheet.style.width} ${sheet.style.height}; margin: 0; }`;
      document.head.appendChild(paper);
    }
    window.addEventListener(
      "afterprint",
      () => {
        paper?.remove();
        printing = false;
        draw();
      },
      { once: true },
    );
    setTimeout(() => window.print(), 60);
  });
  present.addEventListener("click", doPresent);
  presentTop.addEventListener("click", doPresent);
  el.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") (e.preventDefault(), go(index + 1));
    else if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), go(index - 1));
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ids().length - 1);
  });

  const draw = () => {
    const p = c.props;
    const size = str(p.size) === "letter" ? "letter" : "a4";
    const ratio = str(p.ratio) === "auto" ? undefined : (ratioOf(p.ratio) ?? "16 / 9");
    const aspect = kind === "report" ? aspectOf(size, 210 / 297) : aspectOf(ratio, 16 / 9);
    const base = kind === "report" ? 794 : 960;
    const list = ids();
    if (index > list.length - 1 && list.length) index = list.length - 1;
    const t = str(p.title);
    const s = str(p.subtitle);
    setAttrs(el, { "data-all": flag(all), "data-printing": flag(printing), "aria-label": t ?? (kind === "report" ? "Report" : "Slides") });
    setStyle(el, { "--gistui-page-aspect": aspect, "--gistui-thumb": `${THUMB}px` });
    setText(title, t ?? "");
    setText(subtitle, s ?? "");
    syncChildren(head.firstChild as Element, [...(t ? [title] : []), ...(s ? [subtitle] : [])]);
    syncChildren(el, [...(t || s ? [head] : []), body]);
    allBox.checked = all;
    // Fit: slides fill the stage one at a time; reports fit the width, then zoom.
    const cs = getComputedStyle(main);
    const w = main.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    // On phones the stage's height follows its content: fit to its max-height instead, or the
    // page and the stage would keep shrinking each other.
    const cap = parseFloat(cs.maxHeight);
    const hh = (Number.isFinite(cap) ? cap : main.clientHeight) - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const pageH = base / aspect;
    const fit = !w ? 1 : kind === "slides" && !all ? Math.max(0.1, Math.min(w / base, (hh - 72) / pageH)) : kind === "slides" ? Math.max(0.1, w / base) : Math.max(0.1, Math.min(1, w / base));
    const scale = printing ? 1 : kind === "report" ? fit * zoom : fit;
    src.set({ mode: "page", index, ids: list, kind, title: t });

    // Thumbnails: their own copies of the pages, marked as thumbnails.
    const thumbEls: Node[] = [];
    list.forEach((id, i) => {
      let th = thumbs.get(id);
      if (!th) {
        const thumbBox = scaled();
        const mini = h("span", { class: "gistui-viewer__mini", "aria-hidden": "true", inert: true }, thumbBox.el);
        // A div, not a <button>: the page preview inside may itself contain buttons.
        const thumbEl = h("div", { role: "button", tabindex: 0, class: "gistui-viewer__thumb" }, mini, h("span", { class: "gistui-viewer__num" }));
        thumbEl.addEventListener("click", () => go(ids().indexOf(id)));
        thumbEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            go(ids().indexOf(id));
          }
        });
        const thumbSrc = pageSource({ mode: "thumb", index: i, ids: list, kind, title: t });
        thumbs.set(id, (th = { el: thumbEl, box: thumbBox, src: thumbSrc, inject: new Map([[PAGE, thumbSrc]]) }));
      }
      th.box.set(base, aspect, THUMB / base);
      setAttrs(th.el, { "aria-current": i === index ? "true" : "false", "aria-label": `Page ${i + 1}` });
      setText(th.el.lastChild!, String(i + 1));
      const was = th.src.get();
      if (was.index !== i || was.title !== t || was.ids.join("\u0000") !== list.join("\u0000")) th.src.set({ mode: "thumb", index: i, ids: list, kind, title: t });
      const copy = c.renderNode(id, `thumb:${id}`, th.inject);
      syncChildren(th.box.inner, copy ? [copy] : []);
      thumbEls.push(th.el);
    });
    for (const id of [...thumbs.keys()]) if (!list.includes(id)) thumbs.delete(id);
    for (const id of [...frames.keys()]) if (!list.includes(id)) frames.delete(id);
    syncChildren(rail, thumbEls);
    // Keep the current thumbnail in view.
    if (index !== shownIndex) {
      shownIndex = index;
      rail.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }

    // Pages: the children themselves, one at a time or all ("Show all", printing).
    const pageEls: Node[] = [];
    c.childList.forEach((entry, i) => {
      if (!(printing || all) && i !== index) return;
      let f = frames.get(entry.id);
      if (!f) {
        const pageBox = scaled();
        frames.set(entry.id, (f = { frame: h("div", { class: "gistui-viewer__frame" }, pageBox.el), box: pageBox }));
      }
      setAttrs(f.frame, { "data-page": i, "data-current": flag(i === index) });
      f.box.set(base, aspect, scale);
      syncChildren(f.box.inner, entry.nodes);
      pageEls.push(f.frame);
    });
    syncChildren(pages, pageEls);
    io?.disconnect();
    if (all && io) for (const f of pageEls) io.observe(f as Element);
    setAttrs(prev, { disabled: index === 0 });
    setAttrs(next, { disabled: index >= list.length - 1 });
    countNow.data = `${list.length ? index + 1 : 0} `;
    setText(countAll, `/ ${list.length}`);
    setAttrs(zoomOut, { disabled: zoom <= 0.5 });
    setAttrs(zoomIn, { disabled: zoom >= 2 });
    setText(zoomLabel, `${Math.round(zoom * 100)}%`);
  };
  const offSize = observeSize(main, draw);
  draw();
  return {
    el,
    update(n: DomContext) {
      c = n;
      c.provide(PAGE, src);
      draw();
      return true;
    },
    destroy() {
      offSize();
      io?.disconnect();
    },
  };
}

/** Paper pages in a PDF-style viewer: thumbnails, page count, zoom, Download PDF. */
export const Report: DomRenderer = (ctx) => {
  const inst = viewer(ctx, "report");
  return { el: inst.el, update: (n) => inst.update(n), destroy: inst.destroy };
};

/**
 * A slide (in Slides) or a page (in Report). Its content is scaled down to fit when it is taller
 * than the page (like a presentation app's autofit), so a page never scrolls or overflows.
 */
export const Slide: DomRenderer = (ctx) => {
  let c = ctx;
  const sheet = ctx.type === "Sheet";
  const content = h("div", { class: "gistui-slide__content" });
  const bg = h("div", { class: "gistui-slide__bg", "aria-hidden": "true" });
  const foot = h("footer", { class: "gistui-slide__foot", "aria-hidden": "true" });
  const el = h("section", { class: "gistui-slide", "data-gistui": sheet ? "Sheet" : "Slide", "aria-roledescription": sheet ? "page" : "slide" });
  // The scale is decided by `refit` (shared with the React renderer, so both settle alike).
  let fitted: Fit = NO_FIT;
  let bgImg: HTMLImageElement | null = null;
  let src = ctx.consume<PageSource>(PAGE);
  let off = src?.subscribe(() => draw()) ?? (() => {});
  const measure = () => {
    if (!src) return;
    // Measured again after each change of scale, so a search for the scale finishes at once
    // (it ends: every step narrows the bracket).
    for (let i = 0; i < 24; i++) {
      const cs = getComputedStyle(el);
      const avail = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      const next = refit(fitted, avail, content.scrollHeight);
      const changed = next.fit !== fitted.fit;
      fitted = next;
      if (!changed) return;
      draw();
    }
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
  ro?.observe(el);
  ro?.observe(content);
  const draw = () => {
    const p = c.props;
    const info = src?.get();
    const pos = info ? info.ids.indexOf(c.node.id) : 0;
    const deckMode = info?.mode === "deck";
    const state = !deckMode ? "active" : pos === info!.index ? "active" : pos < info!.index ? "before" : "after";
    const image = safeUrl(p.image);
    const hidden = deckMode && state !== "active";
    const fit = fitted.fit;
    const scaledDown = fit < 1;
    setAttrs(el, {
      "data-state": state,
      "data-static": deckMode ? undefined : (info?.mode ?? "page"),
      "data-layout": str(p.layout),
      "data-bg": image ? "image" : str(p.bg),
      "data-fit": flag(scaledDown),
      "aria-hidden": hidden ? "true" : undefined,
      inert: hidden || undefined,
      "aria-label": info ? `${pos + 1} of ${info.ids.length}` : undefined,
    });
    setStyle(content, scaledDown ? { transform: `scale(${fit})`, width: `${100 / fit}%` } : undefined);
    c.place(content);
    // The background picture keeps its element: only a new address loads again.
    if (image) {
      if (!bgImg) bg.append((bgImg = h("img", { src: image, alt: "", referrerpolicy: "no-referrer" })));
      else setAttrs(bgImg, { src: image });
    }
    const withFoot = sheet && info?.kind === "report" && !image;
    if (withFoot) syncChildren(foot, [h("span", null, info?.title ?? ""), h("span", null, `${pos + 1} / ${info!.ids.length}`)]);
    syncChildren(el, [...(image ? [bg] : []), content, ...(withFoot ? [foot] : [])]);
  };
  draw();
  return {
    el,
    update(n) {
      c = n;
      const nextSrc = c.consume<PageSource>(PAGE);
      if (nextSrc !== src) {
        off();
        src = nextSrc;
        off = src?.subscribe(() => draw()) ?? (() => {});
      }
      draw();
      return true;
    },
    destroy() {
      off();
      ro?.disconnect();
    },
  };
};

export const Sheet = Slide;
