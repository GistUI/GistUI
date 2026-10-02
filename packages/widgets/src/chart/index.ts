/**
 * GistUI chart engine: hand-written SVG, zero dependencies, identical in every framework.
 *
 *   const chart = createChart(el, { data, type: "bar", onSelect })
 *   chart.update({ ...props, selected })   // cheap when nothing relevant changed
 *   chart.destroy()
 *
 * Interactions (plan §6.3): hover/touch tooltip, legend toggles, roving-tabindex keyboard navigation,
 * click or Enter to select (again to clear), range brush, drag-to-zoom with double-click reset.
 */

import { createChartModel, formatValue, hasValues, navigate, pieLayout, samePoint, toggleHidden, type ChartModel } from "@gistui/headless";
import type { ChartProps, ChartSelection, ChartType, Widget } from "../types";
import { color, html, num, setAttrs, SR_ONLY, svg } from "./dom";
import { defaultHeight, markA11y, renderFrame, type Frame, type Mark } from "./render";

/** Props whose change requires a full re-render; selection and callbacks are handled separately. */
const RENDER_KEYS = ["data", "type", "stacked", "x", "y", "height", "legend", "zoom", "select", "interactive", "partial", "label"] as const;
const DRAG_PX = 4;
let seq = 0;

export function createChart(el: HTMLElement, initial: ChartProps): Widget<ChartProps> {
  let props = initial;
  let model: ChartModel = createChartModel(props.data, { x: props.x });
  let hidden = new Set<string>();
  let zoom: { from: number; to: number } | null = null;
  /** Selection when the parent does not control `selected`. */
  let internal: ChartSelection | null = null;
  let activeKey: string | null = null;
  let frame: Frame | null = null;
  let width = measure();
  let renderedOnce = false;
  let destroyed = false;
  const id = `gistui-chart-${++seq}`;

  const root = html("div", { class: "gistui-chart", id, role: "figure" });
  root.style.position = "relative";
  const svgEl = svg("svg", { class: "gistui-chart__svg", role: "group" });
  const legendEl = html("div", { class: "gistui-chart__legend" });
  const tooltip = html("div", { class: "gistui-chart__tooltip", "aria-hidden": "true", hidden: true });
  tooltip.style.position = "absolute";
  tooltip.style.pointerEvents = "none";
  // The screen-reader table sits in a visually hidden div: a table ignores `overflow`, so hiding the
  // table itself would still let its rows extend the layout (and make fixed-size pages overflow).
  const srBox = html("div", { class: "gistui-chart__sr" });
  srBox.style.cssText = SR_ONLY;
  const table = html("table", { class: "gistui-chart__sr-table" }, undefined, srBox);
  const empty = html("div", { class: "gistui-chart__empty" }, "No data");
  let brush: SVGRectElement | null = null;
  let rangeRect: SVGRectElement | null = null;
  let crosshair: SVGLineElement | null = null;
  let bandRect: SVGRectElement | null = null;
  let activeMark: Mark | null = null;
  /** Marks lit by a row hover (every series at one category). */
  let activeRow: Mark[] = [];
  let tipVisible = false;
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  /** Marks currently flagged as selected (dense charts update only these). */
  let selectedMarks: Mark[] = [];
  let tableTimer: ReturnType<typeof setTimeout> | null = null;
  let tableFor: { model: ChartModel; label: string | undefined } | null = null;
  el.appendChild(root);

  // ─── Rendering ──────────────────────────────────────────────────────────

  function type(): ChartType {
    return props.type ?? "bar";
  }
  function isPie(): boolean {
    return type() === "pie" || type() === "donut";
  }
  function interactive(): boolean {
    return props.interactive !== false;
  }
  function selection(): ChartSelection | null {
    return props.selected !== undefined ? props.selected : internal;
  }
  function measure(): number {
    return Math.round(el.clientWidth || el.getBoundingClientRect?.().width || 600) || 600;
  }

  function render(): void {
    const focusedKey = focusKey();
    // The SVG is rebuilt: overlay elements from the previous frame are gone.
    brush = rangeRect = null;
    crosshair = null;
    bandRect = null;
    activeMark = null;
    activeRow = [];
    root.removeAttribute("data-hovering");
    const h = props.height ?? defaultHeight(type(), model.rows);
    setAttrs(root, {
      "data-gistui-chart-type": type(),
      "aria-label": props.label ?? null,
      "aria-disabled": interactive() ? null : "true",
      "data-partial": props.partial ? "true" : null,
      "data-zoomed": zoom ? "true" : null,
      "data-dense": null,
      // Animate once: on the first render with complete data.
      "data-animate": !props.partial && !renderedOnce ? "true" : null,
    });
    setAttrs(svgEl, { "aria-label": props.label ?? null });
    if (!props.partial) renderedOnce = true;

    // Nothing to draw: no values at all, or a pie whose values are all zero (it has no slices).
    if (!hasValues(model) || (isPie() && !pieLayout(model.series[0]?.values ?? []).length)) {
      frame = null;
      root.replaceChildren(empty);
      root.setAttribute("data-empty", "true");
      return;
    }
    root.removeAttribute("data-empty");
    const hiddenRows = new Set<number>();
    if (isPie()) for (const k of hidden) hiddenRows.add(Number(k));
    const visible = isPie() ? model.series.slice(0, 1) : model.series.filter((s) => !hidden.has(s.key));
    // Pie and donut put their legend beside the chart when there is room.
    const side = isPie() && showLegend() && width >= 440;
    if (side) root.setAttribute("data-layout", "side");
    else root.removeAttribute("data-layout");
    frame = renderFrame(svgEl, {
      model,
      type: type(),
      stacked: Boolean(props.stacked),
      width: side ? Math.round(width * 0.56) : width,
      height: h,
      uid: id,
      visible,
      hiddenRows,
      zoom,
      yLabel: props.y,
      interactive: interactive(),
    });
    if (frame.dense) root.setAttribute("data-dense", "true");
    // While a drag selects or zooms, a touch must not scroll the page sideways (it may still scroll it vertically).
    setAttrs(svgEl, { style: canDrag() ? "touch-action:pan-y" : null });
    renderLegend();
    scheduleTable();
    root.replaceChildren(svgEl, ...(showLegend() ? [legendEl] : []), tooltip, srBox);
    selectedMarks = [];
    applySelection();
    // Roving tabindex: exactly one mark is a tab stop.
    const active = frame.marks.find((m) => m.key === activeKey) ?? frame.marks[0];
    if (active) setTabStop(active);
    if (focusedKey) restoreFocus(focusedKey);
  }

  /** Moves the single tab stop to `m`. Dense marks get their role and label only while they hold it. */
  function setTabStop(m: Mark): void {
    if (!frame) return;
    const prev = frame.marks.find((x) => x.key === activeKey);
    if (prev && prev !== m) {
      if (frame.dense) for (const a of ["tabindex", "role", "aria-label", "aria-pressed"]) prev.el.removeAttribute(a);
      else prev.el.setAttribute("tabindex", "-1");
    }
    activeKey = m.key;
    if (frame.dense) {
      setAttrs(m.el, { tabindex: 0, ...markA11y(interactive(), model.categories[m.row] ?? "", m.series, m.value) });
      if (interactive()) m.el.setAttribute("aria-pressed", m.el.hasAttribute("data-selected") ? "true" : "false");
    } else m.el.setAttribute("tabindex", "0");
  }

  /** The screen-reader table is built after the frame, and only when the data or label changed. */
  function scheduleTable(): void {
    if (tableFor && tableFor.model === model && tableFor.label === props.label) return;
    if (tableTimer) clearTimeout(tableTimer);
    tableTimer = setTimeout(() => {
      tableTimer = null;
      if (destroyed) return;
      renderTable();
      tableFor = { model, label: props.label };
    }, 0);
  }

  function showLegend(): boolean {
    if (props.legend !== undefined) return props.legend;
    return isPie() || model.series.length > 1;
  }

  function renderLegend(): void {
    legendEl.replaceChildren();
    const items = isPie()
      ? model.categories.map((c, row) => ({ key: String(row), name: String(c), colorIndex: row }))
      : model.series.map((s) => ({ key: s.key, name: s.name, colorIndex: s.index }));
    for (const it of items) {
      const b = html("button", {
        type: "button",
        class: "gistui-chart__legend-item",
        "data-series": it.key,
        "aria-pressed": hidden.has(it.key) ? "false" : "true",
      }, undefined, legendEl);
      const sw = html("span", { class: "gistui-chart__swatch", "aria-hidden": "true", "data-shape": lineLike() ? "line" : null }, undefined, b);
      sw.style.background = color(it.colorIndex);
      html("span", { class: "gistui-chart__legend-label" }, it.name, b);
      if (isPie()) html("span", { class: "gistui-chart__legend-value" }, formatValue(model.series[0]?.values[Number(it.key)]), b);
    }
  }

  function renderTable(): void {
    table.replaceChildren();
    if (props.label) html("caption", {}, props.label, table);
    const head = html("thead", {}, undefined, table);
    const tr = html("tr", {}, undefined, head);
    html("th", { scope: "col" }, model.xKey, tr);
    for (const s of model.series) html("th", { scope: "col" }, s.name, tr);
    const body = html("tbody", {}, undefined, table);
    for (let r = 0; r < model.rows; r++) {
      const row = html("tr", {}, undefined, body);
      html("th", { scope: "row" }, String(model.categories[r] ?? ""), row);
      for (const s of model.series) html("td", {}, formatValue(s.values[r]), row);
    }
  }

  function applySelection(): void {
    if (!frame) return;
    const sel = selection();
    // Marks dim around a selected point. A range has its own highlight and selects no single mark.
    root.toggleAttribute("data-has-selection", sel?.kind === "point");
    const isOn = (m: Mark) => sel?.kind === "point" && sel.series === m.series.name && sel.row === m.row;
    if (frame.dense) {
      // Only the old and new selected marks change; nothing else carries aria-pressed.
      for (const m of selectedMarks) {
        m.el.removeAttribute("data-selected");
        if (m.key !== activeKey) m.el.removeAttribute("aria-pressed");
        else if (interactive()) m.el.setAttribute("aria-pressed", "false");
      }
      selectedMarks = sel?.kind === "point" ? frame.marks.filter(isOn) : [];
      for (const m of selectedMarks) {
        m.el.setAttribute("data-selected", "true");
        if (m.key === activeKey && interactive()) m.el.setAttribute("aria-pressed", "true");
      }
    } else {
      for (const m of frame.marks) {
        const on = isOn(m);
        if (on) m.el.setAttribute("data-selected", "true");
        else m.el.removeAttribute("data-selected");
        if (interactive()) m.el.setAttribute("aria-pressed", on ? "true" : "false");
        else m.el.removeAttribute("aria-pressed");
      }
    }
    rangeRect?.remove();
    rangeRect = null;
    if (sel?.kind === "range" && frame.rowPos) {
      const a = rowOf(sel.from);
      const b = rowOf(sel.to);
      if (a >= 0 && b >= 0) {
        const p0 = frame.xScale ? frame.xScale(Number(sel.from)) : frame.rowPos(Math.min(a, b));
        const p1 = frame.xScale ? frame.xScale(Number(sel.to)) : frame.rowPos(Math.max(a, b));
        rangeRect = svg("rect", {
          class: "gistui-chart__range",
          x: Math.min(p0, p1),
          y: frame.plot.top,
          width: Math.max(1, Math.abs(p1 - p0)),
          height: frame.plot.height,
          fill: "currentColor",
          "fill-opacity": 0.08,
          "pointer-events": "none",
        }, svgEl);
      }
    }
  }

  function rowOf(v: string | number): number {
    if (frame?.xScale) return 0;
    return model.categories.findIndex((c) => c === v || String(c) === String(v));
  }

  // ─── Tooltip and active mark ──────────────────────────────────────────────

  function markFrom(target: EventTarget | null): Mark | undefined {
    const t = target as Element | null;
    const hit = t?.closest?.("[data-key]");
    if (!hit || !frame) return undefined;
    const key = hit.getAttribute("data-key");
    return frame.marks.find((m) => m.key === key);
  }

  function setActive(m: Mark | undefined, row: Mark[] = m ? [m] : []): void {
    if (activeMark === (m ?? null) && row.length === activeRow.length && row.every((x, i) => x === activeRow[i])) return;
    for (const x of activeRow) x.el.removeAttribute("data-active");
    activeMark?.el.removeAttribute("data-active");
    activeMark = m ?? null;
    activeRow = row;
    for (const x of row) x.el.setAttribute("data-active", "true");
    m?.el.setAttribute("data-active", "true");
    if (m && !lineLike() && type() !== "scatter") root.setAttribute("data-hovering", "");
    else root.removeAttribute("data-hovering");
  }

  /** A soft band behind the hovered category (bars). */
  function showBand(row: number): void {
    if (!frame?.bandOf || isPie() || type() === "scatter") return;
    const [start, size] = frame.bandOf(row);
    const { plot } = frame;
    const attrs = frame.horizontal
      ? { x: plot.left - 4, y: start, width: plot.width + 8, height: size }
      : { x: start, y: plot.top, width: size, height: plot.height };
    if (!bandRect) {
      bandRect = svg("rect", { class: "gistui-chart__band", rx: 6, "pointer-events": "none" });
      svgEl.insertBefore(bandRect, svgEl.querySelector(".gistui-chart__plot"));
    }
    setAttrs(bandRect, attrs);
  }

  function showTooltip(m: Mark, rowWide = false, py?: number): void {
    if (!frame) return;
    tooltip.replaceChildren();
    html("div", { class: "gistui-chart__tooltip-title" }, String(model.categories[m.row] ?? ""), tooltip);
    const rows: { name: string; value: number | null; colorIndex: number }[] = [];
    if (isPie()) {
      const total = frame.marks.reduce((a, x) => a + (x.value ?? 0), 0);
      const pct = total ? ` (${formatValue(((m.value ?? 0) / total) * 100)}%)` : "";
      rows.push({ name: m.series.name + pct, value: m.value, colorIndex: m.row });
    } else if (rowWide) {
      for (const s of model.series) if (!hidden.has(s.key)) rows.push({ name: s.name, value: s.values[m.row] ?? null, colorIndex: s.index });
    } else rows.push({ name: m.series.name, value: m.value, colorIndex: m.series.index });
    for (const r of rows) {
      const line = html("div", { class: "gistui-chart__tooltip-row" }, undefined, tooltip);
      const sw = html("span", { class: "gistui-chart__swatch", "aria-hidden": "true", "data-shape": lineLike() ? "line" : null }, undefined, line);
      sw.style.background = color(r.colorIndex);
      html("span", { class: "gistui-chart__tooltip-name" }, r.name, line);
      html("span", { class: "gistui-chart__tooltip-value" }, formatValue(r.value), line);
    }
    // Placement: beside the category, clear of the pointer. It glides from point to point.
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth || 150;
    const th = tooltip.offsetHeight || 24 + rows.length * 20;
    const boxW = svgEl.clientWidth || width;
    const boxH = svgEl.clientHeight || frame.plot.top + frame.plot.height + 24;
    let x: number;
    let y: number;
    if (frame.bandOf && !isPie() && type() !== "scatter" && !frame.horizontal) {
      const [start, size] = frame.bandOf(m.row);
      x = start + size + 6;
      if (x + tw > boxW) x = start - tw - 6;
      y = (py ?? m.y) - th / 2;
    } else {
      x = m.x + 14;
      if (x + tw > boxW) x = m.x - tw - 14;
      y = m.y - th - 10;
      if (y < 0) y = m.y + 14;
    }
    x = clamp(x, 0, Math.max(0, boxW - tw));
    y = clamp(y, 0, Math.max(0, boxH - th));
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = null;
    const appearing = !tipVisible;
    if (appearing) tooltip.setAttribute("data-instant", "");
    tooltip.style.transform = `translate3d(${num(x)}px, ${num(y)}px, 0)`;
    tipVisible = true;
    if (appearing) {
      void tooltip.offsetWidth;
      tooltip.setAttribute("data-visible", "");
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => tooltip.removeAttribute("data-instant"));
      else tooltip.removeAttribute("data-instant");
    } else tooltip.setAttribute("data-visible", "");
  }

  function hideTooltip(): void {
    tipVisible = false;
    tooltip.removeAttribute("data-visible");
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      tipTimer = null;
      if (!tipVisible) tooltip.hidden = true;
    }, 160);
    setActive(undefined);
    crosshair?.remove();
    crosshair = null;
    bandRect?.remove();
    bandRect = null;
  }

  /** Hover picks the category under the pointer; the tooltip lists every series in it. */
  function hoverRow(px: number, py: number): void {
    if (!frame?.rowAt) return;
    const row = frame.rowAt(frame.horizontal ? py : px);
    const inRow = frame.marks.filter((m) => m.row === row);
    if (!inRow.length) return hideTooltip();
    const nearest = inRow.reduce((a, b) => (Math.abs(b.y - py) < Math.abs(a.y - py) ? b : a));
    setActive(nearest, inRow);
    if (lineLike()) {
      if (!crosshair) {
        crosshair = svg("line", { class: "gistui-chart__crosshair", "pointer-events": "none" });
        svgEl.insertBefore(crosshair, svgEl.querySelector(".gistui-chart__plot"));
      }
      setAttrs(crosshair, { x1: nearest.x, x2: nearest.x, y1: frame.plot.top, y2: frame.plot.top + frame.plot.height });
    } else showBand(row);
    showTooltip(nearest, true, frame.horizontal ? undefined : py);
  }

  // ─── Selection ─────────────────────────────────────────────────────────────

  function selectMark(m: Mark): void {
    if (!interactive()) return;
    const x = model.categories[m.row] ?? "";
    const cur = selection();
    if (props.select === "range") {
      // Keyboard selection in range mode: a one-category range.
      const same = cur?.kind === "range" && cur.from === x && cur.to === x;
      return commit(same ? null : { kind: "range", from: x, to: x });
    }
    const sel: ChartSelection = { kind: "point", x, series: m.series.name, value: m.value, row: m.row };
    commit(cur?.kind === "point" && samePoint(cur, sel) ? null : sel);
  }

  function commit(next: ChartSelection | null): void {
    internal = next;
    applySelection();
    props.onSelect?.(next);
  }

  // ─── Pointer: hover, click, brush, zoom ────────────────────────────────────

  let down: { x: number; y: number; id: number } | null = null;
  let dragging = false;
  let suppressClick = false;

  function local(e: MouseEvent): { x: number; y: number } {
    const r = svgEl.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }
  function barLike(): boolean {
    return type() === "bar" || type() === "hbar";
  }
  function lineLike(): boolean {
    return type() === "line" || type() === "area";
  }
  function canDrag(): boolean {
    if (!interactive() || isPie() || !frame) return false;
    return props.select === "range" || (Boolean(props.zoom) && (lineLike() || type() === "scatter"));
  }

  function onPointerMove(e: PointerEvent): void {
    const p = local(e);
    if (down && canDrag()) {
      if (!dragging && Math.abs(p.x - down.x) > DRAG_PX) {
        dragging = true;
        // Capture once it is a drag: its moves and its release reach the chart even outside it.
        // (Not on pointerdown: a captured pointer's click would land on the SVG, not on the mark.)
        try {
          svgEl.setPointerCapture?.(down.id);
        } catch {
          // Not an active pointer (a synthetic event): the document listeners still end the drag.
        }
      }
      if (dragging) return drawBrush(down.x, p.x);
    }
    if (lineLike() || barLike()) return hoverRow(p.x, p.y);
    const m = markFrom(e.target);
    if (m) {
      setActive(m);
      showTooltip(m);
    } else if (!root.contains(document.activeElement)) hideTooltip();
  }

  function onPointerDown(e: PointerEvent): void {
    if (!canDrag()) return;
    const p = local(e);
    down = { x: p.x, y: p.y, id: e.pointerId ?? 0 };
    dragging = false;
  }

  /** Ends the gesture. With `commit` a drag selects or zooms; without (pointercancel) it is dropped. */
  function endDrag(e: PointerEvent, commit: boolean): void {
    if (!down || (e.pointerId !== undefined && e.pointerId !== down.id)) return;
    const start = down.x;
    try {
      svgEl.releasePointerCapture?.(down.id);
    } catch {
      // Was not captured.
    }
    down = null;
    if (!dragging) return;
    dragging = false;
    brush?.remove();
    brush = null;
    if (!commit) return;
    // The click that follows a drag is not a selection. Released outside the chart, no click follows.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    finishDrag(start, local(e).x);
  }

  function onPointerUp(e: PointerEvent): void {
    endDrag(e, true);
  }

  function onPointerCancel(e: PointerEvent): void {
    endDrag(e, false);
  }

  function drawBrush(x0: number, x1: number): void {
    if (!frame) return;
    const { plot } = frame;
    const a = clamp(Math.min(x0, x1), plot.left, plot.left + plot.width);
    const b = clamp(Math.max(x0, x1), plot.left, plot.left + plot.width);
    if (!brush) brush = svg("rect", { class: "gistui-chart__brush", fill: "currentColor", "fill-opacity": 0.12, "pointer-events": "none" }, svgEl);
    setAttrs(brush, { x: a, y: plot.top, width: b - a, height: plot.height });
  }

  function finishDrag(x0: number, x1: number): void {
    if (!frame) return;
    // What the brush showed: the drag clamped to the plot (the pointer may be released far outside).
    const { plot } = frame;
    const lo = clamp(Math.min(x0, x1), plot.left, plot.left + plot.width);
    const hi = clamp(Math.max(x0, x1), plot.left, plot.left + plot.width);
    if (frame.xScale) {
      const from = round(frame.xScale.invert(lo));
      const to = round(frame.xScale.invert(hi));
      if (props.select === "range") return commit({ kind: "range", from, to });
      zoom = { from, to };
    } else if (frame.rowAt) {
      const a = frame.rowAt(lo);
      const b = frame.rowAt(hi);
      if (props.select === "range") return commit({ kind: "range", from: model.categories[a] ?? a, to: model.categories[b] ?? b });
      if (b > a) zoom = { from: a, to: b };
    }
    render();
  }

  function onClick(e: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const legend = (e.target as Element | null)?.closest?.(".gistui-chart__legend-item");
    if (legend) {
      hidden = toggleHidden(hidden, legend.getAttribute("data-series") ?? "");
      render();
      return;
    }
    if (props.select === "range") {
      // In range mode only a drag selects; a plain click clears.
      if (selection() && interactive()) commit(null);
      return;
    }
    let m = markFrom(e.target);
    // Not on a mark: the click picks the category under it, but only inside the plot (a click on the
    // legend's background, the axes or the tooltip selects nothing).
    if (!m && frame && (lineLike() || barLike()) && svgEl.contains(e.target as Node | null)) {
      const p = local(e);
      const { plot } = frame;
      if (p.x >= plot.left && p.x <= plot.left + plot.width && p.y >= plot.top && p.y <= plot.top + plot.height) {
        hoverRow(p.x, p.y);
        m = activeMark ?? undefined;
      }
    }
    if (m) selectMark(m);
  }

  function onDblClick(): void {
    if (!zoom) return;
    zoom = null;
    render();
  }

  // ─── Keyboard and focus ─────────────────────────────────────────────────────

  /**
   * When the pointer was last pressed in the chart. Focus that follows a click (the chart puts it
   * back on the mark after redrawing) is not keyboard focus, and shows no focus mark.
   */
  let pointerAt = Number.NEGATIVE_INFINITY;
  const byPointer = (): boolean => performance.now() - pointerAt < 1000;

  function onKeyDown(e: KeyboardEvent): void {
    pointerAt = Number.NEGATIVE_INFINITY;
    root.removeAttribute("data-pointer");
    if (!frame) return;
    const m = markFrom(e.target);
    if (!m) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectMark(m);
      return;
    }
    if (e.key === "Escape") {
      if (selection() && interactive()) commit(null);
      hideTooltip();
      return;
    }
    const items = frame.marks.map((x) => ({ s: x.s, row: x.row }));
    const i = navigate(items, frame.marks.indexOf(m), e.key, frame.horizontal);
    if (i < 0) return;
    e.preventDefault();
    focusMark(frame.marks[i]!);
  }

  function focusMark(m: Mark): void {
    if (!frame) return;
    setTabStop(m);
    (m.el as unknown as HTMLElement).focus?.();
    setActive(m);
    showTooltip(m, lineLike());
  }

  function onFocusIn(e: FocusEvent): void {
    root.toggleAttribute("data-pointer", byPointer());
    const m = markFrom(e.target);
    if (!m || !frame) return;
    setTabStop(m);
    setActive(m);
    showTooltip(m, lineLike());
  }

  function onFocusOut(e: FocusEvent): void {
    if (!root.contains(e.relatedTarget as Node | null)) hideTooltip();
  }

  function focusKey(): string | null {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    const k = a.getAttribute("data-key");
    if (k) return `mark:${k}`;
    const s = a.closest(".gistui-chart__legend-item")?.getAttribute("data-series");
    return s !== null && s !== undefined ? `legend:${s}` : null;
  }

  function restoreFocus(key: string): void {
    const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const el = kind === "mark"
      ? frame?.marks.find((m) => m.key === value)?.el
      : Array.from(legendEl.querySelectorAll(".gistui-chart__legend-item")).find((b) => b.getAttribute("data-series") === value);
    (el as HTMLElement | undefined)?.focus?.();
  }

  // ─── Wiring ────────────────────────────────────────────────────────────────

  const doc = el.ownerDocument ?? document;
  const listeners: [EventTarget, string, EventListener][] = [
    [svgEl, "pointermove", onPointerMove as EventListener],
    [svgEl, "pointerdown", onPointerDown as EventListener],
    [svgEl, "pointerup", onPointerUp as EventListener],
    [svgEl, "pointercancel", onPointerCancel as EventListener],
    // A drag ends wherever the pointer is released (also when capture is not available).
    [doc, "pointerup", onPointerUp as EventListener],
    [doc, "pointercancel", onPointerCancel as EventListener],
    [svgEl, "pointerleave", (() => {
      if (!dragging && !root.contains(document.activeElement)) hideTooltip();
    }) as EventListener],
    [svgEl, "dblclick", onDblClick as EventListener],
    [root, "pointerdown", (() => {
      pointerAt = performance.now();
      root.setAttribute("data-pointer", "");
    }) as EventListener],
    [root, "click", onClick as EventListener],
    [root, "keydown", onKeyDown as EventListener],
    [root, "focusin", onFocusIn as EventListener],
    [root, "focusout", onFocusOut as EventListener],
  ];
  for (const [t, type, fn] of listeners) t.addEventListener(type, fn);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      const w = measure();
      if (w !== width) {
        width = w;
        render();
      }
    });
    ro.observe(el);
  }

  render();

  return {
    update(next: ChartProps) {
      if (destroyed) return;
      const prev = props;
      props = next;
      const changed = RENDER_KEYS.some((k) => prev[k] !== next[k]);
      if (!changed) {
        if (!sameSelection(prev.selected, next.selected)) applySelection();
        return;
      }
      if (prev.data !== next.data || prev.x !== next.x) {
        model = createChartModel(next.data, { x: next.x });
        const keys = new Set(isPie() ? model.categories.map((_, i) => String(i)) : model.series.map((s) => s.key));
        hidden = new Set([...hidden].filter((k) => keys.has(k)));
        if (zoom && !frame?.xScale && zoom.to >= model.rows) zoom = null;
      }
      if (prev.type !== next.type) {
        hidden = new Set();
        zoom = null;
      }
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (tableTimer) clearTimeout(tableTimer);
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      ro?.disconnect();
      root.remove();
    },
  };
}

function sameSelection(a: ChartSelection | null | undefined, b: ChartSelection | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") return a.series === b.series && a.row === b.row;
  if (a.kind === "range" && b.kind === "range") return a.from === b.from && a.to === b.to;
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Number(v.toPrecision(6));
}
