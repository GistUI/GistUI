/**
 * Streaming entry point.
 *
 *   const s = createStream(lib)
 *   s.push(chunk)      // lexes the new bytes; completed statements are parsed once and materialized
 *   s.flush()          // updates the open tail statement, commits patches, notifies subscribers
 *   s.end()            // finishes: auto-closes, drops unresolved refs, reports errors
 *
 * `flush()` is meant to run at most once per frame; the React renderer calls it from rAF.
 */

import type { UrlPolicy } from "./url-policy";
import type { Stmt } from "./ast";
import { STRICT_CODES, type GistUIError } from "./errors";
import { Lexer, type RawStatement } from "./lexer";
import { parseStatement, type ParseProblem } from "./parser";
import { Program } from "./program";
import type { Library } from "./schema";
import { NodeStore, type Patch, type SnapshotNode } from "./store";
import { TableBuilder } from "./table";
import { readString } from "./tokenizer";
import { sameAst } from "./util";

export interface StreamOptions {
  /** Chat text with ```gistui fences: only fenced code is parsed; other lines are reported as prose. */
  inline?: boolean;
  store?: NodeStore;
  /** Receives non-GistUI lines (inline-mode chat text, or leaked prose). */
  onProse?: (text: string, line: number) => void;
  /**
   * Hosts that images, video and backgrounds may load from (`"cdn.example.com"`, `"*.example.com"`).
   * Without it, any host is allowed for a URL written out in the program. See url-policy.ts.
   */
  allowedHosts?: readonly string[] | undefined;
}

const TABLE_HEAD = /^\s*([A-Za-z_]\w*)\s*=\s*/;
/** Tails longer than this are re-parsed only after growing by 1/8, which keeps huge statements linear. */
const BIG_TAIL = 2048;

export class GistUIStream {
  /** Replaced by `rewrite()`; the runtime reads it through the stream, so it follows. */
  program: Program;
  readonly store: NodeStore;
  private lexer: Lexer;
  private decoder: TextDecoder | null = null;
  private carry = "";
  private started = false;
  private streamErrors: GistUIError[] = [];
  private ended = false;
  // Open tail statement state.
  private tailLine = -1;
  private tailTable: TableBuilder | null = null;
  private tailTableId = "";
  private tailParsedLen = 0;
  private tailStrStart = -1;
  private tailId: string | null = null;
  private tailStmt: Stmt | null = null;
  /** Text fast path: raw offset in the tail up to which the open string is already in the store. */
  private tailRawDone = -1;
  /**
   * Called before every commit, while subscribers have not been told yet. The runtime declares new
   * `$state` here, so a component rendered by the commit already sees its bound value.
   */
  beforeCommit: (() => void) | null = null;
  /** The URL policy this stream was created with; the runtime applies the same one. */
  readonly urls: UrlPolicy;

  constructor(
    readonly lib: Library,
    opts: StreamOptions = {},
  ) {
    this.store = opts.store ?? new NodeStore();
    this.urls = { allowedHosts: opts.allowedHosts };
    this.program = new Program(lib, this.store, this.urls);
    this.lexer = new Lexer(
      {
        statement: (s) => this.complete(s),
        prose: (text, line) => {
          if (!opts.inline) {
            this.streamErrors.push({
              code: "prose-ignored",
              severity: "warning",
              line,
              message: `Ignored a line that is not a statement: ${text.length > 60 ? text.slice(0, 57) + "…" : text}`,
            });
          }
          opts.onProse?.(text, line);
        },
        unterminatedString: (line) =>
          this.streamErrors.push({
            code: "unterminated-string",
            severity: "error",
            line,
            fixed: true,
            message: "A string was not closed before the end of the line; it was closed there",
          }),
        comment: (text, line) => {
          // `#gistui 2` on the first line: a version this processor does not know is read as version 1, and said so.
          const m = line === 1 ? /^#\s*gistui\s+(\d+)/i.exec(text) : null;
          if (m && m[1] !== "1") this.streamErrors.push({ code: "unsupported-version", severity: "warning", line, message: `The program asks for GistUI format ${m[1]}; this processor reads version 1` });
        },
        lenient: (message, line) => this.streamErrors.push({ code: "lenient-syntax", severity: "warning", line, fixed: true, message }),
        autoClosed: (line) =>
          this.streamErrors.push({
            code: "lenient-syntax",
            severity: "warning",
            line,
            fixed: true,
            message: "A call was left open when the next statement began (or the answer ended); it was closed there",
          }),
      },
      opts.inline ?? false,
    );
  }

  /** Feeds the next chunk. Accepts text or UTF-8 bytes (split multi-byte characters are carried over). */
  push(chunk: string | Uint8Array): void {
    if (this.ended) throw new Error("push() after end()");
    let text: string;
    if (typeof chunk === "string") text = chunk;
    else {
      this.decoder ??= new TextDecoder("utf-8");
      text = this.decoder.decode(chunk, { stream: true });
    }
    if (this.carry) {
      text = this.carry + text;
      this.carry = "";
    }
    // A byte-order mark at the very start is not part of the program.
    if (!this.started && text.length) {
      this.started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      this.carry = text.slice(-1);
      text = text.slice(0, -1);
    }
    this.lexer.push(text);
  }

  /** Brings the open statement up to date and commits all pending patches. */
  flush(): Patch[] {
    if (!this.ended) this.updateTail();
    this.program.capInstances();
    this.beforeCommit?.();
    return this.store.commit();
  }

  /** Ends the stream and returns the final patches. */
  end(): Patch[] {
    if (this.ended) return [];
    if (this.decoder) this.lexer.push(this.decoder.decode());
    if (this.carry) this.lexer.push(this.carry);
    this.carry = "";
    this.lexer.end();
    this.ended = true;
    this.program.finish();
    this.program.capInstances();
    this.beforeCommit?.();
    return this.store.commit();
  }

  /**
   * After `end()`: replaces the program with `source` (a repaired version) in the same store. Nodes
   * that did not change keep their identity, so a renderer updates only what the repair touched;
   * nodes the new program no longer has are removed. Returns the patches.
   */
  rewrite(source: string): Patch[] {
    if (!this.ended) throw new Error("rewrite() before end()");
    const next = new GistUIStream(this.lib, { store: this.store, allowedHosts: this.urls.allowedHosts });
    next.push(source);
    const patches = next.end();
    const keep = next.program.nodeIds();
    for (const id of [...this.store.ids()]) if (!keep.has(id)) this.store.remove(id);
    this.program = next.program;
    this.streamErrors = next.streamErrors;
    // With no component left, nothing is the root (the old root node was just removed).
    if (this.store.root && !this.store.has(this.store.root)) this.store.setRoot(null);
    this.beforeCommit?.();
    return [...patches, ...this.store.commit()];
  }

  errors(): GistUIError[] {
    return [...this.streamErrors, ...this.program.errors()];
  }

  snapshot(): SnapshotNode | null {
    return this.store.snapshot();
  }

  // ─── Statements ───────────────────────────────────────────────────────────

  private complete(raw: RawStatement): void {
    try {
      this.completeStatement(raw);
    } catch (e) {
      // The parser has its own depth limits; this is the last line of defence, so that no input
      // can throw out of `push()` into the host.
      if (!(e instanceof RangeError)) throw e;
      this.resetTail();
      this.streamErrors.push({ code: "limit", severity: "error", line: raw.line, message: `A statement is nested too deeply: ${clip(raw.text)}` });
    }
  }

  private completeStatement(raw: RawStatement): void {
    let stmt: Stmt | null;
    let problems: ParseProblem[] = [];
    let hoistedRows = false;
    if (raw.kind === "table" && this.tailTable && this.tailLine === raw.line) {
      // Reuse the rows already parsed while the table streamed.
      const m = TABLE_HEAD.exec(raw.text);
      this.tailTable.addText(raw.text.slice(m ? m[0].length : 0), false);
      stmt = { kind: "table", id: this.tailTableId, table: this.tailTable.result() };
    } else {
      // Pipe rows written inside a call become their own table statements first.
      const hoisted = hoistTables(raw.text);
      if (hoisted) {
        hoistedRows = true;
        for (const t of hoisted.tables) {
          const tp = parseStatement(t, this.lib, false);
          if (tp.stmt) this.program.apply(tp.stmt, raw.line, true, []);
        }
      }
      const parsed = parseStatement(hoisted ? hoisted.text : raw.text, this.lib, false);
      stmt = parsed.stmt;
      problems = hoistedRows ? [{ pos: 0, message: "pipe rows written inside a call: read as a table of their own", soft: true }, ...parsed.problems] : parsed.problems;
    }
    const tailId = this.tailId;
    this.resetTail();
    const errs = problems.map((p): GistUIError => ({
      code: p.limit ? "limit" : p.soft ? "lenient-syntax" : "parse-failed",
      severity: p.soft ? "warning" : "error",
      line: raw.line + lineOffset(raw.text, p.pos),
      message: p.message,
      ...(stmt ? { fixed: true, stmtId: stmt.id } : {}),
    }));
    if (!stmt) {
      // A dropped statement is reported once, by what made it unreadable: warnings about what was
      // read leniently on the way say nothing about a statement that is not there.
      const hard = errs.find((e) => e.severity === "error") ?? errs[errs.length - 1];
      if (hard) this.streamErrors.push({ ...hard, message: `${hard.message}: ${clip(raw.text)}` });
      if (tailId) this.program.dropPartial(tailId);
      return;
    }
    this.program.apply(stmt, raw.line, true, errs);
  }

  private resetTail(): void {
    this.tailLine = -1;
    this.tailTable = null;
    this.tailTableId = "";
    this.tailParsedLen = 0;
    this.tailStrStart = -1;
    this.tailId = null;
    this.tailStmt = null;
    this.tailRawDone = -1;
  }

  private updateTail(): void {
    try {
      this.updateOpenTail();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      this.lexer.clearDirty();
    }
  }

  private updateOpenTail(): void {
    const lx = this.lexer;
    if (!lx.dirty && !lx.textDirty) return;
    const tail = lx.tail();
    if (!tail) {
      lx.clearDirty();
      return;
    }
    if (tail.line !== this.tailLine) {
      this.resetTail();
      this.tailLine = tail.line;
    }

    if (tail.kind === "table") {
      if (!this.tailTable) {
        const m = TABLE_HEAD.exec(tail.text);
        if (!m) return lx.clearDirty();
        this.tailTable = new TableBuilder();
        this.tailTableId = m[1]!;
        this.tailTable.consumed = 0;
        this.tailId = this.tailTableId;
      }
      const m = TABLE_HEAD.exec(tail.text)!;
      const before = this.tailTable.rowCount;
      const hadHeader = this.tailTable.result().columns.length > 0;
      this.tailTable.addText(tail.text.slice(m[0].length), true);
      const t = this.tailTable.result();
      if (this.tailTable.rowCount !== before || (!hadHeader && t.columns.length)) {
        this.program.apply({ kind: "table", id: this.tailTableId, table: t }, tail.line, false);
      }
      lx.clearDirty();
      return;
    }

    // Text fast path: only the open string grew since the last parse.
    const target = this.program.openText;
    if (!lx.dirty && lx.textDirty && target && this.tailStrStart >= 0 && lx.openStringStart === this.tailStrStart && !lx.pendingEscape) {
      const node = this.store.get(target.nodeId);
      const cur = node?.props[target.prop];
      if (typeof cur === "string") {
        if (this.tailRawDone >= 0) {
          // Only the raw text added since the last flush is decoded, so a long string stays linear.
          const r = readString(tail.text, this.tailRawDone, lx.openQuote);
          if (r.value) this.store.appendText(target.nodeId, target.prop, r.value);
          this.tailRawDone = r.next;
          lx.clearDirty();
          return;
        }
        const r = readString(tail.text, this.tailStrStart + 1, lx.openQuote);
        if (r.value.startsWith(cur)) {
          if (r.value.length > cur.length) this.store.appendText(target.nodeId, target.prop, r.value.slice(cur.length));
          this.tailRawDone = r.next;
          lx.clearDirty();
          return;
        }
      }
    }
    this.tailRawDone = -1;

    const len = tail.text.length;
    if (len > BIG_TAIL && (len - this.tailParsedLen) * 8 < this.tailParsedLen) return;
    if (this.tailParsedLen > 0 && lx.openStringStart < 0 && cannotChange(tail.text, this.tailParsedLen)) {
      this.tailParsedLen = len;
      lx.clearDirty();
      return;
    }
    const parsed = parseStatement(tail.text, this.lib, true);
    this.tailParsedLen = len;
    this.tailStrStart = lx.openStringStart;
    lx.clearDirty();
    const s = parsed.stmt;
    if (!s || (s.kind !== "assign" && s.kind !== "state" && s.kind !== "table")) return;
    // Nothing visible changed (e.g. only a closing quote arrived after its text streamed): skip.
    if (this.tailStmt && sameAst(this.tailStmt, s) && !parsed.openString) {
      this.tailStmt = s;
      return;
    }
    this.tailStmt = s;
    this.tailId = s.kind === "state" ? `$${s.id}` : s.id;
    this.program.apply(s, tail.line, false, [], parsed.openString);
  }
}

export function createStream(lib: Library, opts?: StreamOptions): GistUIStream {
  return new GistUIStream(lib, opts);
}

export interface ParseResult {
  root: SnapshotNode | null;
  store: NodeStore;
  program: Program;
  errors: GistUIError[];
  /** Strict: no error of an OpenUI-compatible kind. Lenient: every error was repaired deterministically. */
  valid: { strict: boolean; lenient: boolean };
}

/** One-shot parse of a complete program. */
export function parse(source: string, lib: Library, opts?: StreamOptions): ParseResult {
  const s = new GistUIStream(lib, opts);
  s.push(source);
  s.end();
  return result(s);
}

export function result(s: GistUIStream): ParseResult {
  const errors = s.errors();
  const hard = errors.filter((e) => e.severity === "error");
  return {
    root: s.snapshot(),
    store: s.store,
    program: s.program,
    errors,
    valid: {
      strict: !hard.some((e) => STRICT_CODES.has(e.code)),
      lenient: s.store.root !== null && !hard.some((e) => !e.fixed),
    },
  };
}

/**
 * True when the text added since the last tail parse cannot change the parse: only whitespace and
 * commas, optionally followed by an identifier that still touches the end (a partial parse drops it).
 * The previous text must not end in an identifier, since a comma would complete it.
 */
function cannotChange(text: string, from: number): boolean {
  let j = from - 1;
  while (j >= 0 && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 10)) j--;
  if (j < 0 || /[\w$@.]/.test(text[j]!)) return false;
  let i = from;
  while (i < text.length && /[\s,]/.test(text[i]!)) i++;
  while (i < text.length && /[\w$@]/.test(text[i]!)) i++;
  return i === text.length;
}

function lineOffset(text: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 80 ? one.slice(0, 77) + "…" : one;
}

/**
 * Pipe rows inside a call (`LineChart(\n  |Week|Volume\n  |W1|30\n, x:"Week")`), a habit of some
 * models, are moved into their own table statements (`<id>_t1 = |Week|Volume…`) referenced from
 * the call. A row is a line that starts with `|`; strings cannot hold raw newlines, so a row is
 * never inside one. A first row may follow the `(` on the call's own line, and the call may go on
 * after the last row on the same line (`|W2|45), x:"Week")`, `|W2|45|, x:"Week"`, `|W2|45,`).
 */
export function hoistTables(text: string): { text: string; tables: string[] } | null {
  // A row starts with one `|`; `||` at the start of a line is the operator, continuing an expression.
  if (!/\n[ \t]*\|(?!\|)/.test(text) && !/\([ \t]*\|(?!\|)/.test(text)) return null;
  const id = /^\s*([A-Za-z_]\w*)\s*=/.exec(text)?.[1];
  if (!id || /^\s*[A-Za-z_]\w*\s*=\s*\|/.test(text)) return null;
  const out: string[] = [];
  const tables: string[] = [];
  let rows: string[] | null = null;
  // Ends the current table: the call gets a reference to it, with a comma when the call goes on.
  const flush = (next: string) => {
    if (!rows) return;
    const name = `${id}_t${tables.length + 1}`;
    tables.push(`${name} = ${rows.join("\n")}`);
    out[out.length - 1] += ` ${name}${next.trim() === "" || /^\s*[,)\]]/.test(next) ? "" : ","}`;
    rows = null;
  };
  const lines = text.split("\n");
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li]!;
    let t = line.trim();
    const isRow = t.startsWith("|") && !t.startsWith("||");
    const m = !isRow ? /\([ \t]*(\|(?!\|).*)$/.exec(line) : null;
    if (m && outsideString(line, m.index)) {
      if (rows) flush(line);
      out.push(line.slice(0, m.index + 1));
      t = m[1]!.trim();
      rows = [];
    } else if (!isRow || !out.length) {
      flush(line);
      out.push(line);
      continue;
    }
    const [row, rest] = splitRow(t);
    (rows ??= []).push(row);
    if (rest) {
      flush(rest);
      out.push(rest);
    }
    void line;
  }
  flush("");
  return tables.length ? { text: out.join("\n"), tables } : null;
}

/** A row line split where the call resumes: an unmatched `)`, or a comma before `key:` or at the end. */
function splitRow(t: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return [t.slice(0, i).trim(), t.slice(i)];
      depth--;
    } else if (c === "," && depth === 0 && (/^,\s*$/.test(t.slice(i)) || /^,\s*[A-Za-z_]\w*\s*[:=]/.test(t.slice(i)) || (t[i - 1] === "|" && /^,\s*\S/.test(t.slice(i))))) {
      return [t.slice(0, i).trim(), t.slice(i)];
    }
  }
  return [t, ""];
}

function outsideString(line: string, end: number): boolean {
  let inStr = false;
  for (let i = 0; i < end; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === '"') inStr = !inStr;
  }
  return !inStr;
}
