/**
 * Slides and reports.
 *
 * - `Slides(…)` (v:deck): a presentation with previous/next, a page count, dots, arrow keys, swipe and
 *   fullscreen. `Slides(…, v:viewer)`: the same slides in a document viewer with a thumbnail rail.
 * - `Report(Sheet(…), …)`: paper pages (A4 or Letter) in the viewer, with zoom and Download PDF.
 *
 * Each Slide/Sheet is a normal container, so any component can go on it.
 */

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NO_FIT, refit, type Fit } from "@gistui/headless";
import { safeUrl, str } from "../hooks";
import type { ComponentProps } from "../library";
import { ratioOf } from "./content";
import { IconSvg } from "./icon";
import { aspectOf, PageCtx, Scaled, Viewer } from "./viewer";

const SLIDE_BASE = 960;
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps a page's content inside the page: when it is taller than the space, it is scaled down to fit
 * (like a presentation app's autofit), so a page never scrolls and never overflows.
 */
function useAutofit(active: boolean) {
  const box = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // The scale is decided by `refit` (shared with the other renderers, so they settle alike).
  const state = useRef<Fit>(NO_FIT);
  const [fit, setFit] = useState(1);
  /** The scale the DOM shows now (a decided scale is applied by the next render). */
  const shown = useRef(1);
  const measure = useCallback(() => {
    const b = box.current;
    const c = content.current;
    // Between deciding a scale and rendering it, the content still has the old width: not measured.
    if (!b || !c || shown.current !== state.current.fit) return;
    const cs = getComputedStyle(b);
    const avail = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    state.current = refit(state.current, avail, c.scrollHeight);
    setFit(state.current.fit);
  }, []);
  // Also after each change of scale, before paint: a search for the scale finishes within one frame.
  useIsoLayout(() => {
    shown.current = fit;
    if (active) measure();
  }, [active, fit, measure]);

  useIsoLayout(() => {
    const b = box.current;
    const c = content.current;
    if (!active || !b || !c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(c);
    return () => ro.disconnect();
  }, [active, measure]);
  return { box, content, fit };
}

export function Slides(p: ComponentProps): ReactNode {
  const { props, childIds, renderNode } = p;
  const ratio = str(props.ratio) === "auto" ? undefined : ratioOf(props.ratio) ?? "16 / 9";
  if (str(props.v) === "viewer") {
    return <Viewer kind="slides" ids={childIds} renderNode={renderNode} title={str(props.title)} subtitle={str(props.subtitle)} aspect={aspectOf(ratio, 16 / 9)} base={960} />;
  }
  return <Deck {...p} ratio={ratio} />;
}

function Deck({ props, childIds, children, ratio }: ComponentProps & { ratio: string | undefined }): ReactNode {
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const count = childIds.length;
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(count - 1, i))), [count]);
  useEffect(() => {
    if (index > count - 1 && count > 0) setIndex(count - 1);
  }, [count, index]);

  const onKey = (e: React.KeyboardEvent) => {
    // Keys a control inside a slide already used (Tabs' arrows), or that belong to a field, are not the deck's.
    if (e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && e.target === root.current)) {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Home") go(0);
    else if (e.key === "End") go(count - 1);
  };

  const touch = useRef<number | null>(null);
  const fullscreen = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };

  const aspect = aspectOf(ratio, 16 / 9);
  const style = ratio ? ({ "--gistui-slide-ratio": ratio, "--gistui-slide-aspect": aspect } as CSSProperties) : undefined;
  // Slides are laid out at 960px wide and scaled to the stage, like a presentation app: the same
  // layout on a phone, just smaller, and never reflowed.
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useIsoLayout(() => {
    const el = stage.current;
    if (!el || !ratio) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return (
    <div
      ref={root}
      className="gistui-slides"
      data-gistui="Slides"
      data-ratio={ratio ? undefined : "auto"}
      role="region"
      aria-roledescription="slide deck"
      aria-label={str(props.title) ?? "Slides"}
      tabIndex={0}
      onKeyDown={onKey}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        go(index + (end < start ? 1 : -1));
      }}
      style={style}
    >
      <div className="gistui-slides__stage" ref={stage}>
        {ratio ? (
          width > 0 && (
            <Scaled base={SLIDE_BASE} aspect={aspect} scale={width / SLIDE_BASE}>
              <PageCtx.Provider value={{ mode: "deck", index, ids: childIds }}>{children}</PageCtx.Provider>
            </Scaled>
          )
        ) : (
          <PageCtx.Provider value={{ mode: "deck", index, ids: childIds }}>{children}</PageCtx.Provider>
        )}
      </div>
      <div className="gistui-slides__progress" aria-hidden>
        <div style={{ width: count ? `${((index + 1) / count) * 100}%` : "0%" }} />
      </div>
      <div className="gistui-slides__bar">
        <div className="gistui-slides__dots" role="tablist" aria-label="Slides">
          {childIds.map((id, i) => (
            <button key={id} type="button" role="tab" className="gistui-slides__dot" aria-current={i === index} aria-selected={i === index} aria-label={`Slide ${i + 1}`} onClick={() => go(i)} />
          ))}
        </div>
        <div className="gistui-slides__nav">
          <button type="button" className="gistui-icon-btn" aria-label="Previous slide" disabled={index === 0} onClick={() => go(index - 1)}>
            <IconSvg name="chevron-left" />
          </button>
          <span className="gistui-slides__count" aria-live="polite">
            {count ? index + 1 : 0} / {count}
          </span>
          <button type="button" className="gistui-icon-btn" aria-label="Next slide" disabled={index >= count - 1} onClick={() => go(index + 1)}>
            <IconSvg name="chevron-right" />
          </button>
          <button type="button" className="gistui-icon-btn" aria-label="Fullscreen" onClick={fullscreen}>
            <IconSvg name="external-link" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A slide (in Slides) or a page (in Report). */
export function Slide({ node, props, children }: ComponentProps): ReactNode {
  const ctx = useContext(PageCtx);
  const pos = ctx ? ctx.ids.indexOf(node.id) : 0;
  const deck = ctx?.mode === "deck";
  const state = !deck ? "active" : pos === ctx!.index ? "active" : pos < ctx!.index ? "before" : "after";
  const image = safeUrl(props.image);
  const bg = image ? "image" : str(props.bg);
  const hidden = deck && state !== "active";
  const sheet = node.type === "Sheet";
  const { box, content, fit } = useAutofit(Boolean(ctx));
  const scaled = fit < 1;
  return (
    <section
      ref={box}
      className="gistui-slide"
      data-gistui={sheet ? "Sheet" : "Slide"}
      data-state={state}
      data-static={deck ? undefined : (ctx?.mode ?? "page")}
      data-layout={str(props.layout)}
      data-bg={bg}
      data-fit={scaled || undefined}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      aria-roledescription={sheet ? "page" : "slide"}
      aria-label={ctx ? `${pos + 1} of ${ctx.ids.length}` : undefined}
    >
      {image && (
        <div className="gistui-slide__bg" aria-hidden>
          <img src={image} alt="" referrerPolicy="no-referrer" />

        </div>
      )}
      <div
        ref={content}
        className="gistui-slide__content"
        style={scaled ? ({ transform: `scale(${fit})`, width: `${100 / fit}%` } as CSSProperties) : undefined}
      >
        {children}
      </div>
      {sheet && ctx?.kind === "report" && !image && (
        <footer className="gistui-slide__foot" aria-hidden>
          <span>{ctx.title}</span>
          <span>
            {pos + 1} / {ctx.ids.length}
          </span>
        </footer>
      )}
    </section>
  );
}

export const Sheet = Slide;

/** Paper pages in a PDF-style viewer: thumbnails, page count, zoom, Download PDF. */
export function Report({ props, childIds, renderNode }: ComponentProps): ReactNode {
  const size = str(props.size) === "letter" ? "letter" : "a4";
  return (
    <Viewer
      kind="report"
      ids={childIds}
      renderNode={renderNode}
      title={str(props.title)}
      subtitle={str(props.subtitle)}
      aspect={aspectOf(size, 210 / 297)}
      base={794}
      showAll
    />
  );
}
