/**
 * Less common components, in their own lazily loaded chunk: Slider, Code, Math, Diagram,
 * Video, Avatar, KeyValue, Pricing and Hero.
 *
 * - Math renders TeX with KaTeX as MathML (no fonts or CSS to load); KaTeX is its own chunk.
 * - Diagram renders Mermaid, loaded as its own chunk the first time a diagram appears, themed from
 *   GistUI's tokens; if it cannot load or parse, the source is shown.
 */

import type { TableData } from "@gistui/core";
import { normalizeTable } from "@gistui/headless";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useEmit, useIsStreaming, useLocked, useRun } from "../context";
import { useDesign } from "../design";
import { lazyModule, num, safeUrl, str, useBinding, useLazyModule } from "../hooks";
import type { ComponentProps } from "../library";
import { ratioOf } from "./content";
import { useOwnValue } from "./form";
import { highlight, langOf } from "@gistui/headless/highlight";
import { IconSvg } from "./icon";

type Data = TableData | readonly unknown[] | null | undefined;

// ─── Forms ──────────────────────────────────────────────────────────────

export function Slider({ node, props }: ComponentProps): ReactNode {
  const id = useId();
  const locked = useLocked(node);
  const min = num(props.min) ?? 0;
  const max = num(props.max) ?? 100;
  const step = num(props.step) ?? (max - min > 20 ? 1 : (max - min) / 100);
  const b = useBinding(node);
  const [own, setOwn] = useOwnValue(num(props.value) ?? min);
  const value = b.bound ? (typeof b.value === "number" ? b.value : Number(b.value ?? min)) : own;
  const set = (v: number) => (b.bound ? b.set(v) : setOwn(v));
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  const unit = str(props.unit) ?? "";
  return (
    <div className="gistui-field gistui-slider" data-gistui="Slider" style={{ "--gistui-fill": `${pct}%` } as CSSProperties}>
      <div className="gistui-slider__head">
        <label className="gistui-field__label" htmlFor={id}>
          {str(props.label)}
        </label>
        <output className="gistui-slider__value" htmlFor={id}>
          {Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="gistui-slider__input"
        name={str(props.name)}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        disabled={locked}
        onChange={(e) => set(Number(e.target.value))}
      />
      {str(props.hint) && <span className="gistui-field__hint">{str(props.hint)}</span>}
    </div>
  );
}

// ─── Content ────────────────────────────────────────────────────────────

export function Code({ props }: ComponentProps): ReactNode {
  const code = str(props.code) ?? "";
  const lang = str(props.lang);
  const tokens = useMemo(() => highlight(code, lang), [code, lang]);
  const [copied, setCopied] = useState(false);
  const title = str(props.title) ?? (lang ? langOf(lang).toUpperCase() : undefined);
  const lines = props.numbered === true ? code.split("\n").length : 0;
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <figure className="gistui-code" data-gistui="Code">
      <figcaption className="gistui-code__bar">
        <span>{title}</span>
        <button type="button" className="gistui-code__copy" onClick={copy} aria-label={copied ? "Copied" : "Copy code"}>
          <IconSvg name={copied ? "check" : "file-text"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <div className="gistui-code__body">
        {lines > 0 && (
          <span className="gistui-code__lines" aria-hidden>
            {Array.from({ length: lines }, (_, i) => `${i + 1}\n`).join("")}
          </span>
        )}
        <pre>
          <code data-lang={lang}>
            {tokens.map((t, i) => (t.kind ? <span key={i} className={`tok-${t.kind}`}>{t.text}</span> : t.text))}
          </code>
        </pre>
      </div>
    </figure>
  );
}

const katexModule = lazyModule(() => import("katex").then((m) => m.default ?? m));

export function MathView({ props }: ComponentProps): ReactNode {
  const tex = str(props.tex) ?? "";
  const inline = props.inline === true;
  const { value: katex, failed } = useLazyModule(katexModule);
  const html = useMemo(() => {
    if (!katex) return null;
    try {
      // MathML output: rendered by the browser, no fonts or stylesheet needed. KaTeX escapes input.
      // Program input is untrusted: no \href or \includegraphics, bounded sizes and macro expansion.
      return katex.renderToString(tex, { output: "mathml", displayMode: !inline, throwOnError: false, trust: false, maxSize: 50, maxExpand: 1000, strict: "ignore" });
    } catch {
      return null;
    }
  }, [katex, tex, inline]);
  const Tag = inline ? "span" : "div";
  if (!html) {
    return (
      <Tag className="gistui-math" data-gistui="Math" data-inline={inline || undefined} data-loading={!failed || undefined}>
        <code>{tex}</code>
      </Tag>
    );
  }
  return <Tag className="gistui-math" data-gistui="Math" data-inline={inline || undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

type Mermaid = { render: (id: string, src: string) => Promise<{ svg: string }>; initialize: (c: unknown) => void };

// Mermaid is large, so it is its own chunk, fetched the first time a diagram appears. Always the
// bundled module: a `window.mermaid` could be anything (another version, or not Mermaid at all).
const mermaidModule = lazyModule(async (): Promise<Mermaid> => {
  const m = await import("mermaid");
  return (m.default ?? m) as unknown as Mermaid;
});

/**
 * A token as a plain colour Mermaid can parse: tokens use `color-mix()`, so the browser resolves it
 * (a probe element) and a canvas normalises it to hex/rgba.
 */
function plainColor(el: HTMLElement, token: string, fallback: string): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${token}, ${fallback})`;
    probe.style.display = "none";
    el.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    // Paint one pixel and read it back: plain RGB whatever the notation (color-mix, color(srgb …)).
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return a === 255 ? `#${hex(r!)}${hex(g!)}${hex(b!)}` : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`;
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

export function Diagram({ props }: ComponentProps): ReactNode {
  const source = str(props.source) ?? "";
  const streaming = useIsStreaming();
  const box = useRef<HTMLElement>(null);
  const { value: mermaid, failed } = useLazyModule(mermaidModule);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!mermaid || streaming || !source || !el) return;
    let live = true;
    let rendering: Promise<{ svg: string }>;
    try {
      // `suppressErrorRendering`: a diagram that cannot be parsed must not leave Mermaid's error graphic in <body>.
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "base", themeVariables: themeFrom(el), flowchart: { curve: "basis", padding: 12 } });
      rendering = mermaid.render(`gistui-diagram-${++diagramSeq}`, source);
    } catch {
      setError(true);
      return;
    }
    rendering
      .then((r) => {
        if (!live) return;
        setSvg(r.svg);
        setError(false);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [mermaid, source, streaming]);
  const showSource = !svg || error;
  return (
    <figure ref={box} className="gistui-diagram" data-gistui="Diagram" data-state={svg && !error ? "ready" : failed || error ? "source" : "loading"}>
      {str(props.title) && <figcaption className="gistui-diagram__title">{str(props.title)}</figcaption>}
      {svg && !error && <div className="gistui-diagram__svg" dangerouslySetInnerHTML={{ __html: svg }} />}
      {showSource && (failed || error ? <pre className="gistui-diagram__src">{source}</pre> : <div className="gistui-skeleton gistui-diagram__loading" aria-busy="true" aria-label="Drawing diagram" />)}
    </figure>
  );
}

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

export function Video({ props }: ComponentProps): ReactNode {
  const src = safeUrl(props.src);
  const title = str(props.title);
  const ratio = ratioOf(props.ratio) ?? "16 / 9";
  if (!src) return null;
  const embed = embedOf(src);
  return (
    <figure className="gistui-video" data-gistui="Video" style={{ "--gistui-ratio": ratio } as CSSProperties}>
      <div className="gistui-video__frame">
        {embed ? (
          // The referrer stays the page's origin (no path): YouTube refuses to play with none (its error 153).
          <iframe
            src={embed}
            title={title ?? "Video"}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video src={src} controls preload="metadata" poster={safeUrl(props.poster)} {...NO_REFERRER} />
        )}
      </div>
      {title && <figcaption className="gistui-video__title">{title}</figcaption>}
    </figure>
  );
}

/** `referrerpolicy` on a <video> (React's types only know it on <img>, <a>, <iframe>…). */
const NO_REFERRER = { referrerPolicy: "no-referrer" } as Record<string, string>;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Avatar({ props }: ComponentProps): ReactNode {
  const name = str(props.name) ?? "";
  const src = safeUrl(props.src);
  const [broken, setBroken] = useState(false);
  // A stable hue per name, so initials read as different people.
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div className="gistui-avatar" data-gistui="Avatar" data-size={str(props.size)}>
      <span className="gistui-avatar__pic" style={{ "--gistui-avatar-hue": hue } as CSSProperties} aria-hidden>
        {src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : initials(name)}
      </span>
      <span className="gistui-avatar__text">
        <span className="gistui-avatar__name">{name}</span>
        {str(props.subtitle) && <span className="gistui-avatar__sub">{str(props.subtitle)}</span>}
      </span>
    </div>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────

export function KeyValue({ props }: ComponentProps): ReactNode {
  const data = props.data;
  const pairs: [string, string][] = useMemo(() => {
    if (data && typeof data === "object" && !Array.isArray(data) && !("columns" in (data as object))) {
      return Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]);
    }
    const t = normalizeTable(data as Data);
    // A two-column table reads as rows of key/value; a one-row table reads as header/value.
    if (t.columns.length === 2 || t.text.length !== 1) return t.text.map((r) => [r[0] ?? "", r[1] ?? ""]);
    return t.columns.map((c, i) => [c.name, t.text[0]![i] ?? ""]);
  }, [data]);
  const cols = Math.max(1, Math.min(4, Math.round(num(props.cols) ?? 1)));
  return (
    <dl className="gistui-kv" data-gistui="KeyValue" style={{ "--gistui-cols": cols } as CSSProperties}>
      {pairs.map(([k, v], i) => (
        <div key={i} className="gistui-kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pricing({ node, props }: ComponentProps): ReactNode {
  const emit = useEmit();
  const run = useRun();
  const locked = useLocked(node);
  const t = normalizeTable(props.data as Data);
  const col = (re: RegExp, fallback: number) => {
    const i = t.columns.findIndex((c) => re.test(c.name));
    return i >= 0 ? i : fallback;
  };
  const [ci, pi, periodI, fi, ni] = [col(/plan|name|tier/i, 0), col(/price|cost/i, 1), col(/period|per|billing/i, -1), col(/feature/i, -1), col(/note|desc/i, -1)];
  const highlight = str(props.highlight)?.toLowerCase();
  const cta = str(props.cta) ?? "Choose";
  const steps = node.dyn?.do;
  return (
    <div className="gistui-pricing" data-gistui="Pricing">
      {t.text.map((r, i) => {
        const plan = r[ci] ?? "";
        const featured = highlight ? plan.toLowerCase() === highlight : false;
        const features = fi >= 0 ? (r[fi] ?? "").split(/\s*[;•]\s*/).filter(Boolean) : [];
        return (
          <section key={i} className="gistui-pricing__plan" data-featured={featured || undefined}>
            {featured && <span className="gistui-pricing__badge">Popular</span>}
            <h3 className="gistui-pricing__name">{plan}</h3>
            <div className="gistui-pricing__price">
              <span>{r[pi]}</span>
              {periodI >= 0 && r[periodI] && <small>/{r[periodI]!.replace(/^\/|^per\s+/i, "")}</small>}
            </div>
            {ni >= 0 && r[ni] && <p className="gistui-pricing__note">{r[ni]}</p>}
            {features.length > 0 && (
              <ul className="gistui-pricing__features">
                {features.map((f, j) => (
                  <li key={j}>
                    <IconSvg name="check" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="gistui-button"
              data-v={featured ? "primary" : "secondary"}
              data-full=""
              disabled={locked}
              onClick={() => (steps ? run(steps, node.id) : emit({ type: "send", message: `${cta} ${plan}`, nodeId: node.id }))}
            >
              {cta} {plan}
            </button>
          </section>
        );
      })}
    </div>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────

export function Hero({ node, props }: ComponentProps): ReactNode {
  const emit = useEmit();
  const run = useRun();
  const image = safeUrl(props.image);
  const href = safeUrl(props.href);
  const cta = str(props.cta);
  const steps = node.dyn?.do;
  const locked = useLocked(node);
  const d = useDesign("Hero", props);
  return (
    <section className={d.className ? `gistui-hero ${d.className}` : "gistui-hero"} style={d.style} {...d.attrs} data-gistui="Hero" data-align={str(props.align) ?? (image ? "start" : "center")} data-image={image ? "" : undefined}>
      <div className="gistui-hero__text">
        {str(props.eyebrow) && <span className="gistui-hero__eyebrow">{str(props.eyebrow)}</span>}
        <h1 className="gistui-hero__title">{str(props.title)}</h1>
        {str(props.subtitle) && <p className="gistui-hero__subtitle">{str(props.subtitle)}</p>}
        {cta &&
          (href ? (
            <a className="gistui-button" data-v="primary" data-size="lg" href={href} target="_blank" rel="noopener noreferrer">
              {cta}
              <IconSvg name="arrow-right" />
            </a>
          ) : (
            <button
              type="button"
              className="gistui-button"
              data-v="primary"
              data-size="lg"
              disabled={locked}
              data-locked={locked || undefined}
              onClick={() => (steps ? run(steps, node.id) : emit({ type: "send", message: cta, nodeId: node.id }))}
            >
              {cta}
              <IconSvg name="arrow-right" />
            </button>
          ))}
      </div>
      {image && (
        <div className="gistui-hero__media">
          <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      )}
    </section>
  );
}

