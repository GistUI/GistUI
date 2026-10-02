/**
 * Rich building blocks: Tile (icon + title + value rows), Media (image cards), Source (citation cards)
 * and Timeline (steps and itineraries from a table).
 */

import type { TableData } from "@gistui/core";
import { normalizeTable } from "@gistui/headless";
import { isGlyph, resolveIcon } from "@gistui/widgets/icons";
import type { CSSProperties, ReactNode } from "react";
import { useIsStreaming, useLocked, useRun, useEngine } from "../context";
import { safeUrl, str } from "../hooks";
import type { ComponentProps } from "../library";
import { FadeImg, Markdown, ratioOf, trendOf } from "./content";
import { IconSvg } from "./icon";
import { useLightbox } from "./zoom";

/** A link, a button (when it has `do:` steps) or a plain element, sharing the same inner content. */
function Interactive({ href, node, className, gistui, extra, onOpen, children }: {
  href: string | undefined;
  node: ComponentProps["node"];
  className: string;
  gistui: string;
  extra?: Record<string, unknown>;
  /** Makes the element a button that calls this (e.g. to open a lightbox). */
  onOpen?: (() => void) | undefined;
  children: ReactNode;
}): ReactNode {
  const run = useRun();
  const locked = useLocked(node);
  const steps = node.dyn?.do;
  if (onOpen) {
    return (
      <button type="button" className={className} data-gistui={gistui} onClick={onOpen} {...extra}>
        {children}
      </button>
    );
  }
  if (href) {
    return (
      <a className={className} data-gistui={gistui} href={href} target="_blank" rel="noopener noreferrer" {...extra}>
        {children}
      </a>
    );
  }
  if (steps) {
    return (
      <button
        type="button"
        className={className}
        data-gistui={gistui}
        disabled={locked}
        data-locked={locked || undefined}
        onClick={() => run(steps, node.id)}
        {...extra}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={className} data-gistui={gistui} {...extra}>
      {children}
    </div>
  );
}

function IconBox({ icon, image, letter, tone }: { icon?: string | undefined; image?: string | undefined; letter?: string | undefined; tone?: string | undefined }): ReactNode {
  if (!icon && !image && !letter) return null;
  const known = icon && (resolveIcon(icon) || isGlyph(icon));
  return (
    <span className="gistui-tile__icon" data-tone={tone} data-letter={!image && !known && letter ? "" : undefined}>
      {image ? <FadeImg src={image} alt="" /> : known ? <IconSvg name={icon} /> : letter}
    </span>
  );
}

export function Tile({ node, props }: ComponentProps): ReactNode {
  const href = safeUrl(props.href);
  const value = str(props.value);
  const note = str(props.note);
  const body = str(props.body);
  const title = str(props.title);
  return (
    <Interactive
      href={href}
      node={node}
      className="gistui-tile"
      gistui="Tile"
      extra={{ "data-v": str(props.v), "data-align": body ? "start" : undefined, "data-wrap": body ? "" : undefined }}
    >
      <IconBox icon={str(props.icon)} image={safeUrl(props.image)} letter={title?.[0]?.toUpperCase()} tone={str(props.tone)} />
      <span className="gistui-tile__main">
        <span className="gistui-tile__title">{title}</span>
        {str(props.subtitle) && <span className="gistui-tile__subtitle">{str(props.subtitle)}</span>}
        {body && (
          <span className="gistui-tile__body">
            <Markdown content={body} streaming={node.partial} />
          </span>
        )}
      </span>
      {(value || note) && (
        <span className="gistui-tile__end">
          {value && (
            <span className="gistui-tile__value" data-trend={props.mono === true ? undefined : trendOf(value)}>
              {value}
            </span>
          )}
          {note && <span className="gistui-tile__note">{note}</span>}
        </span>
      )}
      {href && !value && <IconSvg name="chevron-right" className="gistui-tile__chevron" />}
    </Interactive>
  );
}

export function Media({ node, props }: ComponentProps): ReactNode {
  const src = safeUrl(props.src);
  const href = safeUrl(props.href);
  const tag = str(props.tag);
  const title = str(props.title);
  const subtitle = str(props.subtitle);
  const meta = str(props.meta);
  const ratio = ratioOf(props.ratio);
  const zoom = props.zoom === true && !href && !node.dyn?.do;
  const { open, element } = useLightbox(src ? [{ src, caption: [title, subtitle].filter(Boolean).join(" — ") || undefined }] : []);
  const clickable = Boolean(href || node.dyn?.do);
  // The lightbox renders next to the card, never inside its button (clicks in it would bubble up).
  return (
    <>
    {element}
    <Interactive
      href={href}
      node={node}
      className="gistui-media"
      gistui="Media"
      onOpen={zoom ? () => open(0) : undefined}
      extra={{ "data-v": str(props.v) ?? "below", "data-zoom": zoom || undefined, style: ratio ? ({ "--gistui-ratio": ratio } as CSSProperties) : undefined }}
    >
      <div className="gistui-media__img">{src && <FadeImg src={src} alt={str(props.alt) ?? title ?? ""} />}</div>
      {tag && <span className="gistui-media__tag">{tag}</span>}
      {clickable && (
        <span className="gistui-media__go" aria-hidden>
          <IconSvg name="chevron-right" />
        </span>
      )}
      {(title || subtitle || meta) && (
        <div className="gistui-media__body">
          {title && <span className="gistui-media__title">{title}</span>}
          {subtitle && <span className="gistui-media__subtitle">{subtitle}</span>}
          {meta && <span className="gistui-media__meta">{meta}</span>}
        </div>
      )}
    </Interactive>
    </>
  );
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, "https://x.invalid").hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** A citation card: title and site, linking out. No favicon is fetched (no third-party requests). */
export function Source({ node, props }: ComponentProps): ReactNode {
  const { runtime } = useEngine();
  const href = safeUrl(props.url);
  const host = hostOf(href);
  const title = str(props.title) ?? host ?? "Source";
  const site = str(props.site) ?? host;
  return (
    <Interactive href={href} node={node} className="gistui-tile" gistui="Source" extra={{ "data-v": "card" }}>
      <IconBox icon={str(props.icon)} image={safeUrl(props.image) ?? (str(props.icon) ? undefined : runtime.favicon(host))} letter={(site ?? title)[0]?.toUpperCase()} />
      <span className="gistui-tile__main">
        <span className="gistui-tile__title">{site ?? title}</span>
        {site && <span className="gistui-tile__subtitle">{title}</span>}
      </span>
    </Interactive>
  );
}

type Data = TableData | readonly Record<string, unknown>[] | null | undefined;

/** Steps or an itinerary from a table: |Title|Detail|Meta|State (state: done or current). */
export function Timeline({ props }: ComponentProps): ReactNode {
  const streaming = useIsStreaming();
  const data = props.data as Data;
  if (streaming && !data) return <div className="gistui-skeleton" data-expected="Table" aria-busy="true" />;
  const t = normalizeTable(data);
  const numbered = props.numbered !== false;
  return (
    <ol className="gistui-timeline" data-gistui="Timeline">
      {t.text.map((row, i) => {
        const state = (row[3] ?? "").trim().toLowerCase();
        return (
          <li key={i} className="gistui-timeline__item" data-state={state === "done" || state === "current" ? state : undefined}>
            <span className="gistui-timeline__dot">{state === "done" ? <IconSvg name="check" /> : numbered ? i + 1 : ""}</span>
            <div>
              <div className="gistui-timeline__head">
                <span className="gistui-timeline__title">{row[0]}</span>
                {row[2] && <span className="gistui-timeline__meta">{row[2]}</span>}
              </div>
              {row[1] && <div className="gistui-timeline__detail">{row[1]}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
