/** Number formatting for axes (compact) and tooltips (full). */

const UNITS: readonly (readonly [number, string])[] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"], [1, ""]];

/** Compact label for one value: 1200 → "1.2k", 3400000 → "3.4M", 0.25 → "0.25". For an axis, use `tickFormat`. */
export function formatTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const i = unitOf(a);
  const m = trim(a / UNITS[i]![0]);
  // The mantissa rounded up to the next unit: 999,500 is "1M", not "1000k".
  if (m === "1000" && i > 0) return `${sign}1${UNITS[i - 1]![1]}`;
  return sign + m + UNITS[i]![1];
}

/** Full value for tooltips and the screen-reader table: 84500 → "84,500", 62.5 → "62.5". */
export function formatValue(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return FULL.format(v);
}

/**
 * Labels for one axis. The decimals come from the tick step, so neighbouring ticks never share a
 * label: 1500/1525/1550 is "1,500", "1,525", "1,550" (not "1.5k", "1.52k", "1.55k"), and 0.001
 * steps keep three decimals. A value is abbreviated only while that keeps the step (at most two
 * decimals of the unit); otherwise the whole axis is written in full. With `plain`, numbers are
 * written as they are, with no unit and no separators (years).
 */
export function tickFormat(ticks: readonly number[], opts: { plain?: boolean } = {}): (v: number) => string {
  const step = stepOf(ticks);
  const own = decimalsOf(step);
  if (opts.plain) return (v) => (Number.isFinite(v) ? fixed(v, own) : "");
  const abbreviate = ticks.every((t) => {
    const size = UNITS[unitOf(Math.abs(t))]![0];
    return size === 1 || !Number.isFinite(t) || decimalsOf(step / size) <= 2;
  });
  if (!abbreviate) {
    const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.min(own, 20) });
    return (v) => (Number.isFinite(v) ? full.format(v) : "");
  }
  return (v) => {
    if (!Number.isFinite(v)) return "";
    const [size, unit] = UNITS[unitOf(Math.abs(v))]!;
    return fixed(v / size, decimalsOf(step / size)) + unit;
  };
}

/** True when every value is an integer between 1000 and 2999: an axis of years, not of amounts. */
export function looksLikeYears(values: readonly unknown[]): boolean {
  if (!values.length) return false;
  for (const v of values) if (typeof v !== "number" || !Number.isInteger(v) || v < 1000 || v > 2999) return false;
  return true;
}

const FULL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function unitOf(a: number): number {
  for (let i = 0; i < UNITS.length - 1; i++) if (a >= UNITS[i]![0]) return i;
  return UNITS.length - 1;
}

function trim(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Smallest distance between two neighbouring ticks (the value itself for a single tick). */
function stepOf(ticks: readonly number[]): number {
  let step = Infinity;
  for (let i = 1; i < ticks.length; i++) {
    const d = Math.abs(ticks[i]! - ticks[i - 1]!);
    if (d > 0 && d < step) step = d;
  }
  if (step !== Infinity) return step;
  const only = Math.abs(ticks[0] ?? 0);
  return Number.isFinite(only) && only > 0 ? only : 1;
}

/** Decimal places needed to write `x` exactly (floating-point noise aside); 13 when 12 are not enough. */
function decimalsOf(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  for (let d = 0; d <= 12; d++) {
    const s = x * 10 ** d;
    const r = Math.round(s);
    if (r >= 1 && Math.abs(s - r) < 1e-6 * r) return d;
  }
  return 13;
}

/** `v` with exactly the decimals the step needs, without trailing zeros or a negative zero. */
function fixed(v: number, decimals: number): string {
  if (decimals > 12) return String(Number(v.toPrecision(6)));
  const s = v.toFixed(decimals);
  const t = s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  return t === "-0" ? "0" : t;
}
