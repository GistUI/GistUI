/**
 * Chart model: normalizes a pipe table or an array of objects into categories and numeric series.
 * The first column (or the `x` column) is the x axis / category; every other numeric column is a series.
 */

import type { TableData } from "@gistui/core";
import { isNumericColumn, parseNumber } from "../number";

export type ChartData = TableData | readonly Record<string, unknown>[] | null | undefined;

export interface ChartSeries {
  /** Column name, unique within the model. */
  key: string;
  /** Display name (the column name). */
  name: string;
  /** One value per category; `null` is a gap. Never NaN. */
  values: (number | null)[];
  /** Position among all series, stable when others are hidden: drives the color (`--gistui-chart-N`). */
  index: number;
}

export interface ChartModel {
  /** Column used for x / category. Empty when the data has no columns. */
  xKey: string;
  categories: (string | number)[];
  /** True when every category is a finite number (numeric x for scatter). */
  xNumeric: boolean;
  series: ChartSeries[];
  /** Number of rows (categories). */
  rows: number;
}

export interface ChartModelOptions {
  /** Column name for x; matched case-insensitively. Defaults to the first column. */
  x?: string | undefined;
}

const EMPTY: ChartModel = { xKey: "", categories: [], xNumeric: false, series: [], rows: 0 };

/** A chart reads at most this many rows: program data can be any size, and a plot cannot show more. */
export const CHART_MAX_ROWS = 5000;

/** Builds the model. Never throws: malformed data gives an empty model. */
export function createChartModel(data: ChartData, opts: ChartModelOptions = {}): ChartModel {
  if (!data) return EMPTY;
  if (isTable(data)) return fromTable(data, opts);
  if (Array.isArray(data)) return fromObjects(data as readonly Record<string, unknown>[], opts);
  return EMPTY;
}

/** True when the model has at least one non-null value to draw. */
export function hasValues(m: ChartModel): boolean {
  return m.rows > 0 && m.series.some((s) => s.values.some((v) => v !== null));
}

function isTable(d: unknown): d is TableData {
  return typeof d === "object" && d !== null && !Array.isArray(d) && "columns" in d && "rows" in d;
}

function pickX(names: readonly string[], x: string | undefined): number {
  if (x) {
    const i = names.findIndex((n) => n.toLowerCase() === x.toLowerCase());
    if (i >= 0) return i;
  }
  return 0;
}

function fromTable(t: TableData, opts: ChartModelOptions): ChartModel {
  const names = t.columns.map((c) => c.name);
  if (!names.length) return EMPTY;
  const xi = pickX(names, opts.x);
  const rows = t.rows.length > CHART_MAX_ROWS ? t.rows.slice(0, CHART_MAX_ROWS) : t.rows;
  const categories = rows.map((r) => category(r[xi]));
  const series: ChartSeries[] = [];
  const used = new Set<string>();
  // A cell the pipe parser could not read as a number (`(300)`, `3.4k`, `$1.2M`) is read from its text.
  const cell = (ri: number, ci: number) => rows[ri]![ci] ?? t.text?.[ri]?.[ci];
  t.columns.forEach((c, ci) => {
    if (ci === xi) return;
    let values: (number | null)[];
    if (c.type === "number") values = rows.map((r, ri) => toValue(r[ci]) ?? parseNumber(t.text?.[ri]?.[ci]));
    else {
      // The parser types a column from its first data row, so `—` or `$1.2M` there makes a column
      // of numbers a text column. An explicit `:s` hint stays text.
      if (c.hinted) return;
      const raw = rows.map((_, ri) => cell(ri, ci));
      if (!isNumericColumn(raw)) return;
      values = raw.map(parseNumber);
    }
    series.push({ key: uniqueKey(c.name, used), name: c.name, values, index: series.length });
  });
  return {
    xKey: names[xi]!,
    categories,
    xNumeric: t.columns[xi]!.type === "number" && categories.every((c) => typeof c === "number"),
    series,
    rows: rows.length,
  };
}

function fromObjects(all: readonly Record<string, unknown>[], opts: ChartModelOptions): ChartModel {
  const rows = all.length > CHART_MAX_ROWS ? all.slice(0, CHART_MAX_ROWS) : all;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        names.push(k);
      }
    }
  }
  if (!names.length) return EMPTY;
  const xi = pickX(names, opts.x);
  const xKey = names[xi]!;
  const get = (r: unknown, k: string) => (r && typeof r === "object" ? (r as Record<string, unknown>)[k] : undefined);
  const categories = rows.map((r) => category(get(r, xKey)));
  const series: ChartSeries[] = [];
  const used = new Set<string>();
  names.forEach((k, ki) => {
    if (ki === xi) return;
    const raw = rows.map((r) => get(r, k));
    if (!isNumericColumn(raw)) return;
    series.push({ key: uniqueKey(k, used), name: k, values: raw.map(parseNumber), index: series.length });
  });
  const xRaw = rows.map((r) => get(r, xKey));
  const xNumeric = isPlainNumericColumn(xRaw);
  return {
    xKey,
    categories: xNumeric ? xRaw.map((v) => plainNumber(v) ?? 0) : categories,
    xNumeric,
    series,
    rows: rows.length,
  };
}

/**
 * The x column stays strict: it is a numeric axis only when every non-empty value is a plain number
 * (`1200`, `"1,200"`, `"12%"`). Labels like `1k` or `Q1` are categories and are shown as written.
 */
function isPlainNumericColumn(values: readonly unknown[]): boolean {
  let any = false;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue; // a gap, not text
    if (plainNumber(v) === null) return false;
    any = true;
  }
  return any;
}

function plainNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.length > 64) return null;
  const s = v.replace(/[\s,$€£¥%+]/g, "");
  if (!/^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A value for a series: see `parseNumber` (`$1.2M`, `3.4k`, `+12%`, `(300)`); anything else is a gap. */
export function toValue(v: unknown): number | null {
  return parseNumber(v);
}

function category(v: unknown): string | number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

function uniqueKey(name: string, used: Set<string>): string {
  let k = name;
  for (let i = 2; used.has(k); i++) k = `${name} (${i})`;
  used.add(k);
  return k;
}
