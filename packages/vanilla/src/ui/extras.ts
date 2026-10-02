/**
 * Less common components (their own chunk), as in `@gistui/react`: Slider, Code, Math, Diagram,
 * Video, Avatar, KeyValue, Pricing and Hero. Math uses KaTeX (MathML, its own chunk); Diagram uses
 * Mermaid (its own chunk, or the page's `window.mermaid`), themed from GistUI's tokens, and shows the
 * source when it cannot draw.
 */

import type { TableData } from "@gistui/core";
import { normalizeTable } from "@gistui/headless";
import { highlight, langOf } from "@gistui/headless/highlight";
import { safeUrl } from "@gistui/headless/url";
import { h, num, setAttrs, setStyle, setText, str, syncChildren } from "../dom";
import { boundValue, resetLink } from "../field";
import type { DomContext, DomRenderer } from "../types";
import { flag, mark } from "./attrs";
import { NO_REFERRER, ratioOf } from "./content";
import { iconEl } from "./icon";
import { keep } from "./keep";

type Data = TableData | readonly unknown[] | null | undefined;

/**
 * A component whose inner markup is rebuilt from props on every update. Only for plain text (a
 * key/value list): anything with a picture, a player or a button keeps its elements and patches them.
 */
function view(tag: keyof HTMLElementTagNameMap, base: Readonly<Record<string, string>>, draw: (c: DomContext, el: HTMLElement) => Node[]): DomRenderer {
  return (ctx) => {
    const el = h(tag, base);
    const apply = (c: DomContext) => syncChildren(el, draw(c, el));
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

let seq = 0;

export const Slider: DomRenderer = (ctx) => {
  let c = ctx;
  const id = `gistui-slider-${++seq}`;
  const own = boundValue<number>(ctx, (x) => num(x.props.value) ?? num(x.props.min) ?? 0, () => draw());
  // A form reset: back to the program's value (a bound variable is the program's to reset).
  const reset = resetLink(ctx, () => {
    own.reset();
    draw();
  });
  const label = h("label", { class: "gistui-field__label", for: id });
  const output = h("output", { class: "gistui-slider__value", for: id });
  const input = h("input", { id, type: "range", class: "gistui-slider__input" });
  const hint = h("span", { class: "gistui-field__hint" });
  const el = h("div", { class: "gistui-field gistui-slider", "data-gistui": "Slider" }, h("div", { class: "gistui-slider__head" }, label, output), input);
  const value = (min: number) => {
    const v = own.get();
    return typeof v === "number" ? v : Number(v ?? min);
  };
  input.addEventListener("input", () => {
    own.set(Number(input.value));
    draw();
  });
  const draw = () => {
    const p = c.props;
    const min = num(p.min) ?? 0;
    const max = num(p.max) ?? 100;
    const step = num(p.step) ?? (max - min > 20 ? 1 : (max - min) / 100);
    const v = value(min);
    const pct = max > min ? ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100 : 0;
    setStyle(el, { "--gistui-fill": `${pct}%` });
    setText(label, str(p.label) ?? "");
    setText(output, `${Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}${str(p.unit) ?? ""}`);
    setAttrs(input, { name: str(p.name), min, max, step, disabled: c.locked });
    const s = String(Number.isFinite(v) ? v : min);
    if (input.value !== s) input.value = s;
    setAttrs(input, { value: s });
    setText(hint, str(p.hint) ?? "");
    syncChildren(el, [el.firstChild!, input, ...(str(p.hint) ? [hint] : [])]);
  };
  const apply = (next: DomContext) => {
    c = next;
    own.sync(c);
    reset.sync(c);
    draw();
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

export const Code: DomRenderer = (ctx) => {
  let c = ctx;
  let copied = false;
  const title = h("span");
  const copy = h("button", { type: "button", class: "gistui-code__copy" });
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(str(c.props.code) ?? "").then(() => {
      copied = true;
      draw();
      setTimeout(() => {
        copied = false;
        draw();
      }, 1500);
    });
  });
  const code = h("code");
  const pre = h("pre", null, code);
  const numbers = h("span", { class: "gistui-code__lines", "aria-hidden": "true" });
  const body = h("div", { class: "gistui-code__body" });
  const el = h("figure", { class: "gistui-code", "data-gistui": "Code" }, h("figcaption", { class: "gistui-code__bar" }, title, copy), body);
  let shown: string | null = null;
  let shownLang: string | undefined;
  let wasCopied: boolean | null = null;
  let dead = false;
  const draw = () => {
    if (dead) return;
    const src = str(c.props.code) ?? "";
    const lang = str(c.props.lang);
    setText(title, str(c.props.title) ?? (lang ? langOf(lang).toUpperCase() : ""));
    if (copied !== wasCopied) {
      wasCopied = copied;
      setAttrs(copy, { "aria-label": copied ? "Copied" : "Copy code" });
      syncChildren(copy, [iconEl(copied ? "check" : "file-text")!, document.createTextNode(copied ? "Copied" : "Copy")]);
    }
    setAttrs(code, { "data-lang": lang });
    // Highlighted again only when the source or the language changed (as React's `useMemo`), not on
    // every draw: a title, the copy button or the end of the stream leave the tokens alone.
    if (src !== shown || lang !== shownLang) {
      shown = src;
      shownLang = lang;
      syncChildren(
        code,
        highlight(src, lang).map((t) => (t.kind ? h("span", { class: `tok-${t.kind}` }, t.text) : document.createTextNode(t.text))),
      );
    }
    const lines = c.props.numbered === true ? src.split("\n").length : 0;
    if (lines > 0) setText(numbers, Array.from({ length: lines }, (_, i) => `${i + 1}\n`).join(""));
    syncChildren(body, lines > 0 ? [numbers, pre] : [pre]);
  };
  draw();
  return {
    el,
    update(next) {
      c = next;
      draw();
      return true;
    },
    destroy: () => void (dead = true),
  };
};

type Katex = { renderToString(tex: string, o: Record<string, unknown>): string };
let katex: Katex | null = null;
let katexFailed = false;
let katexLoading: Promise<unknown> | null = null;
const loadKatex = () =>
  (katexLoading ??= import("katex").then(
    (m) => (katex = ((m as { default?: Katex }).default ?? m) as Katex),
    () => (katexFailed = true),
  ));

export const MathView: DomRenderer = (ctx) => {
  let c = ctx;
  const inline0 = ctx.props.inline === true;
  const el = h(inline0 ? "span" : "div", { class: "gistui-math", "data-gistui": "Math" });
  let dead = false;
  let drawn: string | null = null;
  const draw = () => {
    // The KaTeX chunk can arrive after this component is gone.
    if (dead) return;
    const tex = str(c.props.tex) ?? "";
    const inline = c.props.inline === true;
    let html: string | null = null;
    if (katex) {
      try {
        // MathML output: rendered by the browser, no fonts or stylesheet needed. KaTeX escapes input.
        // Program input is untrusted: no \href or \includegraphics, bounded sizes and macro expansion.
        html = katex.renderToString(tex, { output: "mathml", displayMode: !inline, throwOnError: false, trust: false, maxSize: 50, maxExpand: 1000, strict: "ignore" });
      } catch {
        html = null;
      }
    } else void loadKatex().then(draw);
    setAttrs(el, { "data-inline": flag(inline), "data-loading": flag(!html && !katexFailed) });
    // Written only when it changed (a redraw with the same formula leaves the MathML alone).
    const next = html ?? `\u0000${tex}`;
    if (next === drawn) return;
    drawn = next;
    if (html) el.innerHTML = html;
    else syncChildren(el, [h("code", null, tex)]);
  };
  draw();
  return {
    el,
    update(next) {
      if ((next.props.inline === true) !== inline0) return false;
      c = next;
      draw();
      return true;
    },
    destroy: () => void (dead = true),
  };
};

type Mermaid = { render: (id: string, src: string) => Promise<{ svg: string }>; initialize: (o: unknown) => void };
let mermaid: Mermaid | null = null;
let mermaidFailed = false;
let mermaidLoading: Promise<unknown> | null = null;
// Mermaid is large: its own chunk, fetched the first time a diagram appears. Always the bundled
// module: a `window.mermaid` could be anything (another version, or not Mermaid at all).
const loadMermaid = () =>
  (mermaidLoading ??= (async () => {
    const m = await import("mermaid");
    return (mermaid = (m.default ?? m) as unknown as Mermaid);
  })().catch(() => (mermaidFailed = true)));

/** A token as a plain colour Mermaid can parse (tokens use `color-mix()`): resolved, then read back. */
function plainColor(el: HTMLElement, token: string, fallback: string): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${token}, ${fallback})`;
    probe.style.display = "none";
    el.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return fallback;
    g.fillStyle = resolved;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return a === 255 ? `#${hex(r!)}${hex(gg!)}${hex(b!)}` : `rgba(${r}, ${gg}, ${b}, ${(a! / 255).toFixed(3)})`;
  } catch {
    return fallback;
  }
}

/** Mermaid's theme from GistUI's tokens, so diagrams follow light/dark and the accent colour. */
function themeFrom(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => (name === "--gistui-font" ? cs.getPropertyValue(name).trim() || fallback : plainColor(el, name, fallback));
  const dark = el.closest("[data-gistui-theme]")?.getAttribute("data-gistui-theme") === "dark" || (cs.colorScheme ?? "").includes("dark");
  return {
    theme: "base",
    darkMode: dark,
    fontFamily: v("--gistui-font", "system-ui, sans-serif"),
    primaryColor: v("--gistui-accent-soft", "#e8f0fe"),
    primaryBorderColor: v("--gistui-accent", "#2a78d6"),
    primaryTextColor: v("--gistui-fg", "#111"),
    secondaryColor: v("--gistui-surface-sunk", "#f4f4f5"),
    tertiaryColor: v("--gistui-surface", "#fff"),
    lineColor: v("--gistui-fg-subtle", "#999"),
    textColor: v("--gistui-fg", "#111"),
    mainBkg: v("--gistui-accent-soft", "#e8f0fe"),
    nodeBorder: v("--gistui-accent", "#2a78d6"),
    clusterBkg: v("--gistui-surface-sunk", "#f4f4f5"),
    edgeLabelBackground: v("--gistui-surface", "#fff"),
    fontSize: "14px",
  };
}

let diagramSeq = 0;

export const Diagram: DomRenderer = (ctx) => {
  let c = ctx;
  const el = h("figure", { class: "gistui-diagram", "data-gistui": "Diagram" });
  const title = h("figcaption", { class: "gistui-diagram__title" });
  const box = h("div", { class: "gistui-diagram__svg" });
  const src = h("pre", { class: "gistui-diagram__src" });
  const loading = h("div", { class: "gistui-skeleton gistui-diagram__loading", "aria-busy": "true", "aria-label": "Drawing diagram" });
  let svg: string | null = null;
  let boxed: string | null = null;
  let error = false;
  let drawn = "";
  let live = 0;
  let dead = false;
  const draw = () => {
    // The Mermaid chunk (or a drawing in progress) can finish after this component is gone.
    if (dead) return;
    const source = str(c.props.source) ?? "";
    if (!mermaid && !mermaidFailed) void loadMermaid().then(draw);
    if (mermaid && !c.streaming && source && source !== drawn) {
      drawn = source;
      const run = ++live;
      try {
        // `suppressErrorRendering`: a diagram that cannot be parsed must not leave Mermaid's error graphic in <body>.
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "base", themeVariables: themeFrom(el), flowchart: { curve: "basis", padding: 12 } });
        mermaid
          .render(`gistui-diagram-${++diagramSeq}`, source)
          .then((r) => {
            if (run !== live) return;
            svg = r.svg;
            error = false;
            draw();
          })
          .catch(() => {
            if (run !== live) return;
            error = true;
            draw();
          });
      } catch {
        error = true;
      }
    }
    setAttrs(el, { "data-state": svg && !error ? "ready" : mermaidFailed || error ? "source" : "loading" });
    setText(title, str(c.props.title) ?? "");
    const parts: Node[] = [];
    if (str(c.props.title)) parts.push(title);
    if (svg && !error) {
      // The drawing is parsed once, not on every draw.
      if (svg !== boxed) box.innerHTML = boxed = svg;
      parts.push(box);
    } else if (mermaidFailed || error) {
      setText(src, source);
      parts.push(src);
    } else parts.push(loading);
    syncChildren(el, parts);
  };
  draw();
  return {
    el,
    update(next) {
      c = next;
      draw();
      return true;
    },
    destroy() {
      dead = true;
      live = -1;
    },
  };
};

const YOUTUBE = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIMEO = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/**
 * YouTube and Vimeo become privacy-friendly embeds; other https URLs play in a <video>. Decided by
 * the URL's host, never by a substring ("https://evil.example/?u=youtube.com/watch?v=…" is not YouTube).
 */
export function embedOf(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (YOUTUBE.has(host)) {
    const id = host === "youtu.be" ? path.slice(1).split("/")[0] : path === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([^/]+)/.exec(path)?.[1];
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (VIMEO.has(host)) {
    const id = /^\/(?:video\/)?(\d+)/.exec(path)?.[1];
    return id ? `https://player.vimeo.com/video/${id}?dnt=1` : null;
  }
  return null;
}

/**
 * The player keeps its element: an `<iframe>` or `<video>` that is replaced starts over (an embed
 * reloads, a playing video stops), so a redraw only patches its attributes, and `src` only when the
 * address changed.
 */
export const Video: DomRenderer = (ctx) => {
  const el = h("figure", { class: "gistui-video", "data-gistui": "Video" });
  const frame = h("div", { class: "gistui-video__frame" });
  const caption = h("figcaption", { class: "gistui-video__title" });
  let media: HTMLIFrameElement | HTMLVideoElement | null = null;
  const apply = (c: DomContext) => {
    const src = safeUrl(c.props.src);
    const title = str(c.props.title);
    setStyle(el, { "--gistui-ratio": ratioOf(c.props.ratio) ?? "16 / 9" });
    setAttrs(el, { hidden: !src });
    if (!src) {
      media = null;
      syncChildren(frame, []);
      syncChildren(el, []);
      return;
    }
    const embed = embedOf(src);
    if (!media || (media instanceof HTMLIFrameElement) !== Boolean(embed)) media = embed ? h("iframe") : h("video");
    // An embed is sandboxed. Its referrer stays the page's origin (no path): YouTube refuses to play
    // with none (its error 153). A file sends no referrer at all.
    if (media instanceof HTMLIFrameElement) setAttrs(media, { src: embed, title: title ?? "Video", loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-presentation", allow: "encrypted-media; picture-in-picture; fullscreen", referrerpolicy: "strict-origin-when-cross-origin" });
    else setAttrs(media, { src, controls: true, preload: "metadata", poster: safeUrl(c.props.poster), ...NO_REFERRER });
    setText(caption, title ?? "");
    syncChildren(frame, [media]);
    syncChildren(el, title ? [frame, caption] : [frame]);
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export const Avatar: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-avatar", "data-gistui": "Avatar" });
  const pic = h("span", { class: "gistui-avatar__pic", "aria-hidden": "true" });
  const letters = document.createTextNode("");
  const nameEl = h("span", { class: "gistui-avatar__name" });
  const subEl = h("span", { class: "gistui-avatar__sub" });
  const text = h("span", { class: "gistui-avatar__text" }, nameEl);
  el.append(pic, text);
  // The picture is loaded once per address; if it cannot be loaded, the initials show.
  let img: HTMLImageElement | null = null;
  let shown: string | undefined;
  let broken = false;
  const apply = (c: DomContext) => {
    const name = str(c.props.name) ?? "";
    const src = safeUrl(c.props.src);
    setAttrs(el, { "data-size": str(c.props.size) });
    // A stable hue per name, so initials read as different people.
    const hue = [...name].reduce((hh, ch) => (hh * 31 + ch.charCodeAt(0)) % 360, 7);
    setAttrs(pic, { style: `--gistui-avatar-hue:${hue}` });
    letters.data = initials(name);
    if (src !== shown) {
      shown = src;
      broken = false;
      img = src ? h("img", { src, alt: "", loading: "lazy", ...NO_REFERRER }) : null;
      const mine = img;
      img?.addEventListener("error", () => {
        if (img !== mine) return;
        broken = true;
        syncChildren(pic, [letters]);
      });
    }
    syncChildren(pic, [img && !broken ? img : letters]);
    const sub = str(c.props.subtitle);
    setText(nameEl, name);
    setText(subEl, sub ?? "");
    syncChildren(text, sub ? [nameEl, subEl] : [nameEl]);
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

export const KeyValue = view("dl", { class: "gistui-kv", "data-gistui": "KeyValue" }, (c, el) => {
  const data = c.props.data;
  let pairs: [string, string][];
  if (data && typeof data === "object" && !Array.isArray(data) && !("columns" in (data as object))) {
    pairs = Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]);
  } else {
    const t = normalizeTable(data as Data);
    // A two-column table reads as rows of key/value; a one-row table reads as header/value.
    pairs = t.columns.length === 2 || t.text.length !== 1 ? t.text.map((r) => [r[0] ?? "", r[1] ?? ""]) : t.columns.map((col, i) => [col.name, t.text[0]![i] ?? ""]);
  }
  setStyle(el, { "--gistui-cols": Math.max(1, Math.min(4, Math.round(num(c.props.cols) ?? 1))) });
  return pairs.map(([k, v]) => h("div", { class: "gistui-kv__row" }, h("dt", null, k), h("dd", null, v)));
});

export const Pricing: DomRenderer = (ctx) => {
  let c = ctx;
  const el = h("div", { class: "gistui-pricing", "data-gistui": "Pricing" });
  // A plan keeps its section and its button (by plan name): a click that changes the program (the
  // highlighted plan, say) leaves the focus on the button that was pressed.
  const plans = keep<{ section: HTMLElement; button: HTMLButtonElement; says: string }>();
  const apply = (next: DomContext) => {
    c = next;
    const t = normalizeTable(c.props.data as Data);
    const col = (re: RegExp, fallback: number) => {
      const i = t.columns.findIndex((x) => re.test(x.name));
      return i >= 0 ? i : fallback;
    };
    const [ci, pi, periodI, fi, ni] = [col(/plan|name|tier/i, 0), col(/price|cost/i, 1), col(/period|per|billing/i, -1), col(/feature/i, -1), col(/note|desc/i, -1)];
    const featuredName = str(c.props.highlight)?.toLowerCase();
    const cta = str(c.props.cta) ?? "Choose";
    syncChildren(
      el,
      t.text.map((r) => {
        const plan = r[ci] ?? "";
        const featured = featuredName ? plan.toLowerCase() === featuredName : false;
        const features = fi >= 0 ? (r[fi] ?? "").split(/\s*[;•]\s*/).filter(Boolean) : [];
        const p = plans.get(plan, () => {
          const made = { section: h("section", { class: "gistui-pricing__plan" }), button: h("button", { type: "button", class: "gistui-button" }), says: "" };
          made.button.addEventListener("click", () => {
            const steps = c.node.dyn?.do;
            if (steps) c.run(steps);
            else c.emit({ type: "send", message: made.says, nodeId: c.node.id });
          });
          return made;
        });
        p.says = `${cta} ${plan}`;
        setAttrs(p.button, { "data-v": featured ? "primary" : "secondary", "data-full": "", disabled: c.locked });
        setText(p.button, p.says);
        setAttrs(p.section, { "data-featured": flag(featured) });
        syncChildren(
          p.section,
          [
            featured ? h("span", { class: "gistui-pricing__badge" }, "Popular") : null,
            h("h3", { class: "gistui-pricing__name" }, plan),
            h("div", { class: "gistui-pricing__price" }, h("span", null, r[pi] ?? ""), periodI >= 0 && r[periodI] ? h("small", null, `/${r[periodI]!.replace(/^\/|^per\s+/i, "")}`) : null),
            ni >= 0 && r[ni] ? h("p", { class: "gistui-pricing__note" }, r[ni]!) : null,
            features.length ? h("ul", { class: "gistui-pricing__features" }, ...features.map((f) => h("li", null, iconEl("check"), f))) : null,
            p.button,
          ].filter((x): x is HTMLElement => x !== null),
        );
        return p.section;
      }),
    );
    plans.prune();
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

export const Hero: DomRenderer = (ctx) => {
  let c = ctx;
  const el = h("section", { class: "gistui-hero", "data-gistui": "Hero" });
  const text = h("div", { class: "gistui-hero__text" });
  const eyebrow = h("span", { class: "gistui-hero__eyebrow" });
  const title = h("h1", { class: "gistui-hero__title" });
  const subtitle = h("p", { class: "gistui-hero__subtitle" });
  const media = h("div", { class: "gistui-hero__media" });
  // The call to action and the picture keep their elements: a redraw must not take the focus off
  // the button or load the picture again.
  let action: HTMLAnchorElement | HTMLButtonElement | null = null;
  let says: string | null = null;
  let img: HTMLImageElement | null = null;
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const image = safeUrl(p.image);
    const href = safeUrl(p.href);
    const cta = str(p.cta);
    setAttrs(el, { "data-align": str(p.align) ?? (image ? "start" : "center"), "data-image": mark(image) });
    c.design(el);
    setText(eyebrow, str(p.eyebrow) ?? "");
    setText(title, str(p.title) ?? "");
    setText(subtitle, str(p.subtitle) ?? "");
    if (cta) {
      if (!action || (action instanceof HTMLAnchorElement) !== Boolean(href)) {
        says = null;
        if (href) action = h("a", { class: "gistui-button", "data-v": "primary", "data-size": "lg" });
        else {
          action = h("button", { type: "button", class: "gistui-button", "data-v": "primary", "data-size": "lg" });
          action.addEventListener("click", () => {
            const steps = c.node.dyn?.do;
            if (steps) c.run(steps);
            else c.emit({ type: "send", message: str(c.props.cta) ?? "", nodeId: c.node.id });
          });
        }
      }
      if (action instanceof HTMLAnchorElement) setAttrs(action, { href, target: "_blank", rel: "noopener noreferrer" });
      // Locked while the program streams, like Button.
      else setAttrs(action, { disabled: c.locked, "data-locked": flag(c.locked) });
      if (cta !== says) {
        says = cta;
        syncChildren(action, [document.createTextNode(cta), iconEl("arrow-right")!]);
      }
    } else action = null;
    syncChildren(text, [...(str(p.eyebrow) ? [eyebrow] : []), title, ...(str(p.subtitle) ? [subtitle] : []), ...(action ? [action] : [])]);
    if (image) {
      if (!img) img = h("img", { src: image, alt: "", loading: "lazy", ...NO_REFERRER });
      else setAttrs(img, { src: image });
      syncChildren(media, [img]);
    }
    syncChildren(el, image ? [text, media] : [text]);
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
