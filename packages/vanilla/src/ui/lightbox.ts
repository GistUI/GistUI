/**
 * Lightbox: a full-screen image viewer on a native <dialog> (top layer, focus trap, Esc to close),
 * with previous/next, a counter, captions, thumbnails, arrow keys and swipe; and Gallery, a grid of
 * thumbnails that opens it. As in `@gistui/react`.
 */

import { safeUrl } from "@gistui/headless/url";
import { h, num, setAttrs, setStyle, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { fadeImg, NO_REFERRER, ratioOf } from "./content";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { lightboxOpener, type LightboxItem } from "./lightbox-open";

/** Shows the viewer and returns a function that closes it. */
export function showLightbox(items: readonly LightboxItem[], start: number, root: Element): () => void {
  const count = items.length;
  if (!count) return () => {};
  let index = ((start % count) + count) % count;
  let dir: 1 | -1 = 1;
  const counter = h("span", { class: "gistui-lightbox__count" });
  const close = h("button", { type: "button", class: "gistui-lightbox__btn", "aria-label": "Close" }, iconEl("x"));
  const stage = h("div", { class: "gistui-lightbox__stage" });
  const thumbs = h("div", { class: "gistui-lightbox__thumbs" });
  const dialog = h("dialog", { class: "gistui-lightbox" }, h("div", { class: "gistui-lightbox__top" }, counter, close), stage, ...(count > 1 ? [thumbs] : []));
  const go = (i: number) => {
    dir = i > index || (index === count - 1 && i === 0) ? 1 : -1;
    index = ((i % count) + count) % count;
    draw();
  };
  // Previous, next and the thumbnails are created once: after a click (or an arrow key) the focused
  // button is still in the dialog, so the keyboard goes on working. Only the picture is replaced.
  const nav: HTMLButtonElement[] = [];
  const thumbButtons: HTMLButtonElement[] = [];
  if (count > 1) {
    const prev = h("button", { type: "button", class: "gistui-lightbox__btn gistui-lightbox__nav", "data-side": "start", "aria-label": "Previous image" }, iconEl("chevron-left"));
    const next = h("button", { type: "button", class: "gistui-lightbox__btn gistui-lightbox__nav", "data-side": "end", "aria-label": "Next image" }, iconEl("chevron-right"));
    prev.addEventListener("click", () => go(index - 1));
    next.addEventListener("click", () => go(index + 1));
    nav.push(prev, next);
    items.forEach((it, i) => {
      const b = h("button", { type: "button", class: "gistui-lightbox__thumb", "aria-current": "false", "aria-label": `Image ${i + 1}` }, h("img", { src: it.src, alt: "", loading: "lazy", ...NO_REFERRER }));
      b.addEventListener("click", () => go(i));
      thumbButtons.push(b);
    });
    thumbs.append(...thumbButtons);
  }
  let shown: HTMLElement | null = null;
  const draw = () => {
    const item = items[index]!;
    setAttrs(dialog, { "aria-label": item.caption ?? "Image viewer" });
    counter.textContent = count > 1 ? `${index + 1} / ${count}` : "";
    const figure = h("figure", { class: "gistui-lightbox__figure" }, h("img", { src: item.src, alt: item.alt ?? item.caption ?? "", ...NO_REFERRER }), item.caption ? h("figcaption", null, item.caption) : null);
    setStyle(figure, { "--gistui-dir": dir });
    thumbButtons.forEach((b, i) => setAttrs(b, { "aria-current": i === index ? "true" : "false" }));
    thumbButtons[index]?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
    // The new picture goes in before the buttons, which stay where they are.
    shown?.remove();
    stage.prepend((shown = figure));
    // Preload the neighbours so next/previous is instant.
    for (const j of [index + 1, index - 1]) {
      const it = items[((j % count) + count) % count];
      if (!it || typeof Image === "undefined") continue;
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = it.src;
    }
  };
  // The page behind does not scroll while the viewer is open. It scrolls again however the viewer
  // goes away: its own buttons, Esc, the browser closing the dialog, the component that opened it
  // being destroyed, or something else removing the dialog from the page.
  const prevOverflow = document.body.style.overflow;
  // What had focus when the viewer was opened (the picture): focus returns there when it closes.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let open = true;
  let mo: MutationObserver | null = null;
  const shut = () => {
    if (!open) return;
    open = false;
    mo?.disconnect();
    document.body.style.overflow = prevOverflow;
    // Closed while it is still in the document (once removed it cannot be, and focus is lost).
    if (dialog.open) dialog.close?.();
    dialog.remove();
    if (opener?.isConnected) opener.focus?.();
  };
  close.addEventListener("click", shut);
  dialog.addEventListener("close", shut);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    shut();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || (e.target as Element).classList.contains("gistui-lightbox__stage")) shut();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  });
  // Swipe: a mostly horizontal drag over the picture. One that starts on the thumbnails scrolls them instead.
  let touch: { x: number; y: number } | null = null;
  dialog.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touch = t && e.touches.length === 1 && !(e.target as Element).closest(".gistui-lightbox__thumbs") ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true },
  );
  dialog.addEventListener("touchcancel", () => (touch = null));
  dialog.addEventListener("touchend", (e) => {
    const s = touch;
    const end = e.changedTouches[0];
    touch = null;
    if (!s || !end) return;
    const dx = end.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(end.clientY - s.y)) go(index + (dx < 0 ? 1 : -1));
  });
  stage.append(...nav);
  draw();
  root.append(dialog);
  document.body.style.overflow = "hidden";
  dialog.showModal?.();
  if (typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(() => {
      if (!dialog.isConnected) shut();
    });
    mo.observe(root, { childList: true });
  }
  return shut;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** A grid (or strip) of thumbnails; a click opens the lightbox at that image. */
export const Gallery: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-gallery", "data-gistui": "Gallery" });
  const open = lightboxOpener(ctx);
  let items: LightboxItem[] = [];
  let shown: Node[] = [];
  // A thumbnail keeps its button and its picture (by address): a redraw loads nothing again.
  interface Thumb {
    b: HTMLButtonElement;
    img: HTMLImageElement;
    zoom: HTMLSpanElement;
    caption: HTMLSpanElement;
    at: number;
  }
  const thumbs = keep<Thumb>();
  const apply = (c: DomContext) => {
    const p = c.props;
    const captions = strings(p.captions);
    items = strings(p.images)
      .map((s, i) => ({ src: safeUrl(s) ?? "", caption: captions[i] }))
      .filter((it) => it.src);
    const cols = num(p.cols);
    const v = str(p.v) ?? "grid";
    setAttrs(el, { "data-v": v });
    setStyle(el, { ...(cols ? { "--gistui-cols": Math.max(1, Math.min(6, Math.round(cols))) } : {}), "--gistui-ratio": ratioOf(p.ratio) ?? "1 / 1" });
    // Only its own thumbnails are taken out: an open viewer (its last child) stays.
    const before = new Set(shown);
    shown = items.map((it, i) => {
        const t = thumbs.get(it.src, () => {
          const made: Thumb = { b: h("button", { type: "button", class: "gistui-gallery__item" }), img: fadeImg(it.src, it.caption ?? ""), zoom: h("span", { class: "gistui-gallery__zoom", "aria-hidden": "true" }, iconEl("search")), caption: h("span", { class: "gistui-gallery__caption" }), at: i };
          made.b.addEventListener("click", () => open(items, made.at, el, true));
          return made;
        });
        t.at = i;
        setAttrs(t.b, { "aria-label": it.caption ? `Open ${it.caption}` : `Open image ${i + 1}` });
        setAttrs(t.img, { alt: it.caption ?? "" });
        setText(t.caption, it.caption ?? "");
        syncChildren(t.b, it.caption && v !== "strip" ? [t.img, t.zoom, t.caption] : [t.img, t.zoom]);
        return t.b;
      });
    syncChildren(el, shown, before);
    thumbs.prune();
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
