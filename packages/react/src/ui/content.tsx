import type { MarkdownProps } from "@gistui/widgets";
import { createMarkdown, defaultSafeUrl } from "@gistui/widgets/markdown";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useEmit, useEngine, useLocked } from "../context";
import { useDesign } from "../design";
import { cx, num, safeUrl, str, useWidget } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { useLightbox } from "./zoom";

/** "+12%" → up, "−3" → down: the direction a signed value shows. */
export function trendOf(v: string | undefined): "up" | "down" | undefined {
  if (!v) return undefined;
  const d = v.trim();
  if (/^[+↑▲]/.test(d)) return "up";
  if (/^[-−↓▼]\s*\d/.test(d) || /^[↓▼]/.test(d)) return "down";
  return undefined;
}

/** Streaming Markdown: the widget re-renders only the last block, outside React's reconciliation. */
export function Markdown({ content, streaming }: { content: string; streaming: boolean }): ReactNode {
  const { runtime } = useEngine();
  const text = useRef(content);
  text.current = content;
  // An image loads by itself, so it follows the URL policy (allowed hosts; nothing assembled from data).
  const isSafeUrl = useCallback((url: string, kind: "link" | "image") => defaultSafeUrl(url, kind) && (kind === "link" || runtime.loads(url, text.current)), [runtime]);
  const ref = useWidget<MarkdownProps>(createMarkdown, { content, streaming, isSafeUrl });
  return <div ref={ref} />;
}

export function Text({ node, props }: ComponentProps): ReactNode {
  const d = useDesign("Text", props);
  return (
    <div
      className={cx("gistui-text", d.className)}
      style={d.style}
      {...d.attrs}
      data-gistui="Text"
      data-size={str(props.size)}
      data-muted={props.muted === true || undefined}
      data-text-align={str(props.align)}
      data-streaming={node.partial || undefined}
    >
      <Markdown content={str(props.content) ?? ""} streaming={node.partial} />
    </div>
  );
}

const TONE_ICON: Record<string, string> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  danger: "alert-circle",
  neutral: "info",
  accent: "sparkles",
};

export function Callout({ node, props }: ComponentProps): ReactNode {
  const d = useDesign("Callout", props);
  const title = str(props.title);
  const tone = str(props.tone) ?? "info";
  const v = str(props.v);
  const icon = str(props.icon) ?? (v === "bar" ? undefined : TONE_ICON[tone]);
  return (
    <div className={cx("gistui-callout", d.className)} style={d.style} {...d.attrs} data-gistui="Callout" data-tone={tone} data-v={v} role="note">
      {icon && (
        <span className="gistui-callout__icon">
          <IconSvg name={icon} />
        </span>
      )}
      <div className="gistui-callout__body">
        {title && <div className="gistui-callout__title">{title}</div>}
        <Markdown content={str(props.content) ?? ""} streaming={node.partial} />
      </div>
    </div>
  );
}

export function Tag({ props }: ComponentProps): ReactNode {
  const d = useDesign("Tag", props);
  return (
    <span className={cx("gistui-tag", d.className)} style={d.style} {...d.attrs} data-gistui="Tag" data-tone={str(props.tone) ?? "neutral"} data-shape={props.pill ? "pill" : undefined}>
      {str(props.icon) && <IconSvg name={str(props.icon)} />}
      {str(props.label)}
    </span>
  );
}

export function Tags({ children }: ComponentProps): ReactNode {
  return (
    <div className="gistui-tags" data-gistui="Tags">
      {children}
    </div>
  );
}

/** Fades an image in once it has loaded (also when it was already cached). */
export function FadeImg({ src, alt }: { src: string; alt: string }): ReactNode {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(Boolean(ref.current?.complete && ref.current.naturalWidth));
  }, [src]);
  // No referrer: a program picks the URL, and the page's address is not its host's business.
  return <img ref={ref} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-loaded={loaded || undefined} onLoad={() => setLoaded(true)} />;

}

export function ratioOf(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return `${m[1]} / ${m[2]}`;
  const named: Record<string, string> = { square: "1 / 1", wide: "16 / 9", portrait: "3 / 4", landscape: "4 / 3", ultrawide: "21 / 9" };
  return named[s];
}

export function Image({ props }: ComponentProps): ReactNode {
  const d = useDesign("Image", props);
  const src = safeUrl(props.src);
  const caption = str(props.caption);
  const zoom = props.zoom === true;
  const { open, element } = useLightbox(src ? [{ src, caption, alt: str(props.alt) }] : []);
  if (!src) return null;
  const ratio = ratioOf(props.ratio);
  const img = <FadeImg src={src} alt={str(props.alt) ?? caption ?? ""} />;
  return (
    <figure className={cx("gistui-image", d.className)} data-gistui="Image" data-ratio={ratio ? "" : undefined} style={{ ...(ratio ? ({ "--gistui-ratio": ratio } as CSSProperties) : {}), ...d.style }} {...d.attrs}>
      {zoom ? (
        <button type="button" className="gistui-image__frame gistui-image__zoom" onClick={() => open(0)} aria-label={caption ? `Open ${caption}` : "Open image"}>
          {img}
          <span className="gistui-gallery__zoom" aria-hidden>
            <IconSvg name="search" />
          </span>
        </button>
      ) : (
        <div className="gistui-image__frame">{img}</div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
      {element}
    </figure>
  );
}

export function FollowUps({ node, props }: ComponentProps): ReactNode {
  const emit = useEmit();
  const locked = useLocked(node);
  const items = Array.isArray(props.items) ? props.items.filter((x): x is string => typeof x === "string" && x !== "") : [];
  return (
    <div className="gistui-followups" data-gistui="FollowUps">
      {items.map((q, i) => (
        <button
          key={`${i}:${q}`}
          type="button"
          className="gistui-followup"
          disabled={locked}
          data-locked={locked || undefined}
          onClick={() => emit({ type: "send", message: q, nodeId: node.id })}
        >
          <IconSvg name="arrow-up-right" />
          {q}
        </button>
      ))}
    </div>
  );
}

export function Quote({ props }: ComponentProps): ReactNode {
  const by = str(props.by);
  return (
    <figure className="gistui-quote" data-gistui="Quote">
      <blockquote>{str(props.text)}</blockquote>
      {by && <figcaption>— {by}</figcaption>}
    </figure>
  );
}

export function Icon({ props }: ComponentProps): ReactNode {
  const size = str(props.size);
  // style:{size:40, color:"#fde68a"} sizes and colours a plain icon; on a badge it styles the badge.
  const d = useDesign("Icon", props);
  if (props.plain === true) {
    return (
      <span className={cx("gistui-icon-plain", d.className)} data-gistui="Icon" data-tone={str(props.tone)} style={d.style} {...d.attrs}>
        <IconSvg name={str(props.name)} />
      </span>
    );
  }
  return (
    <span className={cx("gistui-icon-badge", d.className)} data-gistui="Icon" data-tone={str(props.tone)} data-size={size} style={d.style} {...d.attrs}>
      <IconSvg name={str(props.name)} />
    </span>
  );
}
