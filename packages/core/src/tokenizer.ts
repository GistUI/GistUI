/** Tokenizer for one statement's text. */

export const enum T {
  /** Lowercase identifier: ref, prop name, keyword (`true`, `false`, `null`). */
  Id,
  /** PascalCase identifier: component name. */
  Comp,
  /** `$name` */
  State,
  /** `@name` */
  Builtin,
  Str,
  Num,
  /** Digit-led word such as `2xl`; only valid as an enum value. */
  Word,
  Punct,
  EOF,
}

export interface Tok {
  t: T;
  /** Identifier text, punctuation, or decoded string value. */
  v: string;
  n?: number;
  /** String without its closing quote (tail parse only). */
  partial?: boolean;
  pos: number;
}

const PUNCT2 = new Set(["==", "!=", "<=", ">=", "&&", "||", "=>", "+="]);
const PUNCT1 = new Set(["(", ")", "[", "]", "{", "}", ",", ":", "=", ".", "?", "+", "-", "*", "/", "%", "<", ">", "!"]);

const isIdChar = (c: number) =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;
const isDigit = (c: number) => c >= 48 && c <= 57;

export interface TokenizeResult {
  toks: Tok[];
  /** Messages for malformed input (e.g. a stray character). `soft`: accepted as meant, a warning only. */
  problems: { pos: number; message: string; soft?: true }[];
}

/** After these a value can start, so `'` opens a string and `.5` is a number. */
const OPENERS = new Set(["(", ",", "[", "{", ":", "="]);

/**
 * Splits `src` into tokens. In `partial` mode the input is a stream prefix: an identifier, number or
 * operator touching the end is dropped (it may still grow, so `Car` can become `CardHeader`), and an
 * unterminated string becomes a `partial` string token.
 */
export function tokenize(src: string, partial: boolean, start = 0): TokenizeResult {
  const toks: Tok[] = [];
  const problems: TokenizeResult["problems"] = [];
  const len = src.length;
  let i = start;
  while (i < len) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      i++;
      continue;
    }
    const pos = i;
    const last = toks[toks.length - 1];
    const valueStart = !last || (last.t === T.Punct && (OPENERS.has(last.v) || last.v in PREC_START));
    if (c === 34 /* " */ || (c === 39 /* ' */ && valueStart)) {
      const r = readString(src, i + 1, c);
      if (c === 39) problems.push({ pos, message: "single-quoted text: read as a string", soft: true });
      if (r.lenient) problems.push({ pos, message: r.lenient, soft: true });
      if (r.end < 0) {
        if (partial) toks.push({ t: T.Str, v: r.value, partial: true, pos });
        else {
          toks.push({ t: T.Str, v: r.value, pos });
          problems.push({ pos, message: "unterminated string" });
        }
        break;
      }
      toks.push({ t: T.Str, v: r.value, pos });
      i = r.end + 1;
      continue;
    }
    // `.5`: a number written without its leading zero.
    if (c === 46 && valueStart && isDigit(src.charCodeAt(i + 1))) {
      const num = readNumber(src, i + 1);
      if (partial && num.end === len) break;
      problems.push({ pos, message: "a number without its leading zero: read as written", soft: true });
      toks.push({ t: T.Num, v: src.slice(i, num.end), n: Number(`0${src.slice(i, num.end)}`), pos });
      i = num.end;
      continue;
    }
    if (isIdChar(c) || c === 36 || c === 64) {
      const sigil = c === 36 || c === 64;
      let j = sigil ? i + 1 : i;
      while (j < len && isIdChar(src.charCodeAt(j))) j++;
      if (partial && j === len) break; // may still grow
      if (isDigit(src.charCodeAt(sigil ? i + 1 : i)) && !sigil) {
        const num = readNumber(src, i);
        // A number may run past the identifier scan (`1.6`); it is a number when no letter follows it.
        if (!isIdChar(src.charCodeAt(num.end))) {
          if (partial && (num.end === len || (src[num.end] === "." && num.end + 1 === len))) break;
          if (src.charCodeAt(i) === 48 && isDigit(src.charCodeAt(i + 1))) problems.push({ pos, message: "a number with a leading zero: read as a decimal number", soft: true });
          toks.push({ t: T.Num, v: src.slice(i, num.end), n: Number(src.slice(i, num.end)), pos });
          i = num.end;
          continue;
        }
        toks.push({ t: T.Word, v: src.slice(i, j), pos });
        i = j;
        continue;
      }
      if (sigil) {
        const name = src.slice(i + 1, j);
        if (!name) {
          if (partial && j === len) break;
          problems.push({ pos, message: `stray "${src[i]}"` });
          i = j;
          continue;
        }
        toks.push({ t: c === 36 ? T.State : T.Builtin, v: name, pos });
      } else {
        const name = src.slice(i, j);
        toks.push({ t: c >= 65 && c <= 90 ? T.Comp : T.Id, v: name, pos });
      }
      i = j;
      continue;
    }
    const n2 = src.charCodeAt(i + 1);
    if (n2 === 61 /* = */ ? c === 61 || c === 33 || c === 60 || c === 62 || c === 43 : (c === 38 && n2 === 38) || (c === 124 && n2 === 124) || (c === 61 && n2 === 62)) {
      const two = src.slice(i, i + 2);
      if (PUNCT2.has(two)) {
        toks.push({ t: T.Punct, v: two, pos });
        i += 2;
        continue;
      }
    }
    const one = src[i]!;
    // An ellipsis (`[…"a", "b"]`, `...`) is a placeholder some models copy from signatures: skipped.
    if (one === "\u2026" || (one === "." && src.startsWith("...", i))) {
      problems.push({ pos, message: "an ellipsis is a placeholder: ignored", soft: true });
      i += one === "." ? 3 : 1;
      continue;
    }
    if (PUNCT1.has(one) || one === "&" || one === "|") {
      // `=`, `!`, `<`, `>`, `+`, `&`, `|` may be the first half of a two-char operator.
      if (partial && i === len - 1 && "=!<>+&|".includes(one)) break;
      if (one === "&" || one === "|") {
        problems.push({ pos, message: `stray "${one}"` });
        i++;
        continue;
      }
      toks.push({ t: T.Punct, v: one, pos });
      i++;
      continue;
    }
    // A `;` at the end of a statement (a habit from other languages) means nothing.
    if (one === ";") {
      problems.push({ pos, message: "`;` ignored", soft: true });
      i++;
      continue;
    }
    problems.push({ pos, message: `unexpected character "${one}"` });
    i++;
  }
  toks.push({ t: T.EOF, v: "", pos: len });
  return { toks, problems };
}

function readNumber(src: string, i: number): { end: number } {
  let j = i;
  const len = src.length;
  while (j < len && isDigit(src.charCodeAt(j))) j++;
  if (src[j] === "." && isDigit(src.charCodeAt(j + 1))) {
    j++;
    while (j < len && isDigit(src.charCodeAt(j))) j++;
  }
  if ((src[j] === "e" || src[j] === "E") && (isDigit(src.charCodeAt(j + 1)) || ((src[j + 1] === "-" || src[j + 1] === "+") && isDigit(src.charCodeAt(j + 2))))) {
    j += 2;
    while (j < len && isDigit(src.charCodeAt(j))) j++;
  }
  return { end: j };
}

/**
 * Reads a JSON string body starting after the opening quote. Returns the decoded value and the index
 * of the closing quote, or `end: -1` if the string is unterminated (then `value` holds what decoded
 * so far, without a trailing incomplete escape). `next` is the index after the last decoded
 * character: reading again from there (when more text has arrived) continues the same string.
 */
export function readString(src: string, i: number, quote = 34): { value: string; end: number; next: number; lenient?: string } {
  const len = src.length;
  let out = "";
  let segStart = i;
  let lenient: string | undefined;
  while (i < len) {
    const c = src.charCodeAt(i);
    if (c === quote) return { value: out + src.slice(segStart, i), end: i, next: i, ...(lenient ? { lenient } : {}) };
    if (c === 9) lenient ??= "a tab inside a string: kept as it is";
    if (c === 92) {
      out += src.slice(segStart, i);
      const e = src[i + 1];
      if (e === undefined) return { value: out, end: -1, next: i };
      if (e === "u") {
        const hex = src.slice(i + 2, i + 6);
        // Cut off by the end of the text (more may arrive), unless the string's closing quote is in it.
        if (hex.length < 4 && !hex.includes(String.fromCharCode(quote))) return { value: out, end: -1, next: i };
        // Not four hex digits: the `\u` is dropped and what follows is ordinary text (it may
        // include the closing quote, so nothing past the escape is skipped).
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          lenient ??= "`\\u` without four hex digits: read as text";
          i += 2;
        }
      } else {
        if (!Object.hasOwn(ESC, e)) lenient ??= `unknown escape "\\${e}": the backslash is dropped`;
        out += Object.hasOwn(ESC, e) ? ESC[e] : e;
        i += 2;
      }
      segStart = i;
      continue;
    }
    i++;
  }
  return { value: out + src.slice(segStart, len), end: -1, next: len };
}

const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "'": "'", "\\": "\\", "/": "/" };
/** Operators after which a value starts. */
const PREC_START: Record<string, true> = { "+": true, "-": true, "*": true, "/": true, "%": true, "?": true, "!": true, "==": true, "!=": true, "<": true, ">": true, "<=": true, ">=": true, "&&": true, "||": true, "=>": true };
