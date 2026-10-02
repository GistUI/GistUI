/**
 * Pipe-row tables:
 *   rev = |Month|Revenue:n|Delta
 *   |Apr|$84,500|+6%
 * The first row is the header. A column's type comes from a header hint (`:n` number, `:s` string)
 * or from the first data row. Numeric cells drop `, $ € £ ¥ % +` and spaces for `rows`, while `text`
 * keeps the raw cell for display. `|---|` separator rows are skipped. Rows are added one line at a
 * time, so a streaming table never re-parses earlier rows.
 */

import type { Cell, TableColumn, TableData } from "./ast";

export class TableBuilder {
  private columns: TableColumn[] | null = null;
  private hinted: boolean[] = [];
  private typed = false;
  private rows: Cell[][] = [];
  private text: string[][] = [];
  private cached: TableData | null = null;
  /** Characters of the input already consumed as complete lines (see `addText`). */
  consumed = 0;

  /**
   * Adds every complete line of `text` that has not been consumed yet. With `partial`, the last line
   * is treated as still growing and left for a later call.
   */
  addText(text: string, partial: boolean): void {
    let start = this.consumed;
    for (;;) {
      const nl = text.indexOf("\n", start);
      if (nl < 0) break;
      this.addLine(text.slice(start, nl));
      start = nl + 1;
    }
    if (!partial && start < text.length) {
      this.addLine(text.slice(start));
      start = text.length;
    }
    this.consumed = start;
  }

  addLine(line: string): void {
    const cells = splitRow(line);
    if (!cells) return;
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
    if (!this.columns) {
      this.columns = cells.map((c) => {
        const m = /^(.*?):([ns])$/.exec(c);
        this.hinted.push(Boolean(m));
        return m ? { name: m[1]!.trim(), type: m[2] === "n" ? "number" : "string", hinted: true } : { name: c, type: "string" };
      });
      this.cached = null;
      return;
    }
    const cols = this.columns;
    if (!this.typed) {
      this.typed = true;
      cols.forEach((col, i) => {
        if (!this.hinted[i]) col.type = toNumber(cells[i] ?? "") !== null ? "number" : "string";
      });
    }
    const row: Cell[] = [];
    const raw: string[] = [];
    for (let i = 0; i < cols.length; i++) {
      const c = cells[i] ?? "";
      raw.push(c);
      row.push(cols[i]!.type === "number" ? toNumber(c) : c === "" ? null : c);
    }
    this.rows.push(row);
    this.text.push(raw);
    this.cached = null;
  }

  get rowCount(): number {
    return this.rows.length;
  }

  /** The table so far. The same object is returned until another row or the header arrives. */
  result(): TableData {
    if (!this.cached) {
      this.cached = {
        columns: (this.columns ?? []).map((c) => ({ ...c })),
        rows: this.rows.slice(),
        text: this.text.slice(),
      };
    }
    return this.cached;
  }
}

/** Splits `|a|b\|c|d|` into cells. Returns null if the line is not a row. */
export function splitRow(line: string): string[] | null {
  const s = line.trim();
  if (!s.startsWith("|")) return null;
  const cells: string[] = [];
  let cur = "";
  for (let i = 1; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  // A trailing `|` closes the last cell; without one, the remainder is the last cell.
  if (cur.trim() !== "" || !s.endsWith("|")) cells.push(cur.trim());
  return cells;
}

// `\d+(\.\d*)?`, not `\d+\.?\d*`: the latter backtracks quadratically on a long digit run.
const NUM = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

export function toNumber(cell: string): number | null {
  const s = cell.replace(/[\s,$€£¥%+]/g, "");
  if (!NUM.test(s)) return null;
  return Number(s);
}
