/**
 * Block parser: a line-based, CommonMark-flavoured subset (ATX headings, paragraphs, fenced code,
 * thematic breaks, block quotes, lists with task items, GFM tables). There are no setext headings,
 * reference links or loose/tight list distinctions, so appending text can never change a block that
 * a later block has already closed. That property is what lets the widget freeze completed blocks
 * (and, inside an open list or table, completed items and rows: see `TopBlock.parts`).
 *
 * The source is model output, re-parsed on every streamed frame: every line test is a linear scan,
 * and quotes and lists nest at most `MAX_DEPTH` deep (deeper content is plain text).
 */

/** Containers (block quotes, lists) nested deeper than this are not parsed: their content is a paragraph. */
export const MAX_DEPTH = 32;

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { k: "p"; text: string }
  | { k: "h"; level: number; text: string }
  | { k: "code"; lang: string; text: string; closed: boolean }
  | { k: "hr" }
  | { k: "quote"; children: Block[] }
  | { k: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { k: "table"; align: Align[]; head: string[]; rows: string[][] };

export interface ListItem {
  /** `null` for a normal item, true/false for a task item `[x]` / `[ ]`. */
  checked: boolean | null;
  children: Block[];
}

/** A top-level block with its source range: `start` is its first character, `end` its last line's end. */
export interface TopBlock {
  block: Block;
  start: number;
  end: number;
  /** A list: where each item starts. A table: where each body row starts. Offsets like `start`. */
  parts?: number[];
}

interface Span {
  block: Block;
  from: number;
  /** Exclusive line index after the block's last non-blank line. */
  to: number;
  /** Line of each list item / table body row. */
  parts?: number[];
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const ATX = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/;
const QUOTE = /^ {0,3}> ?/;
const LIST = /^( {0,3})([-*+]|(\d{1,9})([.)]))(?=[ \t]|$)([ \t]*)(.*)$/;
const TASK = /^\[([ xX])\](?:[ \t]+|$)/;

const isBlank = (l: string) => /^[ \t]*$/.test(l);

/** A thematic break: 3+ of the same `-`, `*` or `_`, with optional spaces (a char scan: this runs on every line). */
function isHr(l: string): boolean {
  let i = 0;
  while (l.charCodeAt(i) === 32) i++;
  if (i > 3) return false;
  let ch = 0;
  let count = 0;
  for (; i < l.length; i++) {
    const c = l.charCodeAt(i);
    if (c === 32 || c === 9) continue;
    if (c !== 45 && c !== 42 && c !== 95) return false; // - * _
    if (!ch) ch = c;
    else if (c !== ch) return false;
    count++;
  }
  return count >= 3;
}

/**
 * A table delimiter row: `|---|:-:|` (cells of dashes with optional colons, between optional outer
 * pipes). A character scan: the regex for this backtracks quadratically on a long run of spaces.
 */
function isDelimRow(l: string): boolean {
  const n = l.length;
  let i = 0;
  const blanks = () => {
    while (i < n && (l.charCodeAt(i) === 32 || l.charCodeAt(i) === 9)) i++;
  };
  blanks();
  if (l[i] === "|") i++;
  for (;;) {
    blanks();
    if (l[i] === ":") i++;
    const dashes = i;
    while (l[i] === "-") i++;
    if (i === dashes) return false;
    if (l[i] === ":") i++;
    blanks();
    if (i >= n) return true;
    if (l[i] !== "|") return false;
    i++;
    const cell = i;
    blanks();
    if (i >= n) return true; // the closing pipe
    i = cell;
  }
}

/** The table that starts at line `i`: a row with a pipe, then a delimiter row with as many cells. */
function tableAt(lines: readonly string[], i: number): { head: string[]; align: Align[] } | null {
  const line = lines[i]!;
  if (!line.includes("|") || i + 1 >= lines.length) return null;
  const next = lines[i + 1]!;
  if (!next.includes("|") || !isDelimRow(next)) return null;
  const head = splitCells(line);
  const align = splitCells(next).map(alignOf);
  return align.length === head.length ? { head, align } : null;
}

/**
 * Parses a document into top-level blocks with source offsets. With `table` (a column count), the
 * source continues an open table whose header and earlier rows are already rendered: the first
 * block is that table's remaining rows (possibly none).
 */
export function parseTop(src: string, table?: number): TopBlock[] {
  const raw = src.split("\n");
  const starts: number[] = [];
  let off = 0;
  for (const l of raw) {
    starts.push(off);
    off += l.length + 1;
  }
  return parseLines(raw.map(clean), 0, table).map((s) => {
    const top: TopBlock = { block: s.block, start: starts[s.from]!, end: s.to > s.from ? starts[s.to - 1]! + raw[s.to - 1]!.length : starts[s.from]! };
    if (s.parts) top.parts = s.parts.map((line) => starts[line]!);
    return top;
  });
}

/** Drops a trailing `\r` and expands leading tabs to 4 spaces (column arithmetic assumes spaces). */
function clean(l: string): string {
  if (l.endsWith("\r")) l = l.slice(0, -1);
  if (!l.startsWith("\t") && !l.startsWith(" \t")) return l;
  const m = /^[ \t]+/.exec(l)!;
  let col = 0;
  for (const ch of m[0]) col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
  return " ".repeat(col) + l.slice(m[0].length);
}

interface Marker {
  indent: number;
  ordered: boolean;
  /** Bullet character or ordered delimiter; items of one list share it. */
  key: string;
  start: number;
  /** Column where the item's content starts. */
  width: number;
  content: string;
  empty: boolean;
}

function listMarker(line: string): Marker | null {
  const m = LIST.exec(line);
  if (!m || isHr(line)) return null;
  const indent = m[1]!.length;
  const marker = m[2]!;
  const spaces = m[5]!.length;
  const rest = m[6]!;
  const empty = rest.trim() === "";
  const gap = empty || spaces > 4 ? 1 : spaces;
  const width = indent + marker.length + gap;
  return {
    indent,
    ordered: m[3] !== undefined,
    key: m[4] ?? marker,
    start: m[3] !== undefined ? Number(m[3]) : 1,
    width,
    content: empty ? "" : line.slice(Math.min(width, line.length)),
    empty,
  };
}

function fenceOpen(line: string): { indent: number; ch: string; len: number; lang: string } | null {
  const m = FENCE.exec(line);
  if (!m) return null;
  if (m[2]![0] === "`" && m[3]!.includes("`")) return null;
  return { indent: m[1]!.length, ch: m[2]![0]!, len: m[2]!.length, lang: m[3]!.trim().split(/\s+/)[0] ?? "" };
}

/** Lines that end a paragraph without a blank line in between. */
function interruptsParagraph(line: string): boolean {
  if (ATX.test(line) || isHr(line) || QUOTE.test(line) || fenceOpen(line)) return true;
  const lm = listMarker(line);
  return lm !== null && !lm.empty && (!lm.ordered || lm.start === 1);
}

/** Lines that start a block of their own (they end lazy continuation and table rows). */
function startsBlock(line: string): boolean {
  return isBlank(line) || ATX.test(line) || isHr(line) || QUOTE.test(line) || fenceOpen(line) !== null || listMarker(line) !== null;
}

function leadingSpaces(l: string): number {
  let i = 0;
  while (l.charCodeAt(i) === 32) i++;
  return i;
}

/** Content nested too deep: one paragraph of its text. */
function flat(lines: readonly string[]): Span[] {
  const text: string[] = [];
  let from = -1;
  let to = 0;
  lines.forEach((l, i) => {
    if (isBlank(l)) return;
    if (from < 0) from = i;
    to = i + 1;
    text.push(l.replace(/^[ \t]+/, ""));
  });
  return from < 0 ? [] : [{ block: { k: "p", text: text.join("\n") }, from, to }];
}

export function parseLines(lines: readonly string[], depth = 0, table?: number): Span[] {
  if (depth >= MAX_DEPTH) return flat(lines);
  const out: Span[] = [];
  const n = lines.length;
  let i = 0;
  if (table !== undefined) {
    const rows: string[][] = [];
    const parts: number[] = [];
    for (; i < n && !startsBlock(lines[i]!); i++) {
      parts.push(i);
      rows.push(fit(splitCells(lines[i]!), table));
    }
    out.push({ block: { k: "table", align: [], head: [], rows }, from: 0, to: i, parts });
  }
  while (i < n) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }
    const from = i;

    const f = fenceOpen(line);
    if (f) {
      const body: string[] = [];
      let closed = false;
      for (i++; i < n; i++) {
        const l = lines[i]!;
        const c = FENCE_CLOSE.exec(l);
        if (c && c[1]![0] === f.ch && c[1]!.length >= f.len) {
          closed = true;
          i++;
          break;
        }
        body.push(l.slice(Math.min(f.indent, leadingSpaces(l))));
      }
      out.push({ block: { k: "code", lang: f.lang, text: body.join("\n"), closed }, from, to: i });
      continue;
    }

    const h = ATX.exec(line);
    if (h) {
      const text = h[2]!.trim().replace(/(^|[ \t])#+$/, "").trim();
      out.push({ block: { k: "h", level: h[1]!.length, text }, from, to: ++i });
      continue;
    }

    if (isHr(line)) {
      out.push({ block: { k: "hr" }, from, to: ++i });
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < n) {
        const l = lines[i]!;
        const q = QUOTE.exec(l);
        if (q) inner.push(l.slice(q[0].length));
        // Lazy continuation of a paragraph inside the quote.
        else if (inner.length && !isBlank(inner[inner.length - 1]!) && !startsBlock(l)) inner.push(l);
        else break;
        i++;
      }
      out.push({ block: { k: "quote", children: parseLines(inner, depth + 1).map((s) => s.block) }, from, to: i });
      continue;
    }

    const lm = listMarker(line);
    if (lm) {
      const items: ListItem[] = [];
      const parts: number[] = [];
      let to = i + 1;
      while (i < n) {
        const m = listMarker(lines[i]!);
        if (!m || m.ordered !== lm.ordered || m.key !== lm.key) break;
        parts.push(i);
        const body = [m.content];
        let prevBlank = false;
        to = i + 1;
        for (i++; i < n; i++) {
          const l = lines[i]!;
          if (isBlank(l)) {
            body.push("");
            prevBlank = true;
            continue;
          }
          if (leadingSpaces(l) >= m.width) body.push(l.slice(m.width));
          else if (prevBlank || startsBlock(l)) break;
          else body.push(l); // lazy continuation
          prevBlank = false;
          to = i + 1;
        }
        while (body.length > 1 && isBlank(body[body.length - 1]!)) body.pop();
        items.push(listItem(body, depth));
      }
      out.push({ block: { k: "list", ordered: lm.ordered, start: lm.start, items }, from, to, parts });
      i = to;
      continue;
    }

    const t = tableAt(lines, i);
    if (t) {
      const rows: string[][] = [];
      const parts: number[] = [];
      for (i += 2; i < n && !startsBlock(lines[i]!); i++) {
        parts.push(i);
        rows.push(fit(splitCells(lines[i]!), t.head.length));
      }
      out.push({ block: { k: "table", align: t.align, head: t.head, rows }, from, to: i, parts });
      continue;
    }

    // A paragraph runs to a blank line, a line that starts another block, or a table's header row.
    const buf = [line.replace(/^[ \t]+/, "")];
    for (i++; i < n && !isBlank(lines[i]!) && !interruptsParagraph(lines[i]!) && !tableAt(lines, i); i++) buf.push(lines[i]!.replace(/^[ \t]+/, ""));
    out.push({ block: { k: "p", text: buf.join("\n") }, from, to: i });
  }
  return out;
}

function listItem(body: string[], depth: number): ListItem {
  let checked: boolean | null = null;
  const m = TASK.exec(body[0] ?? "");
  if (m) {
    checked = m[1] !== " ";
    body[0] = body[0]!.slice(m[0].length);
  }
  return { checked, children: parseLines(body, depth + 1).map((s) => s.block) };
}

/** Splits a table row on unescaped `|`; `\|` is a literal pipe. */
export function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : null;
}

function fit(cells: string[], n: number): string[] {
  if (cells.length > n) return cells.slice(0, n);
  while (cells.length < n) cells.push("");
  return cells;
}
