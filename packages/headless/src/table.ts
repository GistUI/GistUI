/**
 * Table model shared by every framework: normalization (pipe table or array of objects), sorting and
 * pagination. Pure functions; the templates only render the view.
 */

import type { Cell, TableColumn, TableData } from "@gistui/core";
import { isNumericColumn, parseNumber } from "./number";

export { parseNumber } from "./number";

export interface TableSort {
  column: number;
  dir: "asc" | "desc";
}

export interface TableViewColumn extends TableColumn {
  index: number;
  align: "left" | "right";
  /** Current sort direction of this column, if it is the sort column. */
  sort: "asc" | "desc" | null;
}

export interface TableViewRow {
  /** Index in the source data: a stable key while sorting and paging. */
  index: number;
  cells: Cell[];
  /** Display text (raw cells for pipe tables). */
  text: string[];
}

export interface TableView {
  columns: TableViewColumn[];
  rows: TableViewRow[];
  total: number;
  page: number;
  pageCount: number;
}

export interface TableViewOptions {
  sort?: TableSort | null;
  /** 0-based page. Clamped to the available pages. */
  page?: number;
  /** Rows per page; 0 or undefined shows everything. */
  pageSize?: number;
}

/**
 * How a number column shows digits the author did not format, decided once for the whole column by
 * `normalizeTable`: "plain" for years and ids (shown as written), "group" when some cell needs
 * thousands separators, so every cell from 1,000 up gets them (`800`, `9,100`, `48,200`).
 */
export interface TableColumnInfo extends TableColumn {
  digits?: "plain" | "group";
}

// A header that names an identifier or a year, as a whole word: "Year", "Order ID", "userId",
// "zip", "Status code", "Invoice no." (not "Paid", "Video" or "No. of users").
const ID_HEADER = /(?:^|[^a-z])(?:years?|yr|ids?|zip|zipcode|postcode|codes?)(?:$|[^a-z])|(?:^|[^a-z])no\.?$|^#$/i;
const UNGROUPED = /^-?\d{5,}(?:\.\d+)?$/;

function plainDigits(name: string, cells: readonly Cell[]): boolean {
  if (ID_HEADER.test(name.replace(/([a-z])([A-Z])/g, "$1 $2").trim())) return true;
  // Years: every value is an integer between 1000 and 2999.
  let any = false;
  for (const c of cells) {
    if (c === null) continue;
    if (typeof c !== "number" || !Number.isInteger(c) || c < 1000 || c > 2999) return false;
    any = true;
  }
  return any;
}

const NORMALIZED = new WeakMap<TableData, TableData>();

/** Adds the column-level display decision to a pipe table (the same result for the same table). */
function withDigits(data: TableData): TableData {
  const cached = NORMALIZED.get(data);
  if (cached) return cached;
  let changed = false;
  const columns = data.columns.map((c, ci): TableColumnInfo => {
    if (c.type !== "number" || (c as TableColumnInfo).digits) return c;
    const digits = plainDigits(c.name, data.rows.map((r) => r[ci] ?? null)) ? "plain" : data.text.some((r) => UNGROUPED.test(r[ci] ?? "")) ? "group" : undefined;
    if (!digits) return c;
    changed = true;
    return { ...c, digits };
  });
  const out = changed ? { ...data, columns } : data;
  NORMALIZED.set(data, out);
  if (changed) NORMALIZED.set(out, out);
  return out;
}

/** Accepts a pipe table or an array of objects (a query result) and returns a pipe-table shape. */
export function normalizeTable(data: TableData | readonly unknown[] | null | undefined): TableData {
  if (!data) return { columns: [], rows: [], text: [] };
  if (!Array.isArray(data)) {
    const t = data as TableData;
    return Array.isArray(t.columns) && Array.isArray(t.rows) && Array.isArray(t.text) ? withDigits(t) : t;
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      for (const k of Object.keys(row)) if (!seen.has(k)) seen.add(k), names.push(k);
    }
  }
  if (!names.length) {
    // An array of scalars: one column.
    const rows = data.map((v) => [toCell(v)]);
    return { columns: [{ name: "Value", type: rows.every((r) => typeof r[0] === "number" || r[0] === null) ? "number" : "string" }], rows, text: rows.map((r) => [cellText(r[0]!)]) };
  }
  const rows = data.map((row) => names.map((n) => toCell(row && typeof row === "object" ? (row as Record<string, unknown>)[n] : undefined)));
  const columns: TableColumnInfo[] = names.map((name, i) => {
    const vals = rows.map((r) => r[i]!).filter((v) => v !== null);
    if (!(vals.length > 0 && vals.every((v) => typeof v === "number"))) return { name, type: "string" };
    // Years and ids are not quantities: `2024`, never `2,024`.
    return plainDigits(name, vals) ? { name, type: "number", digits: "plain" } : { name, type: "number" };
  });
  return { columns, rows, text: rows.map((r) => r.map((c, i) => (typeof c === "number" && columns[i]!.digits === "plain" ? String(c) : cellText(c)))) };
}

/** Sorts and pages a table. Nulls sort last in both directions; the source order breaks ties. */
export function tableView(input: TableData | readonly unknown[] | null | undefined, opts: TableViewOptions = {}): TableView {
  const data = normalizeTable(input);
  const sort = opts.sort && opts.sort.column < data.columns.length ? opts.sort : null;
  let rows: TableViewRow[] = data.rows.map((cells, index) => ({ index, cells, text: data.text[index] ?? cells.map(cellText) }));
  if (sort) {
    const col = sort.column;
    const keys = sortKeys(data, col);
    const dir = sort.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = keys ? keys[a.index]! : (a.cells[col] ?? null);
      const y = keys ? keys[b.index]! : (b.cells[col] ?? null);
      if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
      const c = keys ? (x as number) - (y as number) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return c === 0 ? a.index - b.index : c * dir;
    });
  }
  const total = rows.length;
  const size = opts.pageSize && opts.pageSize > 0 ? Math.floor(opts.pageSize) : 0;
  const pageCount = size ? Math.max(1, Math.ceil(total / size)) : 1;
  const page = Math.min(Math.max(0, Math.floor(opts.page ?? 0)), pageCount - 1);
  if (size) rows = rows.slice(page * size, page * size + size);
  const columns = data.columns.map((c, index) => ({
    ...c,
    index,
    align: c.type === "number" ? ("right" as const) : ("left" as const),
    sort: sort?.column === index ? sort.dir : null,
  }));
  return { columns, rows, total, page, pageCount };
}

/**
 * Numeric sort keys for a column, or null when it sorts as text. A number column reads cells the
 * parser could not (`(300)`, `3.4k`) from their text; a text column whose cells are mostly numbers as
 * people write them (`$1.2M`, `$900k`, `—`) sorts by value too, unless a `:s` hint says it is text.
 */
function sortKeys(data: TableData, col: number): (number | null)[] | null {
  const column = data.columns[col]!;
  const raw = (i: number): unknown => data.text[i]?.[col] ?? data.rows[i]![col];
  if (column.type === "number") return data.rows.map((cells, i) => (typeof cells[col] === "number" ? (cells[col] as number) : parseNumber(raw(i))));
  if (column.hinted) return null;
  const cells = data.rows.map((_, i) => raw(i));
  return isNumericColumn(cells) ? cells.map(parseNumber) : null;
}

/** Header click: ascending → descending → unsorted. */
export function nextSort(current: TableSort | null | undefined, column: number): TableSort | null {
  if (!current || current.column !== column) return { column, dir: "asc" };
  return current.dir === "asc" ? { column, dir: "desc" } : null;
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function cellText(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return c.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return c;
}

export interface TableFilter {
  /** Case-insensitive text matched against every cell. */
  query?: string;
  /** Column index → allowed display values (a row passes when its cell is one of them). */
  columns?: ReadonlyMap<number, ReadonlySet<string>>;
}

/** Keeps the rows that match a search query and column filters. Source order and row text are kept. */
export function filterTable(data: TableData, filter: TableFilter): TableData {
  const q = filter.query?.trim().toLowerCase() ?? "";
  const cols = filter.columns ? [...filter.columns].filter(([, set]) => set.size > 0) : [];
  if (!q && !cols.length) return data;
  const rows: TableData["rows"][number][] = [];
  const text: string[][] = [];
  data.rows.forEach((cells, i) => {
    const t = data.text[i] ?? cells.map(cellText);
    // The query matches a cell as written or as displayed (`48200` is shown, and found, as `48,200`).
    if (q && !t.some((s, c) => s.toLowerCase().includes(q) || (data.columns[c]?.type === "number" && displayCell(s, data.columns[c]!).toLowerCase().includes(q)))) return;
    if (cols.some(([c, set]) => !set.has((t[c] ?? "").trim()))) return;
    rows.push(cells);
    text.push(t);
  });
  return { ...data, rows, text };
}

/** Distinct display values of a column with their counts, in first-seen order. */
export function columnValues(data: TableData, column: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  data.rows.forEach((cells, i) => {
    const v = ((data.text[i] ?? cells.map(cellText))[column] ?? "").trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  });
  return [...counts].map(([value, count]) => ({ value, count }));
}

/**
 * Display text for a cell: numbers written without grouping (`48200`) get thousands separators; any
 * text the author formatted (`$412,000`, `+6.2%`) is shown as written. A column from `normalizeTable`
 * is formatted as a whole: years and ids stay plain, and once one cell needs separators every cell
 * from 1,000 up gets them. Without that information only 5+ digit numbers are grouped.
 */
export function displayCell(text: string, column: TableColumn): string {
  if (column.type !== "number") return text;
  const digits = (column as TableColumnInfo).digits;
  if (digits === "plain") return text;
  const m = /^(-?)(\d{4,})(\.\d+)?$/.exec(text);
  if (!m || (m[2]!.length < 5 && digits !== "group")) return text;
  // A double holds 15 digits exactly; longer integers are grouped as text so no digit changes.
  if (m[2]!.length <= 15) return Number(text).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return m[1]! + groupThousands(m[2]!) + (m[3] ?? "");
}

function groupThousands(digits: string): string {
  let out = digits.slice(0, digits.length % 3 || 3);
  for (let i = out.length; i < digits.length; i += 3) out += "," + digits.slice(i, i + 3);
  return out;
}

/** Most rows one page of a table shows: a program picks the page size, and its data can be huge. */
export const TABLE_MAX_PAGE = 200;
/** Above this many rows a table without a `pageSize` pages by itself, ten rows at a time. */
const TABLE_AUTO_FROM = 12;

/**
 * Rows per page for a table (0 = everything on one page). `pageSize` not given: ten per page for a
 * long table, one page for a short one. `pageSize:0`: one page, up to `TABLE_MAX_PAGE` rows (a
 * longer table pages at that size). `pageSize:n`: n rows, at most `TABLE_MAX_PAGE`.
 */
export function tablePageSize(asked: number | undefined, rows: number): number {
  if (asked === undefined || !Number.isFinite(asked) || asked < 0) return rows > TABLE_AUTO_FROM ? 10 : 0;
  if (asked < 1) return rows > TABLE_MAX_PAGE ? TABLE_MAX_PAGE : 0;
  return Math.min(TABLE_MAX_PAGE, Math.floor(asked));
}

/** Page buttons for a pager: first, last, the current page and its neighbours, with gaps as null. */
export function pageList(page: number, count: number, around = 1): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, count - 1]);
  for (let i = page - around; i <= page + around; i++) if (i > 0 && i < count - 1) keep.add(i);
  if (page <= 2) [1, 2, 3].forEach((i) => keep.add(i));
  if (page >= count - 3) [count - 4, count - 3, count - 2].forEach((i) => keep.add(i));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}
