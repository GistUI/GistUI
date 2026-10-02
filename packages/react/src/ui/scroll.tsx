/**
 * ScrollArea: a horizontal scroller that knows which edges can still scroll. It fades those edges
 * (a CSS mask, so it works on any background) and can show arrow buttons that page through.
 * `useScrollEdges` also tracks pages (one per viewport width), which carousel dots use.
 */

import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { IconSvg } from "./icon";

const useIso = typeof window === "undefined" ? () => {} : useLayoutEffect;

export interface ScrollEdges<T extends HTMLElement> {
  ref: Ref<T>;
  /** More content to the left / right. */
  start: boolean;
  end: boolean;
  /** Pages of content (one viewport width each) and the current one. */
  pages: number;
  index: number;
  /** Scrolls one page back or forward. */
  page: (dir: -1 | 1) => void;
  /** Scrolls to page `i`. */
  go: (i: number) => void;
}

interface State {
  start: boolean;
  end: boolean;
  pages: number;
  index: number;
}

export function useScrollEdges<T extends HTMLElement>(): ScrollEdges<T> {
  const node = useRef<T | null>(null);
  const [state, setState] = useState<State>({ start: false, end: false, pages: 1, index: 0 });
  const measure = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // RTL scrollLeft is negative in modern browsers; use the magnitude.
    const x = Math.abs(el.scrollLeft);
    const pages = el.clientWidth ? Math.max(1, Math.ceil((el.scrollWidth - 2) / el.clientWidth)) : 1;
    const index = max > 1 ? Math.round((x / max) * (pages - 1)) : 0;
    const next = { start: x > 1, end: max - x > 1, pages, index };
    setState((s) => (s.start === next.start && s.end === next.end && s.pages === next.pages && s.index === next.index ? s : next));
  }, []);
  const ref = useCallback(
    (el: T | null) => {
      node.current = el;
      measure();
    },
    [measure],
  );
  useIso(() => {
    const el = node.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Set up once (not on every render): a new observer reports at once, which would measure, set
    // state and render again. Children added later are picked up by the mutation observer.
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      for (const c of Array.from(el.children)) ro.observe(c);
    }
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        if (ro) for (const c of Array.from(el.children)) ro.observe(c);
        measure();
      });
      mo.observe(el, { childList: true });
    }
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);
  const page = useCallback((dir: -1 | 1) => {
    const el = node.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.8), behavior: "smooth" });
  }, []);
  const go = useCallback((i: number) => {
    const el = node.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pages = el.clientWidth ? Math.max(1, Math.ceil((el.scrollWidth - 2) / el.clientWidth)) : 1;
    el.scrollTo({ left: pages > 1 ? (max * Math.max(0, Math.min(pages - 1, i))) / (pages - 1) : 0, behavior: "smooth" });
  }, []);
  return { ref, ...state, page, go };
}

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Arrow buttons: always (when scrollable), only on hover, or never. */
  arrows?: "always" | "hover" | "none";
  /** Class of the scrolling element. */
  viewClassName?: string;
  viewProps?: HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
  /** Pass a hook result to control the scroller from outside (dots, autoplay). */
  edges?: ScrollEdges<HTMLDivElement>;
  children: ReactNode;
}

export function ScrollArea({ arrows = "always", viewClassName, viewProps, edges, children, className, ...rest }: ScrollAreaProps): ReactNode {
  const own = useScrollEdges<HTMLDivElement>();
  const { ref, start, end, page } = edges ?? own;
  return (
    <div
      {...rest}
      className={className ? `gistui-scroll ${className}` : "gistui-scroll"}
      data-can-start={start || undefined}
      data-can-end={end || undefined}
      data-arrows={arrows}
    >
      <div {...viewProps} ref={ref} className={viewClassName ? `gistui-scroll__view ${viewClassName}` : "gistui-scroll__view"}>
        {children}
      </div>
      {arrows !== "none" && (
        <>
          <button type="button" className="gistui-scroll__arrow" data-side="start" aria-label="Scroll left" tabIndex={start ? 0 : -1} onClick={() => page(-1)}>
            <IconSvg name="chevron-left" />
          </button>
          <button type="button" className="gistui-scroll__arrow" data-side="end" aria-label="Scroll right" tabIndex={end ? 0 : -1} onClick={() => page(1)}>
            <IconSvg name="chevron-right" />
          </button>
        </>
      )}
    </div>

  );
}
