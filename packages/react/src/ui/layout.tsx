import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDesign } from "../design";
import { cx, num, str, useBinding, useNodes } from "../hooks";
import { HostColorContext } from "../context";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { ScrollArea, useScrollEdges } from "./scroll";

/**
 * Presets the model may pick for a section: accent, rounding and density. A host colour theme
 * (`<GistUI color>`) takes precedence over the model's accent.
 */
function usePresets(props: Record<string, unknown>) {
  const host = useContext(HostColorContext);
  return {
    "data-gistui-color": host ? undefined : str(props.accent),
    "data-gistui-radius": str(props.radius),
    "data-gistui-density": str(props.density),
  };
}

type Presets = ReturnType<typeof usePresets>;

/**
 * The presets in effect at a point of the tree, for what renders elsewhere in the DOM: a Dialog is
 * moved to the root (a portal), and carries these attributes so it keeps its section's look.
 */
export const PresetContext = createContext<Presets | null>(null);

/** Hands a section's presets down (merged over its ancestors'); sections without presets add nothing. */
function Preset({ presets, children }: { presets: Presets; children: ReactNode }): ReactNode {
  const up = useContext(PresetContext);
  const color = presets["data-gistui-color"] ?? up?.["data-gistui-color"];
  const radius = presets["data-gistui-radius"] ?? up?.["data-gistui-radius"];
  const density = presets["data-gistui-density"] ?? up?.["data-gistui-density"];
  const value = useMemo<Presets>(() => ({ "data-gistui-color": color, "data-gistui-radius": radius, "data-gistui-density": density }), [color, radius, density]);
  if (!presets["data-gistui-color"] && !presets["data-gistui-radius"] && !presets["data-gistui-density"]) return children;
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

export function Page({ props, children }: ComponentProps): ReactNode {
  const d = useDesign("Page", props);
  const presets = usePresets(props);
  return (
    <div className={cx("gistui-page", d.className)} data-gistui="Page" data-gap={str(props.gap)} data-width={str(props.width)} {...presets} style={d.style} {...d.attrs}>
      <Preset presets={presets}>{children}</Preset>
    </div>
  );
}

export function Stack({ props, children }: ComponentProps): ReactNode {
  const d = useDesign("Stack", props);
  return (
    <div className={cx("gistui-stack", d.className)} data-gistui="Stack" data-gap={str(props.gap)} data-align={str(props.align)} data-justify={str(props.justify)} style={d.style} {...d.attrs}>
      {children}
    </div>
  );
}

export function Row({ props, children }: ComponentProps): ReactNode {
  const d = useDesign("Row", props);
  return (
    <div
      className={cx("gistui-row", d.className)}
      style={d.style}
      {...d.attrs}
      data-gistui="Row"
      data-gap={str(props.gap)}
      data-align={str(props.align)}
      data-justify={str(props.justify)}
      data-wrap={props.wrap ? "" : undefined}
    >
      {children}
    </div>
  );
}

export function Grid({ props, children }: ComponentProps): ReactNode {
  const cols = Math.min(6, Math.max(1, Math.round(num(props.cols) ?? 3)));
  const d = useDesign("Grid", props, { ["--gistui-cols" as string]: cols } as CSSProperties);
  return (
    <div className={cx("gistui-grid", d.className)} data-gistui="Grid" data-gap={str(props.gap)} style={d.style} {...d.attrs}>
      {children}
    </div>
  );
}

const MAX_ROW_SPAN = 12;

/** A grid cell that spans columns and/or rows. */
export function Cell({ props, children }: ComponentProps): ReactNode {
  const span = num(props.span);
  const rows = num(props.rows);
  const style: CSSProperties = {};
  if (span) (style as Record<string, unknown>)["--gistui-span"] = Math.round(span);
  // The stylesheet clamps `span` to the grid's columns; nothing bounds rows, so it is clamped here
  // (a huge row span would make the grid create that many rows).
  if (rows) (style as Record<string, unknown>)["--gistui-row-span"] = Math.max(1, Math.min(MAX_ROW_SPAN, Math.round(rows)));
  const d = useDesign("Cell", props, style);
  return (
    <div
      className={cx("gistui-stack", d.className)}
      {...d.attrs}
      data-gistui="Cell"
      data-span={span ? "" : undefined}
      data-row-span={rows ? "" : undefined}
      data-gap={str(props.gap)}
      style={d.style}
    >
      {children}
    </div>
  );
}

/** The free-form layout primitive: direction, alignment, padding and surface are all props. */
export function Box({ props, children }: ComponentProps): ReactNode {
  const w = num(props.w);
  const style: CSSProperties = {};
  if (w) style.flex = `0 0 ${Math.round(w)}px`;
  if (props.grow === true) style.flex = "1 1 0";
  const d = useDesign("Box", props, style);
  const presets = usePresets(props);
  return (
    <div
      className={cx("gistui-box", d.className)}
      {...d.attrs}
      data-gistui="Box"
      data-dir={str(props.dir) ?? "col"}
      data-gap={str(props.gap)}
      data-align={str(props.align)}
      data-justify={str(props.justify)}
      data-pad={str(props.pad)}
      data-surface={str(props.surface)}
      data-wrap={props.wrap ? "" : undefined}
      data-grow={props.fill ? "" : undefined}
      data-text-align={str(props.text)}
      style={d.style}
      {...presets}
    >
      <Preset presets={presets}>{children}</Preset>
    </div>
  );
}

/**
 * Frame: a free-form box for designs the other components do not cover. Everything about its layout
 * and look comes from `style:{…}` (auto layout, size, fill, stroke, radius, shadow, position, type).
 */
export function Frame({ props, children }: ComponentProps): ReactNode {
  const d = useDesign("Frame", props);
  return (
    <div className={cx("gistui-frame", d.className)} data-gistui="Frame" style={d.style} {...d.attrs}>
      {children}
    </div>
  );
}

export function Spacer(): ReactNode {
  return <div className="gistui-spacer" data-gistui="Spacer" aria-hidden />;
}

export function Card({ props, children }: ComponentProps): ReactNode {
  const d = useDesign("Card", props);
  const presets = usePresets(props);
  return (
    <section className={cx("gistui-card", d.className)} data-gistui="Card" data-v={str(props.v) ?? "card"} data-gap={str(props.gap)} {...presets} style={d.style} {...d.attrs}>
      <Preset presets={presets}>{children}</Preset>
    </section>
  );
}

export function Header({ props }: ComponentProps): ReactNode {
  const subtitle = str(props.subtitle);
  const eyebrow = str(props.eyebrow);
  const d = useDesign("Header", props);
  return (
    <header className={cx("gistui-header", d.className)} data-gistui="Header" data-size={str(props.size)} data-text-align={str(props.align)} style={d.style} {...d.attrs}>
      {eyebrow && <span className="gistui-header__eyebrow">{eyebrow}</span>}
      <h2 className="gistui-header__title">{str(props.title)}</h2>
      {subtitle && <p className="gistui-header__subtitle">{subtitle}</p>}
    </header>
  );
}

export function Separator(): ReactNode {
  return <hr className="gistui-separator" data-gistui="Separator" />;
}

/**
 * A horizontal strip of cards: snap scrolling, faded edges, arrows where it can still move, optional
 * page indicators (`nav: dots | bars | count`) and autoplay (seconds; pauses on hover and focus).
 */
export function Carousel({ props, children }: ComponentProps): ReactNode {
  const per = num(props.per);
  const style: CSSProperties = {};
  if (per) (style as Record<string, unknown>)["--gistui-slide"] = `calc((100% - ${Math.max(0, Math.round(per) - 1)} * var(--gistui-space-md)) / ${Math.max(1, per)})`;
  const edges = useScrollEdges<HTMLDivElement>();
  const nav = str(props.nav) ?? "none";
  const arrows = (str(props.arrows) as "always" | "hover" | "none" | undefined) ?? "always";
  const autoplay = num(props.autoplay);
  const paused = useRef(false);
  const { index, pages, go } = edges;
  useEffect(() => {
    if (!autoplay || pages < 2) return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!paused.current) go(index >= pages - 1 ? 0 : index + 1);
    }, Math.max(2, autoplay) * 1000);
    return () => clearInterval(t);
  }, [autoplay, index, pages, go]);
  const pause = (on: boolean) => () => {
    paused.current = on;
  };
  return (
    <div className="gistui-carousel-wrap" data-gistui="Carousel" onMouseEnter={pause(true)} onMouseLeave={pause(false)} onFocus={pause(true)} onBlur={pause(false)}>
      <ScrollArea
        edges={edges}
        arrows={arrows}
        viewClassName="gistui-carousel"
        viewProps={{ role: "region", "aria-roledescription": "carousel", "aria-label": "Carousel", tabIndex: 0, style }}
      >
        {children}
      </ScrollArea>
      {nav !== "none" && pages > 1 && (
        <div className="gistui-carousel__nav" data-nav={nav}>
          {nav === "count" ? (
            <span className="gistui-carousel__count" aria-live="polite">
              {index + 1} / {pages}
            </span>
          ) : (
            Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                className="gistui-carousel__dot"
                aria-label={`Page ${i + 1} of ${pages}`}
                aria-current={i === index || undefined}
                onClick={() => go(i)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────

/** Tab values are the Tab node ids: stable while streaming. */
export function Tabs({ node, props, childIds, renderNode }: ComponentProps): ReactNode {
  const kids = useNodes(childIds);
  const [own, setOwn] = useState<string | null>(null);
  // `bind:$tab` holds the selected tab's label, so programs can test `$tab == "Details"`.
  const b = useBinding(node);
  const labelOf = (id: string) => str(kids[childIds.indexOf(id)]?.props.label) ?? id;
  const boundId = b.bound ? childIds.find((id) => labelOf(id) === b.value || id === b.value) : undefined;
  // The user's tab while it exists; otherwise the first (also when the tab set is replaced).
  const value = b.bound ? (boundId ?? childIds[0] ?? null) : own && childIds.includes(own) ? own : (childIds[0] ?? null);

  const setValue = (id: string) => (b.bound ? b.set(labelOf(id)) : setOwn(id));
  // WAI-ARIA tabs (automatic activation), with the same data attributes Zag uses so styles match.
  const base = useId();
  const tid = (id: string) => `${base}-tab-${id}`;
  const pid = (id: string) => `${base}-panel-${id}`;
  const select = (i: number, focus: boolean) => {
    const id = childIds[(i + childIds.length) % childIds.length];
    if (!id) return;
    setValue(id);
    if (focus) list.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(id)}"]`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = value ? childIds.indexOf(value) : 0;
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? childIds.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  };

  // The indicator follows the selected trigger (measured here; it slides between tabs).
  const list = useRef<HTMLDivElement | null>(null);
  const edges = useScrollEdges<HTMLDivElement>();
  const listRef = (el: HTMLDivElement | null) => {
    list.current = el;
    (edges.ref as (el: HTMLDivElement | null) => void)(el);
  };
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const labels = childIds.map((_, i) => str(kids[i]?.props.label) ?? "").join("\u0000");
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const t = el.querySelector<HTMLElement>('[data-part="trigger"][data-selected]');
      setRect(t ? { x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight } : null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, labels]);

  return (
    <div className="gistui-tabs" data-gistui="Tabs" data-v={str(props.v)} data-measured={rect ? "" : undefined} data-scope="tabs" data-part="root" data-orientation="horizontal">
      <div className="gistui-scroll" data-can-start={edges.start || undefined} data-can-end={edges.end || undefined}>
      <div role="tablist" aria-orientation="horizontal" data-scope="tabs" data-part="list" className="gistui-scroll__view" ref={listRef} onKeyDown={onKey}>
        {childIds.map((id, i) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={tid(id)}
            aria-selected={id === value}
            aria-controls={pid(id)}
            tabIndex={id === value ? 0 : -1}
            data-scope="tabs"
            data-part="trigger"
            data-value={id}
            data-selected={id === value ? "" : undefined}
            onClick={() => setValue(id)}
          >
            {str(kids[i]?.props.icon) && <IconSvg name={str(kids[i]?.props.icon)} />}
            {/* The bold copy reserves the width, so selecting a tab does not shift its neighbours. */}
            <span className="gistui-tabs__label" data-text={str(kids[i]?.props.label) ?? `Tab ${i + 1}`}>
              {str(kids[i]?.props.label) ?? `Tab ${i + 1}`}
            </span>
          </button>
        ))}
        {rect && (
          <span
            className="gistui-tabs__indicator"
            aria-hidden
            style={
              str(props.v) === "pills"
                ? { transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.w, height: rect.h }
                : { transform: `translateX(${rect.x}px)`, width: rect.w }
            }
          />
        )}
      </div>
      </div>
      {childIds.map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={pid(id)}
          aria-labelledby={tid(id)}
          tabIndex={0}
          hidden={id !== value}
          data-scope="tabs"
          data-part="content"
          data-selected={id === value ? "" : undefined}
        >
          {renderNode(id)}
        </div>
      ))}
    </div>
  );
}

export function Tab({ children }: ComponentProps): ReactNode {
  return <>{children}</>;
}

