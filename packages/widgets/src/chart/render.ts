/**
 * Renders one chart frame into an SVG element. Returns the marks (for hover, keyboard and selection)
 * and the geometry the controller needs to map pointer positions back to data.
 */

import {
  bandScale,
  formatTick,
  formatValue,
  linearScale,
  looksLikeYears,
  pieLayout,
  stack,
  tickFormat,
  valueExtent,
  type BandScale,
  type ChartModel,
  type ChartSeries,
  type LinearScale,
} from "@gistui/headless";
import type { ChartType } from "../types";
import { color, num, setAttrs, svg } from "./dom";

export interface Mark {
  /** The mark's element. On a decimated series it is created when first read (hover, focus, selection). */
  el: SVGElement;
  /** Series position among the visible series (0 for pie slices). */
  s: number;
  series: ChartSeries;
  row: number;
  value: number | null;
  /** Anchor for the tooltip, in SVG coordinates. */
  x: number;
  y: number;
  key: string;
}

export interface Frame {
  marks: Mark[];
  /** Plot rectangle. */
  plot: { left: number; top: number; width: number; height: number };
  /** Maps an x pixel to a row index (categorical axes) — undefined for pie. */
  rowAt?: (px: number) => number;
  /** Numeric x axis (scatter with numeric categories). */
  xScale?: LinearScale;
  /** Pixel center of a row on the category axis. */
  rowPos?: (row: number) => number;
  /** Start and size of a row's slot on the category axis (bar and line hover band). */
  bandOf?: (row: number) => [number, number];
  /** First and last row shown (zoom window). */
  window: [number, number];
  horizontal: boolean;
  /**
   * Many marks (> DENSE): they carry only geometry and `data-key`; the controller adds role, label and
   * tab stop to the active mark only, which keeps big charts fast.
   */
  dense: boolean;
}

/** Above this many marks a chart renders in dense mode. */
export const DENSE = 300;

export interface RenderInput {
  model: ChartModel;
  type: ChartType;
  stacked: boolean;
  width: number;
  height: number;
  /** Visible series, in display order. */
  visible: ChartSeries[];
  /** Hidden pie rows. */
  hiddenRows: ReadonlySet<number>;
  /** Zoom window: rows (categorical) or x values (numeric scatter). */
  zoom: { from: number; to: number } | null;
  yLabel?: string | undefined;
  interactive: boolean;
  /** Unique per chart instance: namespaces gradient ids. */
  uid?: string;
  /** Set by `renderFrame` from the mark count (see `DENSE`). */
  dense: boolean;
}

const CHAR_W = 6.5;
/** Bar thickness caps: one series, and each bar of a group. Leftover band space stays as air. */
const BAR_MAX = 28;
const GROUPED_BAR_MAX = 18;
const GROUP_GAP = 4;
/** Smallest distance between two category labels of a horizontal bar chart (11px text). */
const LABEL_PITCH = 12;
/** Default height, and the room each row of a horizontal bar chart gets when the height is not set. */
const DEFAULT_HEIGHT = 240;
const HBAR_ROW = 14;
const HBAR_MAX_HEIGHT = 640;
/** Rounded data end of a bar; the baseline end stays square. */
const BAR_RADIUS = 4;
/** Surface gap between stacked segments. */
const STACK_GAP = 2;

/**
 * Height when the program sets none. A horizontal bar chart with more rows than fit at the default
 * height grows with its rows (up to a cap), so its labels do not run into each other.
 */
export function defaultHeight(type: ChartType, rows: number): number {
  if (type === "pie" || type === "donut") return 220;
  if (type !== "hbar" || rows * LABEL_PITCH <= DEFAULT_HEIGHT - 30) return DEFAULT_HEIGHT;
  return Math.min(HBAR_MAX_HEIGHT, rows * HBAR_ROW + 30);
}

/** Thickness of each bar in a group of `k`, and the gap between them. Never below 1px: the gap gives way first. */
function groupLayout(bandwidth: number, k: number, max: number): { bar: number; gap: number } {
  const fit = (bandwidth - GROUP_GAP * (k - 1)) / Math.max(1, k);
  if (fit >= 1) return { bar: Math.min(max, fit), gap: GROUP_GAP };
  const gap = k > 1 ? Math.max(0, (bandwidth - k) / (k - 1)) : 0;
  return { bar: Math.max(1, (bandwidth - gap * (k - 1)) / Math.max(1, k)), gap };
}

/** Longest category label in the window, in characters (capped). A loop: the data can be large. */
function labelLength(categories: readonly (string | number)[], [a, b]: [number, number], cap: number): number {
  let max = 1;
  for (let r = a; r <= b && max < cap; r++) max = Math.max(max, Math.min(cap, String(categories[r]).length));
  return max;
}

/** A mark whose element is made on first use. */
function lazyMark(make: () => SVGElement, rest: Omit<Mark, "el">): Mark {
  let el: SVGElement | undefined;
  return {
    ...rest,
    get el() {
      return (el ??= make());
    },
  };
}

/**
 * Thins a run of rows to what a plot can show: per pixel column, the rows with the lowest and the
 * highest value (so no spike is lost), plus the run's first and last row.
 */
function decimate(run: readonly number[], column: (row: number) => number, value: (row: number) => number): number[] {
  if (run.length <= 2) return run.slice();
  const out: number[] = [];
  for (let i = 0; i < run.length; ) {
    const col = column(run[i]!);
    let lo = run[i]!;
    let hi = lo;
    let j = i;
    for (; j < run.length && column(run[j]!) === col; j++) {
      const r = run[j]!;
      if (value(r) < value(lo)) lo = r;
      if (value(r) > value(hi)) hi = r;
    }
    if (lo === hi) out.push(lo);
    else out.push(Math.min(lo, hi), Math.max(lo, hi));
    i = j;
  }
  const first = run[0]!;
  const last = run[run.length - 1]!;
  if (out[0] !== first) out.unshift(first);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function straightPath(pts: readonly (readonly [number, number])[]): string {
  let d = "";
  for (let i = 0; i < pts.length; i++) d += `${i ? "L" : "M"}${num(pts[i]![0])},${num(pts[i]![1])}`;
  return d;
}

/** The row in sorted `rows` nearest to `row`. */
function nearestRow(rows: readonly number[], row: number): number {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]! < row) lo = mid + 1;
    else hi = mid;
  }
  const after = rows[lo]!;
  const before = rows[lo - 1];
  return before !== undefined && row - before <= after - row ? before : after;
}

export function renderFrame(root: SVGSVGElement, input: Omit<RenderInput, "dense">): Frame {
  const count = input.type === "pie" || input.type === "donut" ? input.model.rows : input.visible.length * input.model.rows;
  return renderInto(root, { ...input, dense: count > DENSE });
}

function renderInto(root: SVGSVGElement, input: RenderInput): Frame {
  root.replaceChildren();
  setAttrs(root, { width: input.width, height: input.height, viewBox: `0 0 ${num(input.width)} ${num(input.height)}` });
  if (input.type === "pie" || input.type === "donut") return renderPie(root, input);
  if (input.type === "hbar") return renderHBar(root, input);
  return renderVertical(root, input);
}

function rowsWindow(input: RenderInput): [number, number] {
  const last = Math.max(0, input.model.rows - 1);
  if (!input.zoom || (input.type === "scatter" && input.model.xNumeric)) return [0, last];
  const a = Math.max(0, Math.min(last, Math.round(input.zoom.from)));
  const b = Math.max(0, Math.min(last, Math.round(input.zoom.to)));
  return a <= b ? [a, b] : [b, a];
}

function windowed(series: readonly ChartSeries[], [a, b]: [number, number]): ChartSeries[] {
  return series.map((s) => ({ ...s, values: s.values.slice(a, b + 1) }));
}

/** Full accessible attributes for one mark (used eagerly on sparse charts, lazily on dense ones). */
export function markA11y(interactive: boolean, category: string | number, series: ChartSeries, v: number | null) {
  return {
    role: interactive ? "button" : "img",
    "aria-label": `${category}, ${series.name}: ${formatValue(v)}`,
  };
}

function markAttrs(input: RenderInput, s: number, row: number, series: ChartSeries, v: number | null) {
  if (input.dense) return { "data-key": `${s}:${row}` };
  return {
    "data-key": `${s}:${row}`,
    "data-series": series.key,
    "data-row": row,
    tabindex: -1,
    ...markA11y(input.interactive, input.model.categories[row] ?? "", series, v),
  };
}

// ─── Vertical cartesian: bar, line, area, scatter ───────────────────────────

function renderVertical(root: SVGSVGElement, input: RenderInput): Frame {
  const { model, type, width, height } = input;
  const stacked = input.stacked && (type === "bar" || type === "area");
  const win = rowsWindow(input);
  const numericX = type === "scatter" && model.xNumeric;
  const shown = windowed(input.visible, win);
  const n = win[1] - win[0] + 1;
  const zeroBase = type === "bar" || type === "area";
  const extent = valueExtent(shown, n, { stacked, zero: zeroBase });

  // The axis title sits above the axis, read left to right (a rotated one is slow to read).
  const top = input.yLabel ? 28 : 10;
  const bottom = 24;
  const right = 12;
  const yProbe = linearScale(extent, [1, 0]);
  const yFormat = tickFormat(yProbe.ticks);
  let yChars = 0;
  for (const t of yProbe.ticks) yChars = Math.max(yChars, yFormat(t).length);
  const yLabelW = yChars * CHAR_W + 10;
  const left = Math.ceil(yLabelW);
  const plot = { left, top, width: Math.max(10, width - left - right), height: Math.max(10, height - top - bottom) };
  const y = linearScale(extent, [plot.top + plot.height, plot.top]);

  grid(root, y, plot, false, yFormat);
  if (input.yLabel) {
    const t = svg("text", {
      class: "gistui-chart__axis-title",
      x: 0,
      y: 11,
      "text-anchor": "start",
      fill: "currentColor",
      "font-size": 11,
    }, root);
    t.textContent = input.yLabel;
  }

  // X positions.
  const band = bandScale(n, [plot.left, plot.left + plot.width], type === "bar" ? 0.2 : 0);
  let xScale: LinearScale | undefined;
  if (numericX) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of model.categories) {
      const v = c as number;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (input.zoom) [lo, hi] = [input.zoom.from, input.zoom.to];
    xScale = linearScale([lo, hi], [plot.left, plot.left + plot.width], { nice: !input.zoom });
  }
  const xOf = (row: number) => (xScale ? xScale(model.categories[row] as number) : band.center(row - win[0]));

  // X axis labels.
  const axis = svg("g", { class: "gistui-chart__axis gistui-chart__axis--x", fill: "currentColor", "font-size": 11 }, root);
  if (xScale) {
    // An axis of years reads 2019, 2020…: never "2.02k", and no half years.
    const years = looksLikeYears(model.categories);
    const xFormat = tickFormat(xScale.ticks, { plain: years });
    for (const t of xScale.ticks) {
      if (years && !Number.isInteger(t)) continue;
      tickText(axis, xScale(t), plot.top + plot.height + 16, xFormat(t), "middle");
    }
  } else {
    const maxLen = labelLength(model.categories, win, 14);
    const every = Math.max(1, Math.ceil((n * (maxLen * CHAR_W + 8)) / plot.width));
    for (let r = win[0]; r <= win[1]; r++) {
      if ((r - win[0]) % every) continue;
      tickText(axis, band.center(r - win[0]), plot.top + plot.height + 16, truncate(String(model.categories[r] ?? ""), 14), "middle");
    }
  }

  const plotG = svg("g", { class: "gistui-chart__plot" }, root);
  const marks: Mark[] = [];
  const k = input.visible.length;
  let decimated = false;
  /** Rows that kept a mark on a decimated chart. */
  const kept = new Set<number>();

  if (type === "bar") {
    const segs = stacked ? stack(shown, n) : null;
    const topSeg = segs ? topSegments(segs, n) : null;
    const single = segs || k === 1;
    const group = groupLayout(band.bandwidth, k, GROUPED_BAR_MAX);
    const barW = single ? Math.min(BAR_MAX, band.bandwidth) : group.bar;
    const groupW = single ? barW : barW * k + group.gap * (k - 1);
    input.visible.forEach((s, si) => {
      const g = svg("g", { class: "gistui-chart__series", "data-series": s.key, style: `color:${color(s.index)};--gistui-s:${si}` }, plotG);
      for (let r = win[0]; r <= win[1]; r++) {
        const v = s.values[r] ?? null;
        if (v === null) continue;
        const slot = band.center(r - win[0]) - groupW / 2;
        let x: number;
        let y0: number;
        let y1: number;
        let rounded = true;
        if (segs) {
          const seg = segs[si]![r - win[0]]!;
          x = slot;
          y0 = y(seg.lo);
          y1 = y(seg.hi);
          rounded = topSeg![r - win[0]]![v >= 0 ? 1 : 0] === si;
          // A surface gap between stacked segments.
          if (!rounded && Math.abs(y1 - y0) > STACK_GAP) y1 += (y1 < y0 ? 1 : -1) * STACK_GAP;
        } else {
          x = single ? slot : slot + si * (barW + group.gap);
          y0 = y(0);
          y1 = y(v);
        }
        const neg = v < 0;
        const top = Math.min(y0, y1);
        const h = Math.max(v === 0 ? 0 : 2, Math.abs(y1 - y0));
        const el = svg("path", {
          class: "gistui-chart__bar",
          d: barPath(x, neg ? top : Math.max(y0, y1) - h, barW, h, rounded ? BAR_RADIUS : 0, neg ? "down" : "up"),
          fill: "currentColor",
          "data-neg": neg || null,
          style: `--gistui-i:${r - win[0]}`,
          ...markAttrs(input, si, r, s, v),
        }, g);
        marks.push({ el, s: si, series: s, row: r, value: v, x: x + barW / 2, y: top, key: `${si}:${r}` });
      }
    });
  } else if (type === "line" || type === "area") {
    const segs = stacked ? stack(shown, n) : null;
    const base = y(Math.max(y.domain[0], Math.min(0, y.domain[1])));
    const defs = type === "area" ? svg("defs", {}, root) : null;
    // More rows than the plot can show (two per pixel): the path is thinned and points are made on demand.
    decimated = input.dense && n > Math.max(2, Math.floor(plot.width) * 2);
    const column = (r: number) => Math.floor(xOf(r) - plot.left);
    const path = decimated ? straightPath : smoothPath;
    const pending: (() => void)[] = [];
    input.visible.forEach((s, si) => {
      const g = svg("g", { class: "gistui-chart__series", "data-series": s.key, fill: "currentColor", style: `color:${color(s.index)};--gistui-s:${si}` }, plotG);
      // A stacked segment is drawn at the end away from zero: `hi` for a positive value, `lo` for a negative one.
      const seg = (r: number) => segs![si]![r - win[0]]!;
      const below = (r: number) => (s.values[r] as number) < 0;
      const top = (r: number) => (segs ? y(below(r) ? seg(r).lo : seg(r).hi) : y(s.values[r] as number));
      const bot = (r: number) => (segs ? y(below(r) ? seg(r).hi : seg(r).lo) : base);
      const full = runsOf(s.values, win);
      const runs = decimated ? full.map((run) => decimate(run, column, top)) : full;
      if (type === "area" && defs) {
        // A vertical wash: strongest at the line, fading toward the baseline.
        const gid = `${input.uid ?? "gistui"}-area-${si}`;
        const grad = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": stacked ? 0.22 : 0.2, style: `color:${color(s.index)}` }, grad);
        svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": stacked ? 0.04 : 0, style: `color:${color(s.index)}` }, grad);
        let d = "";
        for (const run of runs) {
          const upper = run.map((r) => [xOf(r), top(r)] as const);
          const lower = [...run].reverse().map((r) => [xOf(r), bot(r)] as const);
          d += path(upper) + (segs ? "L" + path(lower).slice(1) : `L${num(lower[0]![0])},${num(lower[0]![1])}L${num(lower.at(-1)![0])},${num(lower.at(-1)![1])}`) + "Z";
        }
        if (d) svg("path", { class: "gistui-chart__area", d, fill: `url(#${gid})`, stroke: "none" }, g);
      }
      let line = "";
      for (const run of runs) line += path(run.map((r) => [xOf(r), top(r)] as const));
      if (line) svg("path", { class: "gistui-chart__line", d: line, fill: "none", stroke: "currentColor", "stroke-width": 2, pathLength: 1 }, g);
      // A run of one row draws no line: `data-solo` keeps its point visible.
      const point = (r: number, solo: boolean) =>
        svg("circle", { class: "gistui-chart__point", cx: xOf(r), cy: top(r), r: 4, "data-solo": solo ? "" : null, ...markAttrs(input, si, r, s, s.values[r] ?? null) }, g);
      if (!decimated) {
        for (const run of full) {
          for (const r of run) marks.push({ el: point(r, run.length === 1), s: si, series: s, row: r, value: s.values[r] ?? null, x: xOf(r), y: top(r), key: `${si}:${r}` });
        }
        return;
      }
      for (const run of runs) for (const r of run) kept.add(r);
      // Marks need the rows every series kept (a hover lights the whole row): made once all are known.
      pending.push(() => {
        for (const run of full) {
          const solo = run.length === 1;
          for (const r of run) {
            if (!kept.has(r)) continue;
            const rest = { s: si, series: s, row: r, value: s.values[r] ?? null, x: xOf(r), y: top(r), key: `${si}:${r}` };
            marks.push(solo ? { el: point(r, true), ...rest } : lazyMark(() => point(r, false), rest));
          }
        }
      });
    });
    for (const make of pending) make();
  } else {
    // scatter
    input.visible.forEach((s, si) => {
      const g = svg("g", { class: "gistui-chart__series", "data-series": s.key, fill: "currentColor", style: `color:${color(s.index)}` }, plotG);
      for (let r = 0; r < model.rows; r++) {
        const v = s.values[r] ?? null;
        if (v === null) continue;
        if (!xScale && (r < win[0] || r > win[1])) continue;
        const cx = xOf(r);
        if (xScale && (cx < plot.left - 0.5 || cx > plot.left + plot.width + 0.5)) continue;
        const cy = y(v);
        const el = svg("circle", { class: "gistui-chart__point", cx, cy, r: 4, ...markAttrs(input, si, r, s, v) }, g);
        marks.push({ el, s: si, series: s, row: r, value: v, x: cx, y: cy, key: `${si}:${r}` });
      }
    });
  }

  const frame: Frame = {
    marks,
    plot,
    window: win,
    horizontal: false,
    dense: input.dense,
    rowPos: (row) => xOf(row),
  };
  if (!xScale) frame.bandOf = (row) => [plot.left + (row - win[0]) * band.step, band.step];
  if (xScale) frame.xScale = xScale;
  else if (decimated && kept.size) {
    // Not every row has a mark: the pointer picks the nearest one that does.
    const rows = [...kept].sort((a, b) => a - b);
    frame.rowAt = (px: number) => nearestRow(rows, win[0] + band.index(px));
  } else frame.rowAt = (px: number) => win[0] + band.index(px);
  return frame;
}

// ─── Horizontal bars ─────────────────────────────────────────────────────────

function renderHBar(root: SVGSVGElement, input: RenderInput): Frame {
  const { model, width, height } = input;
  const win = rowsWindow(input);
  const n = win[1] - win[0] + 1;
  const shown = windowed(input.visible, win);
  const extent = valueExtent(shown, n, { stacked: input.stacked, zero: true });
  const maxLen = labelLength(model.categories, win, 18);
  const left = Math.ceil(Math.min(140, maxLen * CHAR_W + 12));
  const top = 8;
  const bottom = 22;
  const right = 16;
  const plot = { left, top, width: Math.max(10, width - left - right), height: Math.max(10, height - top - bottom) };
  const x = linearScale(extent, [plot.left, plot.left + plot.width]);
  const band = bandScale(n, [plot.top, plot.top + plot.height], 0.2);

  grid(root, x, plot, true, tickFormat(x.ticks));
  const axis = svg("g", { class: "gistui-chart__axis gistui-chart__axis--y", fill: "currentColor", "font-size": 11 }, root);
  // Rows closer together than a line of text: label every 2nd, 3rd… row.
  const every = Math.max(1, Math.ceil(LABEL_PITCH / (band.step || 1)));
  for (let r = win[0]; r <= win[1]; r++) {
    if ((r - win[0]) % every) continue;
    const t = tickText(axis, plot.left - 6, band.center(r - win[0]), truncate(String(model.categories[r] ?? ""), 18), "end");
    t.setAttribute("dy", "0.32em");
  }

  const plotG = svg("g", { class: "gistui-chart__plot" }, root);
  const marks: Mark[] = [];
  const segs = input.stacked ? stack(shown, n) : null;
  const topSeg = segs ? topSegments(segs, n) : null;
  const k = input.visible.length;
  const single = segs || k === 1;
  const group = groupLayout(band.bandwidth, k, GROUPED_BAR_MAX - 4);
  const barH = single ? Math.min(BAR_MAX - 6, band.bandwidth) : group.bar;
  const groupH = single ? barH : barH * k + group.gap * (k - 1);
  input.visible.forEach((s, si) => {
    const g = svg("g", { class: "gistui-chart__series", "data-series": s.key, style: `color:${color(s.index)};--gistui-s:${si}` }, plotG);
    for (let r = win[0]; r <= win[1]; r++) {
      const v = s.values[r] ?? null;
      if (v === null) continue;
      const slot = band.center(r - win[0]) - groupH / 2;
      let yPos: number;
      let x0: number;
      let x1: number;
      let rounded = true;
      if (segs) {
        const seg = segs[si]![r - win[0]]!;
        yPos = slot;
        x0 = x(seg.lo);
        x1 = x(seg.hi);
        rounded = topSeg![r - win[0]]![v >= 0 ? 1 : 0] === si;
        if (!rounded && Math.abs(x1 - x0) > STACK_GAP) x1 += (x1 > x0 ? -1 : 1) * STACK_GAP;
      } else {
        yPos = single ? slot : slot + si * (barH + group.gap);
        x0 = x(0);
        x1 = x(v);
      }
      const neg = v < 0;
      const w = Math.max(v === 0 ? 0 : 2, Math.abs(x1 - x0));
      const left = neg ? Math.min(x0, x1) : Math.min(x0, x1);
      const el = svg("path", {
        class: "gistui-chart__bar",
        d: barPath(left, yPos, w, barH, rounded ? BAR_RADIUS : 0, neg ? "left" : "right"),
        fill: "currentColor",
        "data-neg": neg || null,
        style: `--gistui-i:${r - win[0]}`,
        ...markAttrs(input, si, r, s, v),
      }, g);
      marks.push({ el, s: si, series: s, row: r, value: v, x: Math.max(x0, x1), y: yPos + barH / 2, key: `${si}:${r}` });
    }
  });
  return {
    marks,
    plot,
    window: win,
    horizontal: true,
    dense: input.dense,
    rowAt: (py: number) => win[0] + band.index(py),
    rowPos: (row) => band.center(row - win[0]),
    bandOf: (row) => [plot.top + (row - win[0]) * band.step, band.step],
  };
}

// ─── Pie and donut ───────────────────────────────────────────────────────────

function renderPie(root: SVGSVGElement, input: RenderInput): Frame {
  const { model, width, height } = input;
  const s = model.series[0];
  const plot = { left: 0, top: 0, width, height };
  const marks: Mark[] = [];
  if (!s) return { marks, plot, window: [0, Math.max(0, model.rows - 1)], horizontal: false, dense: input.dense };
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.max(4, Math.min(width, height) / 2 - 6);
  const r0 = input.type === "donut" ? r * 0.64 : 0;
  const g = svg("g", { class: "gistui-chart__plot" }, root);
  const slices = pieLayout(s.values, input.hiddenRows);
  for (const sl of slices) {
    const mid = (sl.start + sl.end) / 2;
    const el = svg("path", {
      class: "gistui-chart__slice",
      d: arcPath(cx, cy, r, r0, sl.start, sl.end),
      fill: "currentColor",
      style: `color:${color(sl.row)};--gistui-i:${sl.row}`,
      ...markAttrs(input, 0, sl.row, s, sl.value),
    }, g);
    const ar = r0 ? (r + r0) / 2 : r * 0.6;
    marks.push({ el, s: 0, series: s, row: sl.row, value: sl.value, x: cx + ar * Math.sin(mid), y: cy - ar * Math.cos(mid), key: `0:${sl.row}` });
  }
  if (input.type === "donut") {
    const total = slices.reduce((a, sl) => a + sl.value, 0);
    // Shares that add up to 100: the centre shows the largest share, not a meaningless "100".
    const top = slices.reduce<(typeof slices)[number] | undefined>((a, sl) => (!a || sl.value > a.value ? sl : a), undefined);
    const shares = Math.abs(total - 100) < 0.6 && top;
    const t = svg("text", {
      class: "gistui-chart__total",
      x: cx,
      y: cy,
      dy: "0.1em",
      "text-anchor": "middle",
      fill: "currentColor",
      "font-size": 20,
    }, g);
    t.textContent = shares ? `${formatTick(top!.value)}%` : formatTick(total);
    const label = svg("text", {
      class: "gistui-chart__total-label",
      x: cx,
      y: cy,
      dy: "1.6em",
      "text-anchor": "middle",
      fill: "currentColor",
      "font-size": 11,
    }, g);
    label.textContent = shares ? String(model.categories[top!.row] ?? s.name) : s.name;
  }
  return { marks, plot, window: [0, Math.max(0, model.rows - 1)], horizontal: false, dense: input.dense };
}

/** Annular (or pie) sector path; angles in radians clockwise from 12 o'clock. */
export function arcPath(cx: number, cy: number, r: number, r0: number, a0: number, a1: number): string {
  const p = (rad: number, a: number) => `${num(cx + rad * Math.sin(a))},${num(cy - rad * Math.cos(a))}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // A full circle cannot be one arc: draw two halves.
    const outer = `M${p(r, 0)}A${num(r)},${num(r)} 0 1 1 ${p(r, Math.PI)}A${num(r)},${num(r)} 0 1 1 ${p(r, 0)}Z`;
    if (!r0) return outer;
    return `${outer}M${p(r0, 0)}A${num(r0)},${num(r0)} 0 1 0 ${p(r0, Math.PI)}A${num(r0)},${num(r0)} 0 1 0 ${p(r0, 0)}Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  let d = `M${p(r, a0)}A${num(r)},${num(r)} 0 ${large} 1 ${p(r, a1)}`;
  d += r0 ? `L${p(r0, a1)}A${num(r0)},${num(r0)} 0 ${large} 0 ${p(r0, a0)}Z` : `L${num(cx)},${num(cy)}Z`;
  return d;
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

/**
 * A bar with a rounded data end and a square baseline end. `dir` is the direction the bar grows:
 * up/down for columns, right/left for horizontal bars.
 */
export function barPath(x: number, y: number, w: number, h: number, radius: number, dir: "up" | "down" | "right" | "left"): string {
  const r = Math.max(0, Math.min(radius, (dir === "up" || dir === "down" ? w : h) / 2, dir === "up" || dir === "down" ? h : w));
  const [X, Y, W, H, R] = [num(x), num(y), num(w), num(h), num(r)];
  if (!R) return `M${X},${Y}h${W}v${H}h${num(-w)}Z`;
  switch (dir) {
    case "up":
      return `M${X},${num(y + h)}V${num(y + r)}Q${X},${Y} ${num(x + r)},${Y}H${num(x + w - r)}Q${num(x + w)},${Y} ${num(x + w)},${num(y + r)}V${num(y + h)}Z`;
    case "down":
      return `M${X},${Y}V${num(y + h - r)}Q${X},${num(y + h)} ${num(x + r)},${num(y + h)}H${num(x + w - r)}Q${num(x + w)},${num(y + h)} ${num(x + w)},${num(y + h - r)}V${Y}Z`;
    case "right":
      return `M${X},${Y}H${num(x + w - r)}Q${num(x + w)},${Y} ${num(x + w)},${num(y + r)}V${num(y + h - r)}Q${num(x + w)},${num(y + h)} ${num(x + w - r)},${num(y + h)}H${X}Z`;
    case "left":
      return `M${num(x + w)},${Y}H${num(x + r)}Q${X},${Y} ${X},${num(y + r)}V${num(y + h - r)}Q${X},${num(y + h)} ${num(x + r)},${num(y + h)}H${num(x + w)}Z`;
  }
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson): a smooth curve through every point that never
 * overshoots, so a line never implies a value the data does not have.
 */
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (!n) return "";
  let d = `M${num(pts[0]![0])},${num(pts[0]![1])}`;
  if (n === 1) return d;
  if (n === 2) return d + `L${num(pts[1]![0])},${num(pts[1]![1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1]![0] - pts[i]![0];
    dx.push(h);
    m.push(h ? (pts[i + 1]![1] - pts[i]![1]) / h : 0);
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1]!;
    const b = m[i]!;
    if (a * b <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      t.push((w1 + w2) / (w1 / a + w2 / b));
    }
  }
  t.push(m[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${num(x0 + h)},${num(y0 + t[i]! * h)} ${num(x1 - h)},${num(y1 - t[i + 1]! * h)} ${num(x1)},${num(y1)}`;
  }
  return d;
}

/** For each row: the index of the outermost visible series on the negative [0] and positive [1] side. */
function topSegments(segs: { lo: number; hi: number }[][], rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    let neg = -1;
    let pos = -1;
    segs.forEach((col, si) => {
      const seg = col[r];
      if (!seg || seg.hi === seg.lo) return;
      if (seg.hi > 0 || seg.lo >= 0) pos = si;
      else neg = si;
    });
    out.push([neg, pos]);
  }
  return out;
}

function grid(root: SVGSVGElement, scale: LinearScale, plot: Frame["plot"], vertical: boolean, format: (v: number) => string): void {
  const g = svg("g", { class: "gistui-chart__grid", stroke: "currentColor" }, root);
  const labels = svg("g", {
    class: `gistui-chart__axis gistui-chart__axis--${vertical ? "x" : "y"}`,
    fill: "currentColor",
    "font-size": 11,
  }, root);
  for (const t of scale.ticks) {
    const p = scale(t);
    const cls = t === 0 && scale.domain[0] < 0 ? "gistui-chart__grid-line gistui-chart__zero" : "gistui-chart__grid-line";
    if (vertical) {
      svg("line", { class: cls, x1: p, x2: p, y1: plot.top, y2: plot.top + plot.height }, g);
      tickText(labels, p, plot.top + plot.height + 15, format(t), "middle");
    } else {
      svg("line", { class: cls, x1: plot.left, x2: plot.left + plot.width, y1: p, y2: p }, g);
      const txt = tickText(labels, plot.left - 6, p, format(t), "end");
      txt.setAttribute("dy", "0.32em");
    }
  }
}

function tickText(parent: SVGGElement, x: number, y: number, text: string, anchor: string): SVGTextElement {
  const t = svg("text", { class: "gistui-chart__tick", x, y, "text-anchor": anchor }, parent);
  t.textContent = text;
  return t;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Consecutive rows with values inside the window; a gap (null) splits a line or area. */
function runsOf(values: readonly (number | null)[], [a, b]: [number, number]): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let r = a; r <= b; r++) {
    if (values[r] === null || values[r] === undefined) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(r);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

export type { BandScale };
