/**
 * Rich building blocks, as in `@gistui/react`: Tile (icon + title + value), Media (image cards),
 * Source (citation cards) and Timeline (steps and itineraries from a table).
 */

import type { TableData } from "@gistui/core";
import { normalizeTable } from "@gistui/headless";
import { safeUrl } from "@gistui/headless/url";
import { isGlyph, resolveIcon } from "@gistui/widgets/icons";
import { h, setAttrs, setStyle, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag } from "./attrs";
import { fadeImg, markdown, ratioOf, trendOf } from "./content";
import { iconEl } from "./icon";
import { lightboxOpener } from "./lightbox-open";

/**
 * The element a card renders as: a button when it opens something, a link with `href`, a button
 * with `do:` steps, or a plain div. Recreated (update returns false) when that kind changes.
 */
function kindOf(c: DomContext, href: string | undefined, opens: boolean): "open" | "link" | "run" | "plain" {
  return opens ? "open" : href ? "link" : c.node.dyn?.do ? "run" : "plain";
}
function shell(c: DomContext, kind: ReturnType<typeof kindOf>, className: string, gistui: string): HTMLElement {
  const el = kind === "link" ? h("a", { target: "_blank", rel: "noopener noreferrer" }) : kind === "plain" ? h("div") : h("button", { type: "button" });
  el.className = className;
  setAttrs(el, { "data-gistui": gistui });
  return el;
}

function iconBox(icon: string | undefined, image: string | undefined, letter: string | undefined, tone?: string | undefined): Node | null {
  if (!icon && !image && !letter) return null;
  const known = icon && (resolveIcon(icon) || isGlyph(icon));
  return h(
    "span",
    { class: "gistui-tile__icon", "data-tone": tone, "data-letter": !image && !known && letter ? "" : undefined },
    image ? fadeImg(image, "") : known ? iconEl(icon) : (letter ?? ""),
  );
}

/** `iconBox`, kept between draws while it shows the same thing (so its picture is not loaded again). */
function keptIconBox(): typeof iconBox {
  let key: string | null = null;
  let box: Node | null = null;
  return (...args) => {
    const k = JSON.stringify(args);
    if (k !== key) {
      key = k;
      box = iconBox(...args);
    }
    return box;
  };
}

export const Tile: DomRenderer = (ctx) => {
  let c = ctx;
  const icon = keptIconBox();
  const kind0 = kindOf(ctx, safeUrl(ctx.props.href), false);
  const el = shell(ctx, kind0, "gistui-tile", "Tile");
  let md: ReturnType<typeof markdown> | null = null;
  el.addEventListener("click", () => {
    const steps = c.node.dyn?.do;
    if (kind0 === "run" && steps) c.run(steps);
  });
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const href = safeUrl(p.href);
    const value = str(p.value);
    const note = str(p.note);
    const body = str(p.body);
    const title = str(p.title);
    setAttrs(el, { href, "data-v": str(p.v), "data-align": body ? "start" : undefined, "data-wrap": body ? true : undefined, disabled: kind0 === "run" ? c.locked : undefined, "data-locked": kind0 === "run" ? flag(c.locked) : undefined });
    const main = h("span", { class: "gistui-tile__main" }, h("span", { class: "gistui-tile__title" }, title ?? ""));
    if (str(p.subtitle)) main.append(h("span", { class: "gistui-tile__subtitle" }, str(p.subtitle)!));
    if (body) {
      md ??= markdown(c, body, c.node.partial);
      md.set(body, c.node.partial);
      main.append(h("span", { class: "gistui-tile__body" }, md.el));
    }
    const end = value || note ? h("span", { class: "gistui-tile__end" }, value ? h("span", { class: "gistui-tile__value", "data-trend": p.mono === true ? undefined : trendOf(value) }, value) : null, note ? h("span", { class: "gistui-tile__note" }, note) : null) : null;
    const chevron = href && !value ? iconEl("chevron-right", "gistui-tile__chevron") : null;
    syncChildren(el, [icon(str(p.icon), safeUrl(p.image), title?.[0]?.toUpperCase(), str(p.tone)), main, end, chevron].filter((x): x is Node => x !== null));
  };
  apply(ctx);
  return {
    el,
    update(next) {
      if (kindOf(next, safeUrl(next.props.href), false) !== kind0) return false;
      apply(next);
      return true;
    },
    destroy: () => md?.destroy(),
  };
};

export const Media: DomRenderer = (ctx) => {
  let c = ctx;
  const zoomOf = (x: DomContext) => x.props.zoom === true && !safeUrl(x.props.href) && !x.node.dyn?.do;
  const kind0 = kindOf(ctx, safeUrl(ctx.props.href), zoomOf(ctx));
  const el = shell(ctx, kind0, "gistui-media", "Media");
  let shown = "";
  const imgBox = h("div", { class: "gistui-media__img" });
  // The viewer is closed with this picture (it locks the page's scrolling while it is open).
  const open = lightboxOpener(ctx);
  el.addEventListener("click", () => {
    const p = c.props;
    if (kind0 === "open") {
      const src = safeUrl(p.src);
      if (src) open([{ src, caption: [str(p.title), str(p.subtitle)].filter(Boolean).join(" — ") || undefined }], 0, el);
    } else if (kind0 === "run" && c.node.dyn?.do) c.run(c.node.dyn.do);
  });
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const src = safeUrl(p.src);
    const title = str(p.title);
    const subtitle = str(p.subtitle);
    const meta = str(p.meta);
    const ratio = ratioOf(p.ratio);
    setAttrs(el, { href: safeUrl(p.href), "data-v": str(p.v) ?? "below", "data-zoom": flag(kind0 === "open") });
    setStyle(el, ratio ? { "--gistui-ratio": ratio } : undefined);
    if (src && src !== shown) {
      shown = src;
      syncChildren(imgBox, [fadeImg(src, str(p.alt) ?? title ?? "")]);
    }
    const tag = str(p.tag);
    const clickable = kind0 === "link" || kind0 === "run";
    const body = title || subtitle || meta ? h("div", { class: "gistui-media__body" }, title ? h("span", { class: "gistui-media__title" }, title) : null, subtitle ? h("span", { class: "gistui-media__subtitle" }, subtitle) : null, meta ? h("span", { class: "gistui-media__meta" }, meta) : null) : null;
    syncChildren(el, [imgBox, tag ? h("span", { class: "gistui-media__tag" }, tag) : null, clickable ? h("span", { class: "gistui-media__go", "aria-hidden": "true" }, iconEl("chevron-right")) : null, body].filter((x): x is HTMLElement => x !== null));
  };
  apply(ctx);
  return {
    el,
    update(next) {
      if (kindOf(next, safeUrl(next.props.href), zoomOf(next)) !== kind0) return false;
      apply(next);
      return true;
    },
  };
};

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, "https://x.invalid").hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** A citation card: title and site, linking out. No favicon is fetched (no third-party requests). */
export const Source: DomRenderer = (ctx) => {
  const kind0 = kindOf(ctx, safeUrl(ctx.props.url), false);
  const el = shell(ctx, kind0, "gistui-tile", "Source");
  const icon = keptIconBox();
  const apply = (c: DomContext) => {
    const href = safeUrl(c.props.url);
    const host = hostOf(href);
    const title = str(c.props.title) ?? host ?? "Source";
    const site = str(c.props.site) ?? host;
    setAttrs(el, { href, "data-v": "card" });
    const main = h("span", { class: "gistui-tile__main" }, h("span", { class: "gistui-tile__title" }, site ?? title), site ? h("span", { class: "gistui-tile__subtitle" }, title) : null);
    syncChildren(el, [icon(str(c.props.icon), safeUrl(c.props.image) ?? (str(c.props.icon) ? undefined : c.runtime.favicon(host)), (site ?? title)[0]?.toUpperCase()), main].filter((x): x is Node => x !== null));
  };
  apply(ctx);
  return {
    el,
    update(next) {
      if (kindOf(next, safeUrl(next.props.url), false) !== kind0) return false;
      apply(next);
      return true;
    },
  };
};

type Data = TableData | readonly Record<string, unknown>[] | null | undefined;

/** Steps or an itinerary from a table: |Title|Detail|Meta|State (state: done or current). */
export const Timeline: DomRenderer = (ctx) => {
  // While its table has not streamed in, a placeholder stands in; the list takes its place then
  // (another element, so `update` asks for a new instance).
  const waiting = (c: DomContext) => c.streaming && !c.props.data;
  if (waiting(ctx)) return { el: h("div", { class: "gistui-skeleton", "data-expected": "Table", "aria-busy": "true" }), update: (c) => waiting(c) };
  const el = h("ol", { class: "gistui-timeline", "data-gistui": "Timeline" });
  const apply = (c: DomContext) => {
    const t = normalizeTable(c.props.data as Data);
    const numbered = c.props.numbered !== false;
    syncChildren(
      el,
      t.text.map((row, i) => {
        const state = (row[3] ?? "").trim().toLowerCase();
        return h(
          "li",
          { class: "gistui-timeline__item", "data-state": state === "done" || state === "current" ? state : undefined },
          h("span", { class: "gistui-timeline__dot" }, state === "done" ? iconEl("check") : numbered ? String(i + 1) : ""),
          h("div", null, h("div", { class: "gistui-timeline__head" }, h("span", { class: "gistui-timeline__title" }, row[0] ?? ""), row[2] ? h("span", { class: "gistui-timeline__meta" }, row[2]) : null), row[1] ? h("div", { class: "gistui-timeline__detail" }, row[1]) : null),
        );
      }),
    );
  };
  apply(ctx);
  return {
    el,
    update(c) {
      if (waiting(c)) return false;
      apply(c);
      return true;
    },
  };
};
