/**
 * One number parser for program data, shared by the chart model and the table (sorting, display).
 * It reads the way people and models write numbers: `$1.2M`, `3.4k`, `+12%`, `(300)`, `−5`, `1,234`.
 * It is en-style only: a comma groups thousands, a dot is the decimal point. An ambiguous `1,5` is
 * not a number here (null), never 15.
 */

/** Longer cells are never numbers; this also keeps a huge cell from being scanned. */
const MAX_LEN = 64;
const CURRENCY = "$€£¥₹₩₽₺₪₫฿₴₦₱";
/** Case as written: `k`/`K` thousand, `M` million, `B` billion, `T` trillion (`m` and `b` are units, not numbers). */
const SUFFIX: Readonly<Record<string, number>> = { k: 1e3, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
// sign, currency, sign, integer digits with commas, decimals, exponent, suffix, currency, percent.
const NUMERIC = new RegExp(`^([+\\-−])?([${CURRENCY}])?([+\\-−])?(\\d[\\d,]*)?(?:\\.(\\d*))?(?:[eE]([+\\-]?\\d+))?([kKMBT])?([${CURRENCY}])?(%)?$`);
const GROUPED = /^\d{1,3}(?:,\d{3})+$/;
/** Cells that mean "no value": dashes of any kind, `n/a`, `null`… */
const PLACEHOLDER = /^(?:[-‐-―−]+|n\/a|n\.a\.|na|null|none|nan|tbd|\?)$/i;

/**
 * A finite number, or null. Numbers pass through; strings may carry a currency symbol, thousands
 * separators, a `k`/`M`/`B`/`T` suffix, a percent sign (`12%` is 12), an accounting negative `(300)`
 * or a Unicode minus. Dashes, `n/a`, empty cells and any other text are null.
 */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.length > MAX_LEN) return null;
  let s = v.replace(/\s+/g, "");
  let negative = false;
  if (s.length > 2 && s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  const m = NUMERIC.exec(s);
  if (!m) return null;
  const [, sign1, , sign2, int, frac, exp, suffix] = m;
  if (!int && !frac) return null; // no digits at all: "", "$", "%", "."
  if ((sign1 && sign2) || (negative && (sign1 || sign2))) return null;
  if (int?.includes(",") && !GROUPED.test(int)) return null; // "1,5" and "1,2345" are ambiguous
  let n = Number(`${int ? int.replace(/,/g, "") : "0"}.${frac || "0"}${exp ? `e${exp}` : ""}`);
  if (suffix) n *= SUFFIX[suffix]!;
  const sign = sign1 ?? sign2;
  if (negative || (sign !== undefined && sign !== "+")) n = -n;
  return Number.isFinite(n) ? n : null;
}

/** True for a cell with nothing to read: null, an empty string, a dash, `n/a`, a non-finite number. */
export function isBlankCell(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.trim();
  return s === "" || (s.length <= 8 && PLACEHOLDER.test(s));
}

/** Share of a column's non-blank cells that must parse for the column to count as numeric. */
const NUMERIC_SHARE = 0.6;

/**
 * A column is numeric when it has at least one number and most of its non-blank cells parse; the
 * cells that do not are gaps. One stray `n/a` or `—` never turns a column of numbers into text.
 */
export function isNumericColumn(values: readonly unknown[]): boolean {
  let filled = 0;
  let parsed = 0;
  for (const v of values) {
    if (isBlankCell(v)) continue;
    filled++;
    if (parseNumber(v) !== null) parsed++;
  }
  return parsed > 0 && parsed >= filled * NUMERIC_SHARE;
}
