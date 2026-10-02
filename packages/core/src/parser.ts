/**
 * Recursive-descent / precedence-climbing parser over one statement. Bare words are resolved from the
 * schema and their position only, never from later input, so each argument can be committed as soon
 * as it arrives:
 *   `key:WORD` where the prop is an enum    → enum literal
 *   a positional WORD that is a boolean prop → flag
 *   any other lowercase WORD                → ref (may be defined later)
 */

import type { Arg, BinOp, Expr, Stmt, StrExpr } from "./ast";
import type { CompiledComponent, Library } from "./schema";
import { T, tokenize, type Tok } from "./tokenizer";
import { TableBuilder } from "./table";

export interface ParseProblem {
  pos: number;
  message: string;
  /** Unambiguous sloppy syntax that was accepted as meant (reported as a warning, not an error). */
  soft?: true;
  /** A size limit was reached (nesting depth, chain length): reported as `limit`, not as a syntax error. */
  limit?: true;
}

/** Deepest nesting of calls, lists and parentheses, and longest operator chain, in one statement. */
const MAX_NEST = 100;
const MAX_CHAIN = 500;

export interface ParsedStatement {
  stmt: Stmt | null;
  problems: ParseProblem[];
  /** The string still being streamed at the end of a partial statement. */
  openString?: StrExpr;
}

const HEAD = /^\s*(\$?)([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s*(\+?=)\s*/;

/**
 * Parses a statement's text. `partial` means the text is the open tail of a stream: brackets auto-close
 * and trailing incomplete tokens are dropped, without reporting problems for them.
 */
export function parseStatement(text: string, lib: Library, partial = false): ParsedStatement {
  const m = HEAD.exec(text);
  if (!m) return { stmt: null, problems: [{ pos: 0, message: "expected `id = …`" }] };
  const [head, dollar, id, prop, op] = m as unknown as [string, string, string, string | undefined, string];
  const bodyStart = head.length;

  if (!dollar && !prop && op === "=" && text.charCodeAt(bodyStart) === 124 /* | */) {
    const tb = new TableBuilder();
    tb.addText(text.slice(bodyStart), partial);
    return { stmt: { kind: "table", id, table: tb.result() }, problems: [] };
  }

  const { toks, problems: tokProblems } = tokenize(text, partial, bodyStart);
  const p = new Parser(toks, lib, partial);
  const problems: ParseProblem[] = partial ? [] : tokProblems.slice();
  // Ids are lower case; a capitalised one (`Root = …`) is accepted as written.
  if (!partial && /^[A-Z]/.test(id)) problems.push({ pos: 0, message: `the id "${id}" starts with a capital letter: accepted`, soft: true });
  let value: Expr | null;
  try {
    value = p.parseTop();
  } catch (e) {
    // A stack overflow cannot happen within the limits above; it is caught all the same, so
    // hostile input can never take the host page down.
    if (e instanceof RangeError) return { stmt: null, problems: [...problems, { pos: bodyStart, message: "nested too deeply", limit: true }] };
    if (!(e instanceof SyntaxErr)) throw e;
    return { stmt: null, problems: [...problems, { pos: e.pos, message: e.message, ...(e.limit ? { limit: true as const } : {}) }] };
  }
  if (!partial) problems.push(...p.problems);
  const openString = p.openString;
  if (value === null) {
    if (partial) return { stmt: null, problems };
    return { stmt: null, problems: [...problems, { pos: bodyStart, message: "missing value" }] };
  }

  let stmt: Stmt;
  if (dollar) {
    if (prop || op !== "=") return { stmt: null, problems: [{ pos: 0, message: "state variables only support `$id = value`" }] };
    stmt = { kind: "state", id, value };
  } else if (prop) {
    if (op !== "=") return { stmt: null, problems: [{ pos: 0, message: "use `id.prop = value` to patch a prop" }] };
    stmt = { kind: "patch", id, prop, value };
  } else if (op === "+=") stmt = { kind: "append", id, value };
  else stmt = { kind: "assign", id, value };
  return openString ? { stmt, problems, openString } : { stmt, problems };
}

class SyntaxErr extends Error {
  constructor(
    message: string,
    readonly pos: number,
    readonly limit = false,
  ) {
    super(message);
  }
}

const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

class Parser {
  private i = 0;
  private depth = 0;
  readonly problems: ParseProblem[] = [];
  openString: StrExpr | undefined;

  constructor(
    private readonly toks: Tok[],
    private readonly lib: Library,
    private readonly partial: boolean,
  ) {}

  parseTop(): Expr | null {
    if (this.at(T.EOF)) return null;
    let e = this.expr();
    // `cols = Col(…), Col(…)`: values separated by commas at the top are a list.
    if (e && this.at(T.Punct, ",")) {
      const comma = this.peek().pos;
      const items: Expr[] = [e];
      while (this.eat(",")) {
        if (this.at(T.EOF)) break;
        const next = this.expr();
        if (next) items.push(next);
      }
      if (items.length > 1) {
        e = { k: "arr", items };
        if (!this.partial) this.problems.push({ pos: comma, message: "values separated by commas: read as a list", soft: true });
      }
      // One value and a comma after it (`root = Row(a),`): the comma is a slip, the value stays what it is.
      else if (!this.partial) this.problems.push({ pos: comma, message: "trailing comma after the value: ignored", soft: true });
    }
    if (!this.at(T.EOF)) {
      const t = this.peek();
      // A stray closer after a complete value (e.g. `Card(a))`) is harmless.
      if (t.t === T.Punct && (t.v === ")" || t.v === "]" || t.v === "}")) this.problems.push({ pos: t.pos, message: `an extra "${t.v}" after the value: ignored`, soft: true });
      else this.problems.push({ pos: t.pos, message: `unexpected "${t.v}" after value` });
    }
    return e;
  }

  private peek(o = 0): Tok {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)]!;
  }
  private at(t: T, v?: string): boolean {
    const k = this.peek();
    return k.t === t && (v === undefined || k.v === v);
  }
  private eat(v: string): boolean {
    if (this.at(T.Punct, v)) {
      this.i++;
      return true;
    }
    return false;
  }

  private expr(): Expr | null {
    if (++this.depth > MAX_NEST) throw new SyntaxErr("nested too deeply", this.peek().pos, true);
    try {
      // Lambda: `x => …` or `(a, b) => …`
      if (this.at(T.Id) && this.peek(1).t === T.Punct && this.peek(1).v === "=>") {
        const param = this.peek().v;
        this.i += 2;
        return this.lambdaBody([param]);
      }
      if (this.at(T.Punct, "(")) {
        const params = this.tryLambdaParams();
        if (params) return this.lambdaBody(params);
      }
      return this.cond();
    } finally {
      this.depth--;
    }
  }

  private lambdaBody(params: string[]): Expr | null {
    const body = this.expr();
    if (!body) return this.partialOr(null, "missing lambda body");
    return { k: "lambda", params, body };
  }

  private tryLambdaParams(): string[] | null {
    let j = this.i + 1;
    const params: string[] = [];
    for (;;) {
      const t = this.toks[j];
      if (!t) return null;
      if (t.t === T.Punct && t.v === ")") break;
      if (t.t !== T.Id) return null;
      params.push(t.v);
      j++;
      const s = this.toks[j];
      if (s && s.t === T.Punct && s.v === ",") j++;
    }
    const arrow = this.toks[j + 1];
    if (!arrow || arrow.t !== T.Punct || arrow.v !== "=>") return null;
    this.i = j + 2;
    return params;
  }

  private cond(): Expr | null {
    const c = this.binary(0);
    if (!c || !this.eat("?")) return c;
    const t = this.expr();
    if (!t) return this.partialOr(c, "missing value after `?`");
    if (!this.eat(":")) return this.partialOr(t, "expected `:` in conditional");
    const f = this.expr();
    if (!f) return this.partialOr(t, "missing value after `:`");
    return { k: "cond", c, t, f };
  }

  private binary(minPrec: number): Expr | null {
    let l = this.unary();
    if (!l) return null;
    for (let chain = 0; ; chain++) {
      const t = this.peek();
      if (t.t !== T.Punct) break;
      const prec = PREC[t.v];
      if (prec === undefined || prec <= minPrec) break;
      // Each operator nests the tree one level deeper; a walk over it must not overflow the stack.
      if (chain >= MAX_CHAIN) throw new SyntaxErr("expression too long", t.pos, true);
      this.i++;
      const r = this.binary(prec);
      if (!r) return this.partialOr(l, `missing right side of "${t.v}"`);
      l = { k: "bin", op: t.v as BinOp, l, r };
    }
    return l;
  }

  private unary(): Expr | null {
    if (this.at(T.Punct, "!") || this.at(T.Punct, "-")) {
      const op = this.peek().v as "!" | "-";
      if (++this.depth > MAX_NEST) throw new SyntaxErr("nested too deeply", this.peek().pos, true);
      this.i++;
      try {
        const e = this.unary();
        if (!e) return null;
        if (op === "-" && e.k === "num") return { k: "num", v: -e.v };
        return { k: "un", op, e };
      } finally {
        this.depth--;
      }
    }
    // `+5.2`: a sign some models write on positive numbers.
    if (this.at(T.Punct, "+") && this.peek(1).t === T.Num) {
      this.problems.push({ pos: this.peek().pos, message: "a `+` sign before a number: ignored", soft: true });
      this.i++;
    }
    return this.postfix();
  }

  private postfix(): Expr | null {
    let e = this.primary();
    if (!e) return null;
    for (;;) {
      if (this.at(T.Punct, ".")) {
        const n = this.peek(1);
        if (n.t !== T.Id && n.t !== T.Comp) {
          this.i++;
          if (n.t === T.EOF && this.partial) return e;
          throw new SyntaxErr("expected a name after `.`", n.pos);
        }
        this.i += 2;
        e = { k: "member", o: e, name: n.v };
      } else if (this.at(T.Punct, "[")) {
        this.i++;
        const idx = this.expr();
        if (!idx) return this.partialOr(e, "missing index");
        if (!this.eat("]") && !this.closeAtEof("]")) throw new SyntaxErr("expected `]`", this.peek().pos);
        e = { k: "index", o: e, i: idx };
      } else break;
    }
    return e;
  }

  private primary(): Expr | null {
    const t = this.peek();
    switch (t.t) {
      case T.EOF:
        if (this.partial) return null;
        throw new SyntaxErr("unexpected end of statement", t.pos);
      case T.Str: {
        this.i++;
        const s: StrExpr = t.partial ? { k: "str", v: t.v, partial: true } : { k: "str", v: t.v };
        if (t.partial) this.openString = s;
        return s;
      }
      case T.Num:
        this.i++;
        return { k: "num", v: t.n! };
      case T.State:
        this.i++;
        return { k: "state", name: t.v };
      case T.Id: {
        this.i++;
        if (t.v === "true" || t.v === "false") return { k: "bool", v: t.v === "true" };
        if (t.v === "null") return { k: "null" };
        // `text("…")`: a component name written in lowercase (an id is never followed by `(`).
        const proper = this.at(T.Punct, "(") ? this.lib.closest(t.v) : undefined;
        if (proper && proper.toLowerCase() === t.v.toLowerCase()) {
          this.i++;
          this.problems.push({ pos: t.pos, message: `"${t.v}(" read as the component ${proper}`, soft: true });
          const { args, closed } = this.args(this.lib.get(proper));
          return closed ? { k: "comp", name: proper, args } : { k: "comp", name: proper, args, partial: true };
        }
        return { k: "ref", name: t.v };
      }
      case T.Word:
        this.i++;
        return { k: "enum", v: t.v };
      case T.Comp: {
        this.i++;
        if (!this.eat("(")) {
          if (this.at(T.EOF) && this.partial) return null;
          // A capitalized bare word (`gap:LG`): a word, resolved like any other.
          return { k: "ref", name: t.v };
        }
        const { args, closed } = this.args(this.lib.get(t.v) ?? this.lib.get(this.lib.closest(t.v) ?? ""));
        return closed ? { k: "comp", name: t.v, args } : { k: "comp", name: t.v, args, partial: true };
      }
      case T.Builtin: {
        this.i++;
        if (!this.eat("(")) {
          if (this.at(T.EOF) && this.partial) return null;
          throw new SyntaxErr(`expected "(" after @${t.v}`, t.pos);
        }
        const { args, closed } = this.args(undefined);
        return closed ? { k: "builtin", name: t.v, args } : { k: "builtin", name: t.v, args, partial: true };
      }
      case T.Punct:
        if (t.v === "[") {
          this.i++;
          const items: Expr[] = [];
          while (!this.eat("]")) {
            if (this.closeAtEof("]")) break;
            const e = this.expr();
            if (e) items.push(e);
            if (!this.eat(",") && !this.at(T.Punct, "]") && !this.at(T.EOF)) {
              // A missing comma between two complete values: the next token starts the next item.
              this.problems.push(e ? { pos: this.peek().pos, message: "missing `,` between items", soft: true } : { pos: this.peek().pos, message: "expected `,` or `]`" });
              if (!e) this.i++;
            }
          }
          return { k: "arr", items };
        }
        if (t.v === "{") {
          this.i++;
          const entries: [string, Expr][] = [];
          while (!this.eat("}")) {
            if (this.closeAtEof("}")) break;
            const k = this.peek();
            if (k.t !== T.Id && k.t !== T.Comp && k.t !== T.Str && k.t !== T.State) {
              throw new SyntaxErr("expected a key", k.pos);
            }
            if (k.partial) break;
            this.i++;
            // A bare word is `true`, as a flag is in a call: `{wrap, clip}` = `{wrap:true, clip:true}`.
            if (k.t === T.Id && (this.at(T.Punct, ",") || this.at(T.Punct, "}"))) {
              entries.push([k.v, { k: "bool", v: true }]);
              this.eat(",");
              continue;
            }
            if (this.at(T.Punct, "=")) {
              this.problems.push({ pos: this.peek().pos, message: "`=` after a key in an object: read as `:`", soft: true });
              this.i++;
            } else if (!this.eat(":")) {
              if (this.closeAtEof("}")) break;
              throw new SyntaxErr("expected `:` after key", this.peek().pos);
            }
            const v = this.expr();
            if (!v) {
              if (this.closeAtEof("}")) break;
              throw new SyntaxErr("expected a value", this.peek().pos);
            }
            entries.push([k.v, v]);
            if (!this.eat(",") && !this.at(T.Punct, "}") && !this.at(T.EOF)) {
              // The next key follows without a comma: read as if the comma were there.
              this.problems.push({ pos: this.peek().pos, message: "missing `,` between entries", soft: true });
            }
          }
          return { k: "obj", entries };
        }
        if (t.v === "(") {
          this.i++;
          const e = this.expr();
          if (!e) return this.partialOr(null, "empty parentheses");
          if (!this.eat(")") && !this.closeAtEof(")")) throw new SyntaxErr("expected `)`", this.peek().pos);
          return e;
        }
        throw new SyntaxErr(`unexpected "${t.v}"`, t.pos);
    }
  }

  /** Parses call arguments after `(`. Returns `closed: false` when the input ended first. */
  private args(spec: CompiledComponent | undefined): { args: Arg[]; closed: boolean } {
    const args: Arg[] = [];
    let positional = 0;
    for (;;) {
      if (this.eat(")")) return { args, closed: true };
      if (this.at(T.EOF)) {
        if (!this.partial) this.problems.push({ pos: this.peek().pos, message: "missing `)`" });
        return { args, closed: false };
      }
      const t = this.peek();
      const n = this.peek(1);
      // An empty slot (`Input("q", , "text")`) is an argument left out, like `null`.
      if (t.t === T.Punct && t.v === ",") {
        this.i++;
        this.problems.push({ pos: t.pos, message: "empty argument: read as left out", soft: true });
        args.push({ value: { k: "null" } });
        positional++;
        continue;
      }
      // `key: value`, also written as JSON (`"key": value`): a string is never followed by `:` otherwise.
      const jsonKey = t.t === T.Str && !t.partial && n.t === T.Punct && n.v === ":" && /^[A-Za-z_]\w*$/.test(t.v);
      // A capitalised key (`Gap:lg`) is a key too: a component name is followed by `(`, never by `:`.
      const capKey = t.t === T.Comp && n.t === T.Punct && n.v === ":";
      if (jsonKey) this.problems.push({ pos: t.pos, message: `"${t.v}": written as a JSON key: read as a named argument`, soft: true });
      if (capKey) this.problems.push({ pos: t.pos, message: `"${t.v}:" read as a named argument`, soft: true });
      if (jsonKey || capKey || (t.t === T.Id && n.t === T.Punct && (n.v === ":" || n.v === "="))) {
        this.i += 2;
        const value = this.expr();
        if (!value) {
          if (this.at(T.EOF)) return { args, closed: false };
          throw new SyntaxErr(`missing value for "${t.v}"`, this.peek().pos);
        }
        args.push({ name: t.v, value: this.resolveNamed(spec, t.v, value) });
      } else {
        const value = this.expr();
        if (!value) {
          if (this.at(T.EOF)) return { args, closed: false };
          throw new SyntaxErr(`unexpected "${this.peek().v}"`, this.peek().pos);
        }
        // `large-heavy` lexes as `large - heavy`; when the joined word is one of the component's
        // enum values it is that value (an id cannot contain "-", so this never hides a reference).
        // The same goes for a positional enum slot, open ones included: `Icon(check-circle)`.
        const hy = value.k === "bin" && value.op === "-" ? hyphenWord(value) : undefined;
        const enumProp = hy !== undefined ? spec?.enumWords.get(hy) : undefined;
        const slot = spec?.positional[positional];
        if (enumProp) args.push({ name: enumProp, value: { k: "enum", v: hy! } });
        else if (hy !== undefined && slot !== undefined && spec!.spec.props[slot]?.type === "enum") {
          args.push({ value: { k: "enum", v: hy } });
          positional++;
        } else if (value.k === "ref" && spec?.flags.has(value.name)) args.push({ value: { k: "flag", name: value.name } });
        else {
          args.push({ value });
          positional++;
        }
      }
      if (this.eat(",")) continue;
      if (this.at(T.Punct, ")") || this.at(T.EOF)) continue;
      // Missing comma: keep going, the next token starts a new argument.
      this.problems.push({ pos: this.peek().pos, message: "missing `,` between arguments", soft: true });
    }
  }

  private resolveNamed(spec: CompiledComponent | undefined, key: string, value: Expr): Expr {
    if (!spec) return value;
    const propName = spec.propLookup.get(key.toLowerCase());
    const prop = propName ? spec.spec.props[propName] : undefined;
    if (prop?.type !== "enum") return value;
    // `icon:map-pin` lexes as `map - pin`: for an enum, hyphen-joined words are one value.
    const word = hyphenWord(value);
    return word !== undefined ? { k: "enum", v: word } : value;
  }

  private closeAtEof(closer: string): boolean {
    if (!this.at(T.EOF)) return false;
    if (!this.partial) this.problems.push({ pos: this.peek().pos, message: `missing \`${closer}\`` });
    return true;
  }

  private partialOr<E extends Expr | null>(fallback: E, message: string): E {
    if (this.at(T.EOF) && this.partial) return fallback;
    throw new SyntaxErr(message, this.peek().pos);
  }
}

/** `a`, or `a-b-c` written as bare words (parsed as subtraction), as one enum word. */
export function hyphenWord(e: Expr): string | undefined {
  if (e.k === "ref") return e.name;
  if (e.k === "enum") return e.v;
  if (e.k === "num" && Number.isInteger(e.v) && e.v >= 0) return String(e.v);
  if (e.k === "bin" && e.op === "-") {
    const l = hyphenWord(e.l);
    const r = hyphenWord(e.r);
    return l !== undefined && r !== undefined ? `${l}-${r}` : undefined;
  }
  return undefined;
}
