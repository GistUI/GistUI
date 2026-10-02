/**
 * Document viewer shared by `Report` (paper pages) and `Slides(v:viewer)` (presentation): a thumbnail
 * rail, the current page (or every page with "Show all"), a floating toolbar with previous/next, page
 * count, zoom, present (fullscreen) and — for reports — Download PDF (print, one sheet per page).
 */

import { createContext, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { NodeRef } from "@gistui/core";
import { IconSvg } from "./icon";

/** How a Slide/Sheet renders: in a deck (animated), as a static page, or as a thumbnail. */
export interface PageCtxValue {
  mode: "deck" | "page" | "thumb";
  index: number;
  ids: readonly string[];
  /** Report pages show a footer with the title and page number. */
  kind?: "report" | "slides";
  title?: string | undefined;
}
export const PageCtx = createContext<PageCtxValue | null>(null);

/** "16 / 9" → 1.777… ; "a4" → 0.707… */
export function aspectOf(ratio: string | undefined, fallback: number): number {
  if (!ratio) return fallback;
  const r = ratio.trim().toLowerCase();
  if (r === "a4") return 210 / 297;
  if (r === "letter") return 8.5 / 11;
  const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(r);
  return m ? Number(m[1]) / Number(m[2]) : fallback;
}

interface ViewerProps {
  kind: "report" | "slides";
  ids: readonly string[];
  renderNode: (ref: NodeRef | string | null | undefined) => ReactNode;
  title?: string | undefined;
  subtitle?: string | undefined;
  /** Width / height of a page. */
  aspect: number;
  /** Natural page width in CSS px (thumbnails and zoom are relative to it). */
  base: number;
  showAll?: boolean;
}

const THUMB = 136;

/** A page rendered at its natural size and scaled as a whole, like a PDF page. */
export function Scaled({ base, aspect, scale, children }: { base: number; aspect: number; scale: number; children: ReactNode }): ReactNode {
  const h = base / aspect;
  return (
    <div className="gistui-viewer__scaled" style={{ width: base * scale, height: h * scale }}>
      <div className="gistui-viewer__inner" style={{ width: base, height: h, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export function Viewer({ kind, ids, renderNode, title, subtitle, aspect, base, showAll: initialAll = false }: ViewerProps): ReactNode {
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(initialAll);
  const [zoom, setZoom] = useState(1);
  const [printing, setPrinting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const count = ids.length;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // On phones the stage's height follows its content: fit to its max-height instead, or the
      // page and the stage would keep shrinking each other.
      const cap = parseFloat(cs.maxHeight);
      const h = (Number.isFinite(cap) ? cap : el.clientHeight) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setBox((b) => (Math.abs(b.w - w) < 1 && Math.abs(b.h - h) < 1 ? b : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Fit: slides fill the stage (width and height) one at a time; reports fit the width, then zoom.
  const pageH = base / aspect;
  const barRoom = 72;
  const fit = !box.w
    ? 1
    : kind === "slides" && !all
      ? Math.max(0.1, Math.min(box.w / base, (box.h - barRoom) / pageH))
      : kind === "slides"
        ? Math.max(0.1, box.w / base)
        : Math.max(0.1, Math.min(1, box.w / base));
  const scale = printing ? 1 : kind === "report" ? fit * zoom : fit;

  useEffect(() => {
    if (index > count - 1 && count > 0) setIndex(count - 1);
  }, [count, index]);

  // With "Show all", the page in view becomes the current one.
  useEffect(() => {
    const el = main.current;
    if (!all || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const i = best ? Number((best.target as HTMLElement).dataset.page) : NaN;
        if (Number.isFinite(i)) setIndex(i);
      },
      { root: el, threshold: [0.35, 0.6, 0.9] },
    );
    el.querySelectorAll<HTMLElement>("[data-page]").forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, [all, count]);

  // Keep the current thumbnail in view.
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(count - 1, i));
      setIndex(next);
      if (all) main.current?.querySelector<HTMLElement>(`[data-page="${next}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    },
    [all, count],
  );

  const present = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };

  // Download PDF: print every page, one per sheet of paper.
  const print = () => setPrinting(true);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") (e.preventDefault(), go(index + 1));
    else if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), go(index - 1));
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(count - 1);
  };

  const pageStyle = { "--gistui-page-aspect": aspect, "--gistui-thumb": `${THUMB}px` } as CSSProperties;
  const showing = printing || all ? ids.map((id, i) => [id, i] as const) : ids[index] !== undefined ? [[ids[index]!, index] as const] : [];

  return (
    <div
      ref={root}
      className="gistui-viewer"
      data-gistui={kind === "report" ? "Report" : "Slides"}
      data-kind={kind}
      data-all={all || undefined}
      data-printing={printing || undefined}
      tabIndex={0}
      onKeyDown={onKey}
      role="region"
      aria-roledescription={kind === "report" ? "document" : "slide deck"}
      aria-label={title ?? (kind === "report" ? "Report" : "Slides")}
      style={pageStyle}
    >
      {(title || subtitle) && (
        <header className="gistui-viewer__head">
          <div>
            {title && <h2 className="gistui-viewer__title">{title}</h2>}
            {subtitle && <p className="gistui-viewer__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="gistui-icon-btn" aria-label="Present" onClick={present}>
            <IconSvg name="arrow-up-right" />
          </button>
        </header>
      )}
      <div className="gistui-viewer__body">
        <nav className="gistui-viewer__rail" ref={rail} aria-label="Pages">
          {ids.map((id, i) => (
            // A div, not a <button>: the page preview inside may itself contain buttons.
            <div
              key={id}
              role="button"
              tabIndex={0}
              className="gistui-viewer__thumb"
              aria-current={i === index}
              aria-label={`Page ${i + 1}`}
              onClick={() => go(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go(i);
                }
              }}
            >
              <span className="gistui-viewer__mini" aria-hidden inert>
                <Scaled base={base} aspect={aspect} scale={THUMB / base}>
                  <PageCtx.Provider value={{ mode: "thumb", index: i, ids, kind, title }}>{renderNode(id)}</PageCtx.Provider>
                </Scaled>
              </span>
              <span className="gistui-viewer__num">{i + 1}</span>
            </div>
          ))}
        </nav>
        <div className="gistui-viewer__main" ref={main}>
          <div className="gistui-viewer__pages">
            {showing.map(([id, i]) => (
              <div key={all || printing ? id : `${id}:${i}`} className="gistui-viewer__frame" data-page={i} data-current={i === index || undefined}>
                <Scaled base={base} aspect={aspect} scale={scale}>
                  <PageCtx.Provider value={{ mode: "page", index: i, ids, kind, title }}>{renderNode(id)}</PageCtx.Provider>
                </Scaled>
              </div>
            ))}
          </div>
          <div className="gistui-viewer__bar" role="toolbar" aria-label={kind === "report" ? "Document controls" : "Slide controls"}>
            <button type="button" className="gistui-viewer__btn" aria-label="Previous page" disabled={index === 0} onClick={() => go(index - 1)}>
              <IconSvg name="arrow-left" />
            </button>
            <span className="gistui-viewer__count" aria-live="polite">
              {count ? clamp(index) + 1 : 0} <span>/ {count}</span>
            </span>
            <button type="button" className="gistui-viewer__btn" aria-label="Next page" disabled={index >= count - 1} onClick={() => go(index + 1)}>
              <IconSvg name="arrow-right" />
            </button>
            <span className="gistui-viewer__sep" aria-hidden />
            <label className="gistui-viewer__toggle">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              <span className="gistui-viewer__switch" aria-hidden />
              Show all
            </label>
            {kind === "report" && (
              <>
                <span className="gistui-viewer__sep" aria-hidden />
                <button type="button" className="gistui-viewer__btn" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>
                  <IconSvg name="minus" />
                </button>
                <button type="button" className="gistui-viewer__zoom" onClick={() => setZoom(1)} aria-label="Reset zoom">
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="gistui-viewer__btn" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}>
                  <IconSvg name="plus" />
                </button>
                <span className="gistui-viewer__sep" aria-hidden />
                <button type="button" className="gistui-viewer__btn" aria-label="Download PDF" title="Download PDF" onClick={print}>
                  <IconSvg name="download" />
                </button>
              </>
            )}
            <button type="button" className="gistui-viewer__btn" aria-label="Present" title="Present" onClick={present}>
              <IconSvg name="external-link" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
