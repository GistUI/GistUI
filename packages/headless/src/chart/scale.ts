/** Scales, ticks, stacking and layout helpers. Pure functions, no DOM. */

import type { ChartSeries } from "./model";

export interface Ticks {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/**
 * "Nice" axis ticks covering [min, max] with about `count` steps of 1, 2, 2.5 or 5 × 10ⁿ.
 * A zero-width domain is widened so the axis never collapses.
 */
export function niceTicks(min: number, max: number, count = 5): Ticks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min === 0) max = 1;
    else if (min > 0) min = 0;
    else max = 0;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo, i = 0; v <= hi + step / 2 && i < 100; v += step, i++) ticks.push(round(v, step));
  return { min: round(lo, step), max: round(hi, step), step, ticks };
}

/** Removes floating-point noise (0.30000000000000004 → 0.3) relative to the tick step. */
function round(v: number, step: number): number {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  const r = Number(v.toFixed(Math.min(digits, 12)));
  return Object.is(r, -0) ? 0 : r;
}

export interface LinearScale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  invert(px: number): number;
}

export interface LinearOptions {
  /** Extend the domain to nice tick values (default true). */
  nice?: boolean;
  /** Approximate tick count (default 5). */
  count?: number;
}

/** Maps a domain onto a pixel range. With `nice`, the domain snaps to the tick grid. */
export function linearScale(domain: [number, number], range: [number, number], opts: LinearOptions = {}): LinearScale {
  let [d0, d1] = domain;
  let ticks: number[];
  if (opts.nice !== false) {
    const t = niceTicks(d0, d1, opts.count ?? 5);
    d0 = t.min;
    d1 = t.max;
    ticks = t.ticks;
  } else {
    if (d0 === d1) d1 = d0 + 1;
    ticks = niceTicks(d0, d1, opts.count ?? 5).ticks.filter((v) => v >= Math.min(d0, d1) && v <= Math.max(d0, d1));
  }
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);
  const scale = ((v: number) => r0 + (v - d0) * k) as LinearScale;
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  scale.ticks = ticks;
  scale.invert = (px: number) => d0 + (px - r0) / (k || 1);
  return scale;
}

export interface BandScale {
  /** Distance between the starts of neighbouring bands. */
  step: number;
  /** Width of one band (step minus padding). */
  bandwidth: number;
  /** Start of band `i`. */
  pos(i: number): number;
  /** Center of band `i`. */
  center(i: number): number;
  /** Band index under a pixel position, clamped to [0, n-1]. */
  index(px: number): number;
}

/** Splits a pixel range into `n` equal bands with `padding` (0–1) of each step left empty. */
export function bandScale(n: number, range: [number, number], padding = 0.2): BandScale {
  const [r0, r1] = range;
  const count = Math.max(1, n);
  const step = (r1 - r0) / count;
  const bandwidth = Math.max(0, step * (1 - padding));
  const offset = (step - bandwidth) / 2;
  return {
    step,
    bandwidth,
    pos: (i) => r0 + i * step + offset,
    center: (i) => r0 + i * step + step / 2,
    index: (px) => Math.min(count - 1, Math.max(0, Math.floor((px - r0) / (step || 1)))),
  };
}

export interface StackSegment {
  /** Lower and upper value of the segment (equal for a gap). */
  lo: number;
  hi: number;
}

/**
 * Stacks series per category. Positive and negative values stack away from zero separately, so a
 * negative value never cancels a positive one. Returns `[series][row]` segments; a gap is zero height.
 */
export function stack(series: readonly ChartSeries[], rows: number): StackSegment[][] {
  const pos = new Array<number>(rows).fill(0);
  const neg = new Array<number>(rows).fill(0);
  return series.map((s) =>
    Array.from({ length: rows }, (_, r) => {
      const v = s.values[r];
      if (v === null || v === undefined) return { lo: pos[r]!, hi: pos[r]! };
      if (v >= 0) {
        const lo = pos[r]!;
        pos[r] = lo + v;
        return { lo, hi: lo + v };
      }
      const hi = neg[r]!;
      neg[r] = hi + v;
      return { lo: hi + v, hi };
    }),
  );
}

/**
 * Min and max over visible series (stacked totals when `stacked`). With `zero`, the extent always
 * includes 0, as bar and area baselines need.
 */
export function valueExtent(
  series: readonly ChartSeries[],
  rows: number,
  opts: { stacked?: boolean; zero?: boolean } = {},
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  if (opts.stacked) {
    for (const col of stack(series, rows)) {
      for (const seg of col) {
        if (seg.lo < min) min = seg.lo;
        if (seg.hi > max) max = seg.hi;
      }
    }
  } else {
    for (const s of series) {
      for (const v of s.values) {
        if (v === null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (min === Infinity) return [0, 1];
  if (opts.zero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  return [min, max];
}

export interface PieSlice {
  /** Category row. */
  row: number;
  value: number;
  /** Angles in radians, clockwise from 12 o'clock. */
  start: number;
  end: number;
}

/** Lays out slices for the positive values; gaps, zeros and negatives get no slice. */
export function pieLayout(values: readonly (number | null)[], skip?: ReadonlySet<number>): PieSlice[] {
  let total = 0;
  values.forEach((v, row) => {
    if (v !== null && v > 0 && !skip?.has(row)) total += v;
  });
  if (total <= 0) return [];
  const out: PieSlice[] = [];
  let a = 0;
  values.forEach((v, row) => {
    if (v === null || v <= 0 || skip?.has(row)) return;
    const end = a + (v / total) * Math.PI * 2;
    out.push({ row, value: v, start: a, end });
    a = end;
  });
  return out;
}
