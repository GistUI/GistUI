/**
 * A small syntax highlighter for code blocks: comments, strings, numbers, keywords, function names,
 * tags and attributes, for the common languages. Returns tokens; the Code component renders them as
 * spans (no HTML strings, so no injection). About 2 KB, loaded with the Code component.
 */

export type TokenKind = "c" | "s" | "n" | "k" | "f" | "t" | "a" | "p" | "";
export interface Token {
  kind: TokenKind;
  text: string;
}

const KW: Record<string, string> = {
  js: "async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield as interface type enum implements private public protected readonly declare namespace keyof",
  py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self match case",
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false",
  rust: "as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while dyn Some None Ok Err",
  java: "abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true false try void volatile while var",
  c: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected new delete true false nullptr include define",
  sql: "select from where and or not insert into values update set delete create table drop alter add join left right inner outer full on group by order having limit offset as distinct union all case when then else end null is in like between exists count sum avg min max primary key foreign references index view",
  sh: "if then else elif fi for while do done case esac function in return export local echo cd exit set unset source alias",
  css: "important",
};
const ALIAS: Record<string, string> = {
  javascript: "js", jsx: "js", ts: "js", tsx: "js", typescript: "js", mjs: "js", json: "json",
  python: "py", golang: "go", rs: "rust", kotlin: "java", cs: "java", csharp: "java", swift: "java",
  cpp: "c", "c++": "c", h: "c", bash: "sh", shell: "sh", zsh: "sh", console: "sh", postgres: "sql", mysql: "sql",
  html: "html", xml: "html", svg: "html", vue: "html", scss: "css", less: "css", yml: "yaml",
};

export function langOf(lang: string | undefined): string {
  const l = (lang ?? "").toLowerCase().trim();
  return ALIAS[l] ?? l;
}

/** Longer sources are returned as plain text: highlighting is a nicety, never worth a slow frame. */
export const HIGHLIGHT_MAX = 100_000;

/** Comment syntax per language: a line prefix and/or a block's open and close. */
interface Comments {
  line?: string;
  block?: readonly [string, string];
}
const C_COMMENTS: Comments = { line: "//", block: ["/*", "*/"] };
const COMMENTS: Record<string, Comments> = {
  py: { line: "#" },
  sh: { line: "#" },
  yaml: { line: "#" },
  sql: { line: "--", block: ["/*", "*/"] },
  css: { block: ["/*", "*/"] },
  json: {},
};
const STRING = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?/y;
const NUMBER = /\b(?:0x[\da-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b/iy;
const WORD = /[A-Za-z_$][\w$]*/y;

/** Splits code into highlighted tokens. Unknown languages get strings, numbers and comments. */
export function highlight(code: string, lang?: string): Token[] {
  if (code.length > HIGHLIGHT_MAX) return [{ kind: "", text: code }];
  const l = langOf(lang);
  if (l === "html") return highlightMarkup(code);
  const kw = new Set((KW[l] ?? (l === "json" ? "true false null" : "")).split(" ").filter(Boolean));
  const ci = l === "sql";
  const comments = COMMENTS[l] ?? C_COMMENTS;
  const out: Token[] = [];
  let plain = "";
  const push = (kind: TokenKind, text: string) => {
    if (plain) out.push({ kind: "", text: plain }), (plain = "");
    out.push({ kind, text });
  };
  let i = 0;
  const at = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(code);
    return m && m.index === i ? m[0] : null;
  };
  // Once a block comment has no end, no later one has: the search runs to the end only once.
  let openBlock = false;
  const comment = (): string | null => {
    if (comments.line && code.startsWith(comments.line, i)) {
      const nl = code.indexOf("\n", i);
      return code.slice(i, nl < 0 ? code.length : nl);
    }
    if (comments.block && !openBlock && code.startsWith(comments.block[0], i)) {
      const end = code.indexOf(comments.block[1], i + comments.block[0].length);
      if (end >= 0) return code.slice(i, end + comments.block[1].length);
      openBlock = true;
    }
    return null;
  };
  while (i < code.length) {
    const c = comment();
    const t = c ?? at(STRING) ?? at(NUMBER);
    if (t) {
      push(c ? "c" : t === at(STRING) ? "s" : "n", t);
      i += t.length;
      continue;
    }
    const w = at(WORD);
    if (w) {
      const isKw = kw.has(ci ? w.toLowerCase() : w);
      const isFn = !isKw && code[i + w.length] === "(";
      if (isKw || isFn || (l === "css" && code[i + w.length] === ":")) push(isKw ? "k" : isFn ? "f" : "a", w);
      else plain += w;
      i += w.length;
      continue;
    }
    plain += code[i++];
  }
  if (plain) out.push({ kind: "", text: plain });
  return out;
}

const NAME = /[\w:-]+/y;
const SPACE = /\s+/y;
const BARE = /[^\s>]+/y;
const TAG_END = /\s*\/?>/y;

/** One attribute of a tag being parsed, and the positions its value may end at (see `tagAt`). */
interface Attr {
  from: number;
  name: number;
  nameEnd: number;
  /** Where the attribute may end, in the order a regex would try them. */
  ends: number[];
  pick: number;
}

/**
 * Markup: comments and tags (`<a href="x" disabled>`), everything else is text. A tag is parsed by
 * hand, in one pass: position by position, each one decided once (`dead` remembers the positions
 * from which no tag can be completed), so a broken or still-streaming tag with many attributes
 * costs no more than a complete one.
 */
function highlightMarkup(code: string): Token[] {
  const out: Token[] = [];
  const dead = new Set<number>();
  const lastGt = code.lastIndexOf(">");
  const match = (re: RegExp, at: number): number => {
    re.lastIndex = at;
    return re.test(code) ? re.lastIndex : -1;
  };

  /** An attribute starting at `p`: whitespace, a name, and optionally `=` and a value. */
  const attrAt = (p: number): Attr | null => {
    const name = match(SPACE, p);
    const nameEnd = name < 0 ? -1 : match(NAME, name);
    if (nameEnd < 0) return null;
    const ends: number[] = [];
    if (code[nameEnd] === "=") {
      const v = nameEnd + 1;
      const q = code[v];
      // A quoted value first; failing that, the same text as a bare value (`"c"d`).
      const close = q === '"' || q === "'" ? code.indexOf(q, v + 1) : -1;
      if (close >= 0) ends.push(close + 1);
      const bare = match(BARE, v);
      if (bare >= 0 && bare !== close + 1) ends.push(bare);
    }
    if (!ends.length) ends.push(nameEnd);
    return { from: p, name, nameEnd, ends, pick: 0 };
  };

  /** The tag starting at `lt`: pushes its tokens and returns its end, or returns -1. */
  const tagAt = (lt: number): number => {
    const open = code[lt + 1] === "/" ? lt + 2 : lt + 1;
    const nameEnd = match(NAME, open);
    if (nameEnd < 0) return -1;
    const path: Attr[] = [];
    let p = nameEnd;
    let end = -1;
    for (;;) {
      // Forward: as many attributes as possible, then the closing `>`.
      while (!dead.has(p)) {
        const a = attrAt(p);
        if (!a) break;
        path.push(a);
        p = a.ends[0]!;
      }
      end = dead.has(p) ? -1 : match(TAG_END, p);
      // Back: the next way to read the last attribute, or the tag closing before it.
      while (end < 0) {
        dead.add(p);
        const a = path.pop();
        if (!a) return -1;
        if (++a.pick < a.ends.length) {
          path.push(a);
          p = a.ends[a.pick]!;
          break;
        }
        p = a.from;
        end = match(TAG_END, p);
      }
      if (end >= 0) break;
    }
    out.push({ kind: "p", text: code.slice(lt, open) }, { kind: "t", text: code.slice(open, nameEnd) });
    for (const a of path) {
      const e = a.ends[a.pick]!;
      out.push({ kind: "", text: code.slice(a.from, a.name) }, { kind: "a", text: code.slice(a.name, a.nameEnd) });
      if (e > a.nameEnd) out.push({ kind: "p", text: "=" }, { kind: "s", text: code.slice(a.nameEnd + 1, e) });
    }
    out.push({ kind: "p", text: code.slice(p, end) });
    return end;
  };

  let last = 0;
  let openComment = false;
  // A comment and a tag both end with `>`: nothing after the last one can be either.
  for (let lt = code.indexOf("<"); lt >= 0 && lt < lastGt; ) {
    let end = -1;
    if (code.startsWith("<!--", lt)) {
      const close = openComment ? -1 : code.indexOf("-->", lt + 4);
      if (close < 0) openComment = true;
      else end = close + 3;
    }
    const text = last < lt ? code.slice(last, lt) : "";
    const mark = out.length;
    if (end >= 0) out.push({ kind: "c", text: code.slice(lt, end) });
    else end = tagAt(lt);
    if (end >= 0) {
      if (text) out.splice(mark, 0, { kind: "", text });
      last = end;
    }
    lt = code.indexOf("<", end >= 0 ? end : lt + 1);
  }
  if (last < code.length) out.push({ kind: "", text: code.slice(last) });
  return out;
}
