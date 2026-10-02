/** Content components: the same markup, classes and data attributes as `@gistui/react`'s. */

import type { MarkdownProps, Widget } from "@gistui/widgets";
import { createMarkdown, defaultSafeUrl } from "@gistui/widgets/markdown";
import { safeUrl } from "@gistui/headless/url";
import { h, num, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag } from "./attrs";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { lightboxOpener, preloadLightbox } from "./lightbox-open";

/** "+12%" → up, "−3" → down: the direction a signed value shows. */
export function trendOf(v: string | undefined): "up" | "down" | undefined {
  if (!v) return undefined;
  const d = v.trim();
  if (/^[+↑▲]/.test(d)) return "up";
  if (/^[-−↓▼]\s*\d/.test(d) || /^[↓▼]/.test(d)) return "down";
  return undefined;
}

/**
 * A Markdown block that streams: the widget re-renders only the last block. An image loads by
 * itself, so it follows the URL policy (the host's allowed hosts; nothing assembled from data): the
 * runtime is asked, with the text the URL stands in.
 */
export function markdown(ctx: DomContext, content: string, streaming: boolean): { el: HTMLDivElement; set(content: string, streaming: boolean): void; destroy(): void } {
  const el = h("div");
  const { runtime } = ctx;
  let text = content;
  // One function for the widget's whole life (it starts over when this changes identity).
  const isSafeUrl = (url: string, kind: "link" | "image") => defaultSafeUrl(url, kind) && (kind === "link" || runtime.loads(url, text));
  const w: Widget<MarkdownProps> = createMarkdown(el, { content, streaming, isSafeUrl });
  return {
    el,
    set(c, s) {
      text = c;
      w.update({ content: c, streaming: s, isSafeUrl });
    },
    destroy: () => w.destroy(),
  };
}

/** Swaps an icon slot's content when the name changes (null hides it). */
export function iconSlot(slot: Element, name: string | undefined, prev: { name: string | undefined }): void {
  if (prev.name === name) return;
  prev.name = name;
  const icon = iconEl(name);
  syncChildren(slot, icon ? [icon] : []);
}

export const Text: DomRenderer = (ctx) => {
  const md = markdown(ctx, str(ctx.props.content) ?? "", ctx.node.partial);
  const el = h("div", { class: "gistui-text", "data-gistui": "Text" }, md.el);
  const apply = (c: DomContext) => {
    const p = c.props;
    setAttrs(el, { "data-size": str(p.size), "data-muted": flag(p.muted === true), "data-text-align": str(p.align), "data-streaming": flag(c.node.partial) });
    c.design(el);
    md.set(str(p.content) ?? "", c.node.partial);
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
    destroy: () => md.destroy(),
  };
};

const TONE_ICON: Record<string, string> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  danger: "alert-circle",
  neutral: "info",
  accent: "sparkles",
};

export const Callout: DomRenderer = (ctx) => {
  const md = markdown(ctx, str(ctx.props.content) ?? "", ctx.node.partial);
  const iconWrap = h("span", { class: "gistui-callout__icon" });
  const title = h("div", { class: "gistui-callout__title" });
  const body = h("div", { class: "gistui-callout__body" });
  const el = h("div", { class: "gistui-callout", "data-gistui": "Callout", role: "note" });
  const icon = { name: undefined as string | undefined };
  const apply = (c: DomContext) => {
    const p = c.props;
    const tone = str(p.tone) ?? "info";
    const v = str(p.v);
    const name = str(p.icon) ?? (v === "bar" ? undefined : TONE_ICON[tone]);
    setAttrs(el, { "data-tone": tone, "data-v": v });
    c.design(el);
    iconSlot(iconWrap, name, icon);
    const t = str(p.title);
    setText(title, t ?? "");
    syncChildren(body, [...(t ? [title] : []), md.el]);
    md.set(str(p.content) ?? "", c.node.partial);
    syncChildren(el, [...(name ? [iconWrap] : []), body]);
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
    destroy: () => md.destroy(),
  };
};

export const Tag: DomRenderer = (ctx) => {
  const el = h("span", { class: "gistui-tag", "data-gistui": "Tag" });
  const label = document.createTextNode("");
  let iconName: string | undefined | null = null;
  let icon: Element | null = null;
  const apply = (c: DomContext) => {
    const p = c.props;
    setAttrs(el, { "data-tone": str(p.tone) ?? "neutral", "data-shape": p.pill ? "pill" : undefined });
    c.design(el);
    const name = str(p.icon);
    if (name !== iconName) {
      iconName = name;
      icon = iconEl(name);
    }
    label.data = str(p.label) ?? "";
    syncChildren(el, [...(icon ? [icon] : []), label]);
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

export const Tags: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-tags", "data-gistui": "Tags" });
  ctx.place(el);
  return {
    el,
    update(c) {
      c.place(el);
      return true;
    },
  };
};

export function ratioOf(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return `${m[1]} / ${m[2]}`;
  const named: Record<string, string> = { square: "1 / 1", wide: "16 / 9", portrait: "3 / 4", landscape: "4 / 3", ultrawide: "21 / 9" };
  return named[s];
}

/** No referrer for a picture: a program picks the URL, and the page's address is not its host's business. */
export const NO_REFERRER = { referrerpolicy: "no-referrer" } as const;

/** An image that fades in once it has loaded (also when it was already cached). */
export function fadeImg(src: string, alt: string): HTMLImageElement {
  const img = h("img", { src, alt, loading: "lazy", decoding: "async", ...NO_REFERRER });
  const mark = () => setAttrs(img, { "data-loaded": flag(img.complete && img.naturalWidth > 0) });
  img.addEventListener("load", () => setAttrs(img, { "data-loaded": "true" }));
  queueMicrotask(mark);
  return img;
}

export const Image: DomRenderer = (ctx) => {
  let c = ctx;
  const zoom0 = ctx.props.zoom === true;
  const el = h("figure", { class: "gistui-image", "data-gistui": "Image" });
  // With `zoom`, the frame is a button that opens the picture in the viewer.
  const frame = zoom0 ? h("button", { type: "button", class: "gistui-image__frame gistui-image__zoom" }) : h("div", { class: "gistui-image__frame" });
  const zoomBadge = h("span", { class: "gistui-gallery__zoom", "aria-hidden": "true" }, iconEl("search"));
  if (zoom0) {
    // The viewer is closed with this picture (it locks the page's scrolling while it is open).
    const open = lightboxOpener(ctx);
    frame.addEventListener("pointerenter", () => void preloadLightbox());
    frame.addEventListener("click", () => {
      const src = safeUrl(c.props.src);
      if (src) open([{ src, caption: str(c.props.caption), alt: str(c.props.alt) }], 0, el, true);
    });
  }
  const caption = h("figcaption");
  const OWN = new Set<Node>([frame, caption]);
  let img: HTMLImageElement | null = null;
  let shown = "";
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const src = safeUrl(p.src);
    const cap = str(p.caption);
    const alt = str(p.alt) ?? cap ?? "";
    const ratio = ratioOf(p.ratio);
    setAttrs(el, { "data-ratio": ratio ? true : undefined, hidden: !src });
    c.design(el, ratio ? { "--gistui-ratio": ratio } : undefined);
    if (src && src !== shown) {
      shown = src;
      img = fadeImg(src, alt);
      syncChildren(frame, zoom0 ? [img, zoomBadge] : [img]);
    } else if (img) setAttrs(img, { alt });
    if (zoom0) setAttrs(frame, { "aria-label": cap ? `Open ${cap}` : "Open image" });
    setText(caption, cap ?? "");
    // Only the figure's own parts are taken out: an open viewer (its last child) stays.
    syncChildren(el, [...(src ? [frame] : []), ...(cap ? [caption] : [])], OWN);
  };
  apply(ctx);
  return {
    el,
    update(next) {
      if ((next.props.zoom === true) !== zoom0) return false;
      apply(next);
      return true;
    },
  };
};

export const FollowUps: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-followups", "data-gistui": "FollowUps" });
  // A suggestion keeps its button (by text) when the list is drawn again.
  const buttons = keep<HTMLButtonElement>();
  let c = ctx;
  const apply = (next: DomContext) => {
    c = next;
    const items = Array.isArray(c.props.items) ? c.props.items.filter((x): x is string => typeof x === "string" && x !== "") : [];
    syncChildren(
      el,
      items.map((q) => {
        const b = buttons.get(q, () => {
          const made = h("button", { type: "button", class: "gistui-followup" }, iconEl("arrow-up-right"), q);
          made.addEventListener("click", () => c.emit({ type: "send", message: q, nodeId: c.node.id }));
          return made;
        });
        setAttrs(b, { disabled: c.locked, "data-locked": flag(c.locked) });
        return b;
      }),
    );
    buttons.prune();
  };
  apply(ctx);
  return {
    el,
    update(next) {
      apply(next);
      return true;
    },
  };
};

export const Quote: DomRenderer = (ctx) => {
  const quote = h("blockquote");
  const by = h("figcaption");
  const el = h("figure", { class: "gistui-quote", "data-gistui": "Quote" }, quote);
  const apply = (c: DomContext) => {
    setText(quote, str(c.props.text) ?? "");
    const who = str(c.props.by);
    setText(by, who ? `— ${who}` : "");
    syncChildren(el, [quote, ...(who ? [by] : [])]);
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

export const Icon: DomRenderer = (ctx) => {
  const el = h("span", { "data-gistui": "Icon" });
  const icon = { name: undefined as string | undefined };
  const apply = (c: DomContext) => {
    const p = c.props;
    const plain = p.plain === true;
    el.classList.toggle("gistui-icon-plain", plain);
    el.classList.toggle("gistui-icon-badge", !plain);
    setAttrs(el, { "data-tone": str(p.tone), "data-size": plain ? undefined : str(p.size) });
    // style:{size:40, color:"#fde68a"} sizes and colours a plain icon; on a badge it styles the badge.
    c.design(el);
    iconSlot(el, str(p.name), icon);
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
