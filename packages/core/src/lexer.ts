/**
 * Incremental statement splitter. `push(chunk)` scans only the new characters and keeps its state
 * between chunks, so total work is O(n). It classifies each depth-0 line from its head:
 *
 *   id = …   $id = …   id.prop = …   id += …   → a statement (code, or a pipe table if the body starts with `|`)
 *   # …                                       → comment
 *   ``` … or ~~~ …                            → fence marker (stripped; in inline mode it opens or closes a block)
 *   anything else                             → prose, ignored with a warning
 */

export interface RawStatement {
  text: string;
  /** 1-based line where the statement starts. */
  line: number;
  kind: "code" | "table";
}

export interface LexerSink {
  statement(s: RawStatement): void;
  /** A line that is not GistUI: leaked prose, or chat text outside fences in inline mode. */
  prose(text: string, line: number): void;
  unterminatedString(line: number): void;
  /** Open brackets were closed for the statement starting on `line` (see `M.NextHead`). */
  autoClosed(line: number): void;
  /** Something written loosely was read as meant (a `//` comment). */
  lenient?(message: string, line: number): void;
  /** A `#` comment line outside a statement (the stream reads the `#gistui 1` version line from it). */
  comment?(text: string, line: number): void;
}

const enum M {
  /** At the start of a line, no statement open. */
  LineStart,
  /** Reading a line head to classify it. */
  Head,
  Code,
  Table,
  /** A table statement saw a newline; the next line's first character decides whether it continues. */
  TableNL,
  /** Skipping the rest of a comment, fence or prose line. */
  SkipLine,
  /**
   * Inside open brackets, after a value and a newline: reading the next line's start to see whether
   * it begins a new statement (`id =` at column 0). A model sometimes forgets the `)` of a call and
   * moves on; then the open call ends here, so one missing bracket cannot swallow the rest.
   */
  NextHead,
}

/** Progress through `id =` in `M.NextHead`. */
const enum N {
  Start,
  Dollar,
  Id,
  Space,
  Eq,
  /** One or two fence characters (a backtick or a tilde) at the start of the line. */
  Fence,
  /** After `id.`: the prop of a patch (`id.prop = …`). */
  Dot,
  Prop,
  /** After `+`: an append (`id += …`). */
  Plus,
}

const enum H {
  Id,
  Dollar,
  Dot,
  Prop,
  Space,
  Plus,
  Eq,
  Body,
}

const enum Skip {
  Comment,
  Prose,
  Fence,
}

const isIdStart = (c: number) => (c >= 97 && c <= 122) || c === 95; // a-z _
const isIdChar = (c: number) =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;
/** Characters `code()` treats specially outside strings; everything else is copied as is. */
const CODE_SPECIAL = new Uint8Array(128);
for (const c of [10, 13, 34, 35, 39, 40, 41, 44, 47, 91, 93, 123, 125]) CODE_SPECIAL[c] = 1;
const isSpace = (c: number) => c === 32 || c === 9 || c === 13;

/** A fence line: three or more backticks or tildes, then its info string. */
const FENCE = /^(`{3,}|~{3,})(.*)$/;
/** The info string of a block that holds a program. */
const FENCE_TAG = /^(gistui|gist)\b/i;

export class Lexer {
  private mode = M.LineStart;
  private h = H.Id;
  private skip = Skip.Comment;
  private skipText = "";
  private skipLine = 1;
  private line = 1;
  private buf = "";
  private stmtLine = 1;
  private kind: "code" | "table" = "code";
  /** Closers for the open brackets, innermost last. Its length is the bracket depth. */
  private closers = "";
  private inStr = false;
  /** The quote that opened the string: `"`, or `'` (accepted where a value can start). */
  private quote = 34;
  private esc = false;
  private inComment = false;
  /** Offset in `buf` of the opening quote of the open string, or -1. */
  private strStart = -1;
  /**
   * Inline mode: the open fence. Fences follow CommonMark: three or more backticks or tildes open
   * one, and a line of the same character, at least as long, closes it. A block tagged `gistui` or
   * `gist`, or with no tag, is program code; any other block (```js) is chat text, with everything
   * in it, a ```gistui example included.
   */
  private fence: { ch: string; len: number; code: boolean } | null = null;
  /** `M.NextHead`: the characters read so far on the candidate line, and blank lines before it. */
  private next = "";
  private nextState = N.Start;
  private nextBlank = 0;
  /** The open statement's last line did not end a value: only a fence line can end it, not `id =`. */
  private nextFenceOnly = false;

  /** Set when a structural character (`,` `)` `]` `}` or a closing quote) reaches the open statement. */
  dirty = false;
  /** Set when only string content reached the open statement since the last `clearDirty()`. */
  textDirty = false;

  constructor(
    private readonly sink: LexerSink,
    private readonly inline = false,
  ) {}

  push(chunk: string): void {
    const n = chunk.length;
    let i = 0;
    while (i < n) {
      // Fast paths: copy runs of ordinary characters in one slice instead of one at a time.
      if (this.mode === M.Code && !this.inComment && !this.esc) {
        let j = i;
        if (this.inStr) {
          while (j < n) {
            const c = chunk.charCodeAt(j);
            if (c === this.quote || c === 92 || c === 10) break;
            j++;
          }
          if (j > i) this.textDirty = true;
        } else {
          while (j < n && !CODE_SPECIAL[chunk.charCodeAt(j)]) j++;
        }
        if (j > i) {
          this.buf += chunk.slice(i, j);
          i = j;
          continue;
        }
      } else if (this.mode === M.Table) {
        let j = i;
        while (j < n) {
          const c = chunk.charCodeAt(j);
          if (c === 10 || c === 13) break;
          j++;
        }
        if (j > i) {
          this.buf += chunk.slice(i, j);
          this.dirty = true;
          i = j;
          continue;
        }
      }
      this.char(chunk.charCodeAt(i), chunk[i]!);
      i++;
    }
  }

  end(): void {
    switch (this.mode) {
      case M.Head:
        if (this.h === H.Body) this.emitCode();
        else this.sink.prose(this.buf, this.stmtLine);
        break;
      case M.NextHead:
        // The stream ended while deciding: the line belongs to the open statement.
        this.resumeCode();
        this.endCode();
        break;
      case M.Code:
        this.endCode();
        break;
      case M.Table:
      case M.TableNL:
        this.emitCode();
        break;
      case M.SkipLine:
        this.endSkipLine();
        break;
    }
    this.mode = M.LineStart;
    this.buf = "";
  }

  /** The open statement, once its head (`id =`) is complete. */
  tail(): RawStatement | null {
    if (this.mode === M.Code || this.mode === M.NextHead || this.mode === M.Table || this.mode === M.TableNL) {
      return { text: this.buf, line: this.stmtLine, kind: this.kind };
    }
    return null;
  }

  /** Offset of the open string's opening quote in `tail().text`, or -1 when no string is open. */
  get openStringStart(): number {
    return this.mode === M.Code && this.inStr ? this.strStart : -1;
  }

  /** The character code of the open string's quote. */
  get openQuote(): number {
    return this.quote;
  }

  /** True when the open string ends in a pending `\` escape. */
  get pendingEscape(): boolean {
    return this.esc;
  }

  clearDirty(): void {
    this.dirty = false;
    this.textDirty = false;
  }

  private char(c: number, ch: string): void {
    switch (this.mode) {
      case M.LineStart:
        return this.lineStart(c, ch);
      case M.Head:
        return this.head(c, ch);
      case M.Code:
        return this.code(c, ch);
      case M.NextHead:
        return this.nextHead(c, ch);
      case M.Table:
        if (c === 10) {
          this.line++;
          this.mode = M.TableNL;
        } else if (c !== 13) {
          this.buf += ch;
          this.dirty = true;
        }
        return;
      case M.TableNL:
        if (isSpace(c)) return;
        if (c === 10) {
          this.line++;
          return;
        }
        if (c === 124) {
          this.buf += "\n|";
          this.mode = M.Table;
          this.dirty = true;
          return;
        }
        this.emitCode();
        this.mode = M.LineStart;
        return this.lineStart(c, ch);
      case M.SkipLine:
        if (c === 10) {
          this.endSkipLine();
          this.line++;
          this.mode = M.LineStart;
        } else this.skipText += ch;
        return;
    }
  }

  private lineStart(c: number, ch: string): void {
    if (isSpace(c)) return;
    if (c === 10) {
      this.line++;
      return;
    }
    if (c === 96 /* ` */ || c === 126 /* ~ */) return this.startSkip(Skip.Fence, ch);
    if (this.inline && !this.fence?.code) return this.startSkip(Skip.Prose, ch);
    if (c === 35 /* # */) return this.startSkip(Skip.Comment, ch);
    this.stmtLine = this.line;
    if (c === 36 /* $ */) {
      this.mode = M.Head;
      this.h = H.Dollar;
      this.buf = ch;
      return;
    }
    // Ids are lowercase by convention, but models also write `SummaryCard = Card(…)`: a capitalized
    // head is still a statement when `=` follows (prose is rejected at its first space).
    if (isIdStart(c) || (c >= 65 && c <= 90)) {
      this.mode = M.Head;
      this.h = H.Id;
      this.buf = ch;
      return;
    }
    // `|` with no open table, or any other character: not a statement.
    this.startSkip(Skip.Prose, ch);
  }

  private head(c: number, ch: string): void {
    if (c === 10 && this.h !== H.Body && this.h !== H.Eq) {
      this.sink.prose(this.buf, this.stmtLine);
      this.line++;
      this.mode = M.LineStart;
      return;
    }
    switch (this.h) {
      case H.Dollar:
        if (isIdStart(c)) {
          this.h = H.Id;
          this.buf += ch;
          return;
        }
        return this.toProse(ch);
      case H.Id:
        if (isIdChar(c)) break;
        if (c === 46 /* . */ && this.buf[0] !== "$") {
          this.h = H.Dot;
          break;
        }
        if (isSpace(c)) {
          this.h = H.Space;
          break;
        }
        if (c === 61) {
          this.h = H.Eq;
          break;
        }
        if (c === 43) {
          this.h = H.Plus;
          break;
        }
        return this.toProse(ch);
      case H.Dot:
        if (isIdStart(c) || (c >= 65 && c <= 90)) {
          this.h = H.Prop;
          break;
        }
        return this.toProse(ch);
      case H.Prop:
        if (isIdChar(c)) break;
        if (isSpace(c)) {
          this.h = H.Space;
          break;
        }
        if (c === 61) {
          this.h = H.Eq;
          break;
        }
        return this.toProse(ch);
      case H.Space:
        if (isSpace(c)) break;
        if (c === 61) {
          this.h = H.Eq;
          break;
        }
        if (c === 43) {
          this.h = H.Plus;
          break;
        }
        return this.toProse(ch);
      case H.Plus:
        if (c === 61) {
          this.h = H.Eq;
          break;
        }
        return this.toProse(ch);
      case H.Eq:
        // `a == b` is an expression line, not an assignment.
        if (c === 61) return this.toProse(ch);
        this.h = H.Body;
        return this.head(c, ch);
      case H.Body:
        if (isSpace(c)) break;
        if (c === 10) {
          // Empty right-hand side so far: the body may start on the next line.
          this.line++;
          this.buf += " ";
          return;
        }
        if (c === 124 /* | */) {
          this.buf += ch;
          this.kind = "table";
          this.mode = M.Table;
          this.dirty = true;
          return;
        }
        this.kind = "code";
        this.mode = M.Code;
        this.closers = "";
        this.inStr = false;
        this.esc = false;
        this.inComment = false;
        return this.code(c, ch);
    }
    this.buf += ch;
  }

  private code(c: number, ch: string): void {
    if (this.inComment) {
      if (c !== 10) return;
      this.inComment = false;
    }
    if (this.inStr) {
      if (this.esc && c !== 10) {
        this.esc = false;
        this.buf += ch;
        this.textDirty = true;
        return;
      }
      if (this.esc) {
        // A backslash at the end of a line escapes nothing: the newline still ends the string.
        this.esc = false;
        this.buf = this.buf.slice(0, -1);
      } else if (c === 92 /* \ */) {
        this.esc = true;
        this.buf += ch;
        return;
      }
      if (c === this.quote) {
        this.inStr = false;
        this.strStart = -1;
        this.buf += ch;
        this.dirty = true;
        return;
      }
      if (c !== 10) {
        this.buf += ch;
        this.textDirty = true;
        return;
      }
      // A raw newline cannot be inside a JSON string: close the string and end the statement here
      // (brackets auto-close), so one broken line cannot swallow the rest of the stream.
      this.inStr = false;
      this.strStart = -1;
      if (this.buf.endsWith("\r")) this.buf = this.buf.slice(0, -1);
      this.buf += String.fromCharCode(this.quote) + [...this.closers].reverse().join("");
      this.closers = "";
      this.sink.unterminatedString(this.line);
    }
    switch (c) {
      case 10:
        this.line++;
        if (!this.closers) {
          this.emitCode();
          this.mode = M.LineStart;
          return;
        }
        // The next line may start a new statement (only after a complete value) or be a fence line
        // (anywhere): either ends this statement.
        this.mode = M.NextHead;
        this.next = "";
        this.nextState = N.Start;
        this.nextBlank = 0;
        this.nextFenceOnly = !this.endsValue();
        return;
      case 34:
      case 39:
        // `'text'`: a string where a value can start (after `(`, `,`, `[`, `{`, `:` or `=`). Anywhere
        // else an apostrophe is ordinary text (`|Q1|Men's` in a table row written inside a call).
        if (c === 39 && !this.opensValue()) break;
        this.inStr = true;
        this.quote = c;
        this.strStart = this.buf.length;
        break;
      case 47:
        // `// comment` to the end of the line (a habit from other languages).
        if (this.buf.endsWith("/")) {
          this.buf = this.buf.slice(0, -1);
          this.inComment = true;
          this.sink.lenient?.("a `//` comment: ignored like a `#` comment", this.line);
          return;
        }
        break;
      case 40:
        this.closers += ")";
        this.dirty = true;
        break;
      case 91:
        this.closers += "]";
        this.dirty = true;
        break;
      case 123:
        this.closers += "}";
        this.dirty = true;
        break;
      case 41:
      case 93:
      case 125:
        this.closers = this.closers.slice(0, -1);
        this.dirty = true;
        break;
      case 44:
        this.dirty = true;
        break;
      case 35:
        this.inComment = true;
        return;
      case 13:
        return;
    }
    this.buf += ch;
  }

  /** True when a value can start here: after `(`, `,`, `[`, `{`, `:`, `=`, or at the start of the body. */
  private opensValue(): boolean {
    let k = this.buf.length - 1;
    while (k >= 0 && (isSpace(this.buf.charCodeAt(k)) || this.buf.charCodeAt(k) === 10)) k--;
    if (k < 0) return true;
    const c = this.buf.charCodeAt(k);
    return c === 40 || c === 44 || c === 91 || c === 123 || c === 58 || c === 61;
  }

  /** True when the open statement's last character ends a value (so a `,` or a closer is due next). */
  private endsValue(): boolean {
    let k = this.buf.length - 1;
    while (k >= 0 && (isSpace(this.buf.charCodeAt(k)) || this.buf.charCodeAt(k) === 10)) k--;
    if (k < 0) return false;
    const c = this.buf.charCodeAt(k);
    return c === 41 || c === 93 || c === 125 || c === 34 || c === 39 || isIdChar(c);
  }

  /**
   * Decides whether the line after a newline inside brackets starts a statement: `id =` or `$id =`
   * at column 0, not `==` or `=>`. Nothing reaches the open statement until the decision, so each
   * character is still looked at once.
   */
  private nextHead(c: number, ch: string): void {
    switch (this.nextState) {
      case N.Start:
        if (c === 10) {
          this.line++;
          this.nextBlank++;
          return;
        }
        if (c === 13) return;
        if (c === 96 || c === 126) this.nextState = N.Fence;
        else if (this.nextFenceOnly) return this.resumeCode(c, ch);
        else if (c === 36) this.nextState = N.Dollar;
        else if (isIdStart(c) || (c >= 65 && c <= 90)) this.nextState = N.Id;
        else return this.resumeCode(c, ch);
        break;
      case N.Fence:
        if (c !== this.next.charCodeAt(0)) return this.resumeCode(c, ch);
        if (this.next.length < 2) break;
        // A fence line: the block ends here, so the open statement is closed where its line ended.
        return this.closeBeforeLine(c, ch);
      case N.Dollar:
        if (!isIdStart(c)) return this.resumeCode(c, ch);
        this.nextState = N.Id;
        break;
      case N.Id:
      case N.Prop:
        if (isIdChar(c)) break;
        if (c === 32 || c === 9) this.nextState = N.Space;
        else if (c === 61) this.nextState = N.Eq;
        else if (c === 43) this.nextState = N.Plus;
        // `id.prop = …`: a patch is a statement head too (one dot, and not on a `$state` name).
        else if (c === 46 && this.nextState === N.Id && this.next.charCodeAt(0) !== 36) this.nextState = N.Dot;
        else return this.resumeCode(c, ch);
        break;
      case N.Dot:
        if (!isIdStart(c)) return this.resumeCode(c, ch);
        this.nextState = N.Prop;
        break;
      case N.Plus:
        if (c !== 61) return this.resumeCode(c, ch);
        this.nextState = N.Eq;
        break;
      case N.Space:
        if (c === 32 || c === 9) break;
        if (c === 43) this.nextState = N.Plus;
        else if (c === 61) this.nextState = N.Eq;
        else return this.resumeCode(c, ch);
        break;
      case N.Eq:
        if (c === 61 || c === 62) return this.resumeCode(c, ch);
        // A new statement: close the open one where its line ended, then read this line as usual.
        return this.closeBeforeLine(c, ch);
    }
    this.next += ch;
  }

  /** Closes the open statement at the end of its last line, then reads the candidate line (and `c`) from its start. */
  private closeBeforeLine(c: number, ch: string): void {
    const line = this.next;
    this.next = "";
    this.buf += [...this.closers].reverse().join("");
    this.sink.autoClosed(this.stmtLine);
    this.emitCode();
    this.mode = M.LineStart;
    for (let i = 0; i < line.length; i++) this.char(line.charCodeAt(i), line[i]!);
    this.char(c, ch);
  }

  /** Not a new statement: the line read so far (and `c`) continues the open one. */
  private resumeCode(c?: number, ch?: string): void {
    const line = this.next;
    this.next = "";
    this.mode = M.Code;
    this.buf += "\n".repeat(1 + this.nextBlank);
    for (let i = 0; i < line.length; i++) this.code(line.charCodeAt(i), line[i]!);
    if (c !== undefined) this.code(c, ch!);
  }

  /** End of the stream inside a statement: an open string and open brackets are closed. */
  private endCode(): void {
    if (this.inStr) {
      if (this.esc) this.buf = this.buf.slice(0, -1);
      this.buf += String.fromCharCode(this.quote);
      this.sink.unterminatedString(this.line);
    }
    if (this.closers) {
      this.buf += [...this.closers].reverse().join("");
      if (!this.inStr) this.sink.autoClosed(this.stmtLine);
    }
    this.emitCode();
  }

  private toProse(ch: string): void {
    this.skip = Skip.Prose;
    this.skipText = this.buf + ch;
    this.skipLine = this.stmtLine;
    this.mode = M.SkipLine;
  }

  private startSkip(kind: Skip, ch: string): void {
    this.skip = kind;
    this.skipText = ch;
    this.skipLine = this.line;
    this.mode = M.SkipLine;
  }

  private endSkipLine(): void {
    const text = this.skipText;
    this.skipText = "";
    if (this.skip === Skip.Fence) {
      if (this.fenceLine(text)) return;
      this.sink.prose(text, this.skipLine);
      return;
    }
    if (this.skip === Skip.Prose) this.sink.prose(text, this.skipLine);
    else if (this.skip === Skip.Comment) this.sink.comment?.(text, this.skipLine);
  }

  /** A line that starts with a backtick or a tilde: true when it is a fence marker (which is dropped). */
  private fenceLine(text: string): boolean {
    const m = FENCE.exec(text);
    if (!m) return false;
    const marks = m[1]!;
    const info = m[2]!.trim();
    if (!this.inline) return true;
    const open = this.fence;
    if (open) {
      // Only a bare line of the same character, at least as long, closes a block.
      if (info !== "" || marks[0] !== open.ch || marks.length < open.len) return false;
      this.fence = null;
      // The closer of a text block is part of that text.
      return open.code;
    }
    // A backtick fence has no backtick in its info string (that is inline code).
    if (marks[0] === "`" && info.includes("`")) return false;
    const code = info === "" || FENCE_TAG.test(info);
    this.fence = { ch: marks[0]!, len: marks.length, code };
    return code;
  }

  private emitCode(): void {
    const text = this.buf;
    this.buf = "";
    this.inStr = false;
    this.strStart = -1;
    this.closers = "";
    this.sink.statement({ text, line: this.stmtLine, kind: this.kind });
    this.kind = "code";
    this.dirty = true;
  }
}
