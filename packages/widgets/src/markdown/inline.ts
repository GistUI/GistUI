/**
 * Inline parser: code spans, links and images, autolinks and bare URLs, `**strong**`, `*em*`,
 * `~~del~~`, backslash escapes, a few entities and soft line breaks. Emphasis follows CommonMark's
 * flanking and delimiter-stack rules. Raw HTML is never parsed: `<` stays text.
 *
 * With `streaming`, the text is the tail of a stream and a close-open-marks pass keeps it from
 * flickering: an unclosed `**bo` renders as strong, `` `co `` as code, `[te` as plain "te", and a
 * trailing lone marker (`*`, `_`, `` ` ``, `[`, `!`, `&am`, `\`) renders as nothing yet.
 *
 * The text comes from a model and is re-parsed on every streamed frame, so every step is linear in
 * its length: no regex runs over an unbounded span, searches that failed once are not repeated, and
 * emphasis keeps CommonMark's `openers_bottom`. Text beyond `INLINE_MAX` is not parsed at all.
 */

/** Longer inline text renders as plain text (with its line breaks). */
export const INLINE_MAX = 50_000;
/** Emphasis and links nested deeper than this render as their text. */
const MAX_NESTING = 32;
/** Parentheses nested deeper than this end a link destination (as in CommonMark). */
const MAX_PARENS = 32;

export type Inline =
  | string
  | { t: "strong" | "em" | "del"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string }
  | { t: "br" };

interface Delim {
  t: "d";
  ch: "*" | "_" | "~";
  len: number;
  orig: number;
  open: boolean;
  close: boolean;
}

interface Bracket {
  t: "b";
  image: boolean;
  active: boolean;
}

type Node = Inline | Delim | Bracket;

const PUNCT = /[!-/:-@[-`{-~]/;
const WS = /\s/;
const ENTITY = /^&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const isDelim = (n: Node | undefined): n is Delim => typeof n === "object" && n.t === "d";
const isBracket = (n: Node | undefined): n is Bracket => typeof n === "object" && n.t === "b";

export function parseInline(s: string, streaming: boolean): Inline[] {
  if (s.length > INLINE_MAX) return plainLines(s);
  return shallow(parse(s, streaming), 0);
}

/** `s.indexOf(ch, from)` that does not rescan: calls come with (mostly) growing `from`. */
function finder(s: string, ch: string): (from: number) => number {
  let start = 0;
  let at = -2;
  return (from) => {
    if (at !== -2 && from >= start && (at === -1 || at >= from)) return at;
    start = from;
    at = s.indexOf(ch, from);
    return at;
  };
}

interface Finders {
  gt(from: number): number;
  nl(from: number): number;
  paren(from: number): number;
  dq(from: number): number;
  sq(from: number): number;
}

function trimEnd(text: string): string {
  let e = text.length;
  while (e > 0 && (text.charCodeAt(e - 1) === 32 || text.charCodeAt(e - 1) === 9)) e--;
  return e === text.length ? text : text.slice(0, e);
}

function parse(s: string, streaming: boolean): Inline[] {
  let nodes: Node[] = [];
  const brackets: number[] = [];
  /** Entries of `brackets` below this index are already inactive (a link was made after them). */
  let deactivated = 0;
  /** Active `[` openers in `brackets`: inside one, a bare URL is not auto-linked. */
  let openLinks = 0;
  const find: Finders = { gt: finder(s, ">"), nl: finder(s, "\n"), paren: finder(s, ")"), dq: finder(s, '"'), sq: finder(s, "'") };
  /** Backtick run lengths known to have no closing run further on. */
  const unclosed = new Set<number>();
  let text = "";
  const flush = () => {
    if (text) {
      nodes.push(text);
      text = "";
    }
  };
  const n = s.length;
  let i = 0;

  while (i < n) {
    const c = s[i]!;
    switch (c) {
      case "\\": {
        const nx = s[i + 1];
        if (nx === undefined) {
          if (!streaming) text += "\\";
          i++;
        } else if (nx === "\n") {
          text = trimEnd(text);
          flush();
          nodes.push({ t: "br" });
          i += 2;
          while (s[i] === " " || s[i] === "\t") i++;
        } else if (PUNCT.test(nx)) {
          text += nx;
          i += 2;
        } else {
          text += "\\";
          i++;
        }
        break;
      }

      case "`": {
        let j = i;
        while (s[j] === "`") j++;
        const run = j - i;
        const close = unclosed.has(run) ? -1 : findBackticks(s, j, run);
        if (close < 0) unclosed.add(run);
        if (close >= 0) {
          flush();
          nodes.push({ t: "code", v: codeText(s.slice(j, close)) });
          i = close + run;
        } else if (streaming) {
          // Unclosed code span at the tail: show the rest as code (nothing yet if it is empty).
          flush();
          const rest = s.slice(j);
          if (rest) nodes.push({ t: "code", v: codeText(rest) });
          i = n;
        } else {
          text += s.slice(i, j);
          i = j;
        }
        break;
      }

      case "*":
      case "_":
      case "~": {
        let j = i;
        while (s[j] === c) j++;
        const len = j - i;
        if (c === "~" && len < 2) {
          if (!(streaming && j === n)) text += c;
          i = j;
          break;
        }
        const before = i === 0 ? " " : s[i - 1]!;
        const after = j >= n ? " " : s[j]!;
        const left = !WS.test(after) && (!PUNCT.test(after) || WS.test(before) || PUNCT.test(before));
        const right = !WS.test(before) && (!PUNCT.test(before) || WS.test(after) || PUNCT.test(after));
        const open = c === "_" ? left && (!right || PUNCT.test(before)) : left;
        const close = c === "_" ? right && (!left || PUNCT.test(after)) : right;
        flush();
        nodes.push({ t: "d", ch: c, len, orig: len, open, close });
        i = j;
        break;
      }

      case "!":
        if (s[i + 1] === "[") {
          flush();
          brackets.push(nodes.length);
          nodes.push({ t: "b", image: true, active: true });
          i += 2;
        } else {
          if (!(streaming && i === n - 1)) text += "!";
          i++;
        }
        break;

      case "[":
        flush();
        brackets.push(nodes.length);
        nodes.push({ t: "b", image: false, active: true });
        openLinks++;
        i++;
        break;

      case "]": {
        const bi = brackets.pop();
        if (bi === undefined) {
          text += "]";
          i++;
          break;
        }
        flush();
        const marker = nodes[bi] as Bracket;
        if (deactivated > brackets.length) deactivated = brackets.length;
        if (marker.active && !marker.image) openLinks--;
        const dest = marker.active && s[i + 1] === "(" ? parseDest(s, i + 2, find) : null;
        if (dest) {
          const inner = nodes.splice(bi + 1);
          nodes.pop();
          const children = finish(inner, false);
          if (marker.image) nodes.push({ t: "img", src: dest.url, alt: plain(children) });
          else {
            nodes.push({ t: "a", href: dest.url, c: children });
            // Links cannot contain links: earlier `[` openers become text.
            for (let k = deactivated; k < brackets.length; k++) {
              const m = nodes[brackets[k]!];
              if (isBracket(m) && !m.image) m.active = false;
            }
            deactivated = brackets.length;
            openLinks = 0;
          }
          i = dest.end;
          break;
        }
        if (streaming && marker.active && (i === n - 1 || (s[i + 1] === "(" && find.paren(i + 2) < 0))) {
          // `[text]` or `[text](partial` at the tail: the text alone, no brackets or partial URL.
          const inner = nodes.splice(bi + 1);
          nodes.pop();
          if (!marker.image) for (const nd of inner) nodes.push(nd);
          i = n;
          break;
        }
        nodes[bi] = marker.image ? "![" : "[";
        text += "]";
        i++;
        break;
      }

      case "<": {
        const m = /^<((?:https?|mailto):[^\s<>]*)>/i.exec(s.slice(i, i + 2048));
        if (m) {
          flush();
          nodes.push({ t: "a", href: m[1]!, c: [m[1]!] });
          i += m[0].length;
        } else if (streaming && find.gt(i) < 0 && /^<[a-z][^\s<>]*$/i.test(s.slice(i, i + 2048))) {
          i = n; // a partial autolink at the tail
        } else {
          text += "<";
          i++;
        }
        break;
      }

      case "&": {
        const m = ENTITY.exec(s.slice(i, i + 12));
        if (m) {
          text += m[1] ? NAMED[m[1]]! : String.fromCodePoint(safeCode(m[2] ? Number(m[2]) : parseInt(m[3]!, 16)));
          i += m[0].length;
        } else if (streaming && n - i <= 9 && /^&[a-zA-Z#0-9]{0,8}$/.test(s.slice(i))) {
          i = n; // a partial entity at the tail
        } else {
          text += "&";
          i++;
        }
        break;
      }

      case "\n":
        text = trimEnd(text);
        flush();
        nodes.push({ t: "br" });
        i++;
        while (s[i] === " " || s[i] === "\t") i++;
        break;

      default:
        if (c === "h" && (i === 0 || /[\s(*_~]/.test(s[i - 1]!)) && /^https?:\/\/[^\s<]/.test(s.slice(i, i + 9)) && openLinks === 0) {
          let j = i;
          let opens = 0;
          let closes = 0;
          for (; j < n && !/[\s<]/.test(s[j]!); j++) {
            if (s[j] === "(") opens++;
            else if (s[j] === ")") closes++;
          }
          // Trailing punctuation is not part of the URL; nor is a `)` that closes nothing inside it.
          for (; j > i; j--) {
            const last = s[j - 1]!;
            if (last === ")" && opens < closes) closes--;
            else if (!TRAILING.includes(last)) break;
          }
          const url = s.slice(i, j);
          flush();
          nodes.push({ t: "a", href: url, c: [url] });
          i += url.length;
        } else {
          text += c;
          i++;
        }
    }
  }
  flush();

  // Unclosed brackets, innermost first.
  if (!streaming) {
    for (const bi of brackets) nodes[bi] = (nodes[bi] as Bracket).image ? "![" : "[";
  } else if (brackets.length) {
    let end = nodes.length;
    const dropped = new Set<number>();
    for (let k = brackets.length - 1; k >= 0; k--) {
      const bi = brackets[k]!;
      if ((nodes[bi] as Bracket).image) end = bi; // a partial image shows nothing until it closes
      else dropped.add(bi); // `[te` is plain "te"
    }
    nodes = nodes.filter((_, k) => k < end && !dropped.has(k));
  }
  return finish(nodes, streaming);
}

const TRAILING = ".,;:!?'\"*_~";

/** Text too long to parse: its lines, with the same soft breaks, and no markup. */
function plainLines(s: string): Inline[] {
  const out: Inline[] = [];
  let from = 0;
  for (;;) {
    const nl = s.indexOf("\n", from);
    const line = s.slice(from, nl < 0 ? s.length : nl);
    const text = from === 0 ? trimEnd(line) : trimEnd(line).replace(/^[ \t]+/, "");
    if (from > 0) out.push({ t: "br" });
    if (text) out.push(text);
    if (nl < 0) return out;
    from = nl + 1;
  }
}

/** Replaces anything nested deeper than `MAX_NESTING` with its text, so no later pass recurses deeply. */
function shallow(nodes: Inline[], depth: number): Inline[] {
  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k]!;
    if (typeof nd === "string" || !("c" in nd)) continue;
    if (depth + 1 >= MAX_NESTING) nodes[k] = plain(nd.c);
    else shallow(nd.c, depth + 1);
  }
  return nodes;
}

/** Resolves emphasis, then (when streaming) auto-closes open markers, and flattens to inlines. */
function finish(input: Node[], streaming: boolean): Inline[] {
  const nodes = processEmphasis(input);
  if (streaming) {
    while (isDelim(nodes[nodes.length - 1])) nodes.pop(); // a trailing marker may still grow
    /** Whether anything after position `k` shows (walking backwards, so each node is looked at once). */
    let content = false;
    for (let k = nodes.length - 1; k >= 0; k--) {
      const o = nodes[k]!;
      if (!isDelim(o) || !o.open || o.len === 0) {
        content ||= hasContent(o);
        continue;
      }
      if (!content) {
        nodes.length = k;
        continue;
      }
      if (o.ch === "~" && o.len < 2) continue;
      const inner = literal(nodes.slice(k + 1));
      const wrapped: Inline =
        o.ch === "~"
          ? { t: "del", c: inner }
          : o.len >= 3
            ? { t: "em", c: [{ t: "strong", c: inner }] }
            : { t: o.len === 2 ? "strong" : "em", c: inner };
      nodes.length = k;
      nodes.push(wrapped);
    }
  }
  return literal(nodes);
}

/** A node in the list `processEmphasis` works on; delimiters are also chained among themselves. */
interface Item {
  node: Node;
  prev: Item | null;
  next: Item | null;
  /** Previous and next delimiter (the delimiter stack). */
  up: Item | null;
  down: Item | null;
  /** Position among the delimiters, in source order. */
  seq: number;
}

/**
 * Pairs closers with openers (CommonMark's delimiter-stack algorithm) and returns the nodes with
 * each pair replaced by its element. Linear: the nodes are a linked list (a pair is wrapped without
 * moving the rest), and `bottom` remembers, per kind of closer, how far down a search has already
 * failed, so no stretch of openers is scanned again and again (`openers_bottom`).
 */
function processEmphasis(nodes: Node[]): Node[] {
  let head: Item | null = null;
  let tail: Item | null = null;
  let firstDelim: Item | null = null;
  let lastDelim: Item | null = null;
  let closers = false;
  let seq = 0;
  for (const node of nodes) {
    const it: Item = { node, prev: tail, next: null, up: null, down: null, seq: -1 };
    if (tail) tail.next = it;
    else head = it;
    tail = it;
    if (isDelim(node)) {
      it.seq = seq++;
      it.up = lastDelim;
      if (lastDelim) lastDelim.down = it;
      else firstDelim = it;
      lastDelim = it;
      if (node.close) closers = true;
    }
  }
  if (!closers) return nodes;

  const unlink = (it: Item) => {
    if (it.prev) it.prev.next = it.next;
    else head = it.next;
    if (it.next) it.next.prev = it.prev;
    if (it.up) it.up.down = it.down;
    else firstDelim = it.down;
    if (it.down) it.down.up = it.up;
  };

  const bottom = new Map<string, number>();
  let cur: Item | null = firstDelim;
  while (cur) {
    const c = cur.node as Delim;
    if (!c.close || c.len === 0 || (c.ch === "~" && c.len < 2)) {
      cur = cur.down;
      continue;
    }
    // What makes an opener eligible depends on the closer only through these.
    const kind = c.ch === "~" ? "~" : `${c.ch}${c.open ? 1 : 0}${c.orig % 3}`;
    const floor = bottom.get(kind) ?? -1;
    let found: Item | null = null;
    for (let it = cur.up; it && it.seq > floor; it = it.up) {
      const o = it.node as Delim;
      if (o.ch !== c.ch || !o.open || o.len === 0) continue;
      if (c.ch === "~") {
        if (o.len < 2) continue;
      } else if ((o.close || c.open) && (o.orig + c.orig) % 3 === 0 && !(o.orig % 3 === 0 && c.orig % 3 === 0)) {
        continue; // CommonMark's "rule of 3"
      }
      found = it;
      break;
    }
    if (!found) {
      bottom.set(kind, cur.up ? cur.up.seq : -1);
      cur = cur.down;
      continue;
    }
    const o = found.node as Delim;
    const use = c.ch === "~" || (o.len >= 2 && c.len >= 2) ? 2 : 1;
    const inner: Node[] = [];
    for (let it = found.next; it && it !== cur; it = it.next) inner.push(it.node);
    const wrapped: Item = { node: { t: c.ch === "~" ? "del" : use === 2 ? "strong" : "em", c: literal(inner) }, prev: found, next: cur, up: null, down: null, seq: -1 };
    found.next = wrapped;
    cur.prev = wrapped;
    // Delimiters between the pair are inside the element now: off the stack.
    found.down = cur;
    cur.up = found;
    o.len -= use;
    c.len -= use;
    if (o.len === 0) unlink(found);
    if (c.len === 0) {
      const after: Item | null = cur.down;
      unlink(cur);
      cur = after;
    } // else: look at the same closer again
  }
  const out: Node[] = [];
  for (let it: Item | null = head; it; it = it.next) out.push(it.node);
  return out;
}

/** Turns leftover markers into text and merges adjacent strings. */
function literal(nodes: readonly Node[]): Inline[] {
  const out: Inline[] = [];
  for (const nd of nodes) {
    const v: Inline | null = isDelim(nd) ? (nd.len ? nd.ch.repeat(nd.len) : null) : isBracket(nd) ? (nd.image ? "![" : "[") : nd;
    if (v === null) continue;
    const last = out[out.length - 1];
    if (typeof v === "string" && typeof last === "string") out[out.length - 1] = last + v;
    else out.push(v);
  }
  return out;
}

function hasContent(nd: Node): boolean {
  return typeof nd === "string" ? nd.trim() !== "" : !isDelim(nd) && !isBracket(nd) && nd.t !== "br";
}

/** Index of the next backtick run of exactly `run` backticks at or after `from`, or -1. */
function findBackticks(s: string, from: number, run: number): number {
  let i = s.indexOf("`", from);
  while (i >= 0) {
    let j = i;
    while (s[j] === "`") j++;
    if (j - i === run) return i;
    i = s.indexOf("`", j);
  }
  return -1;
}

function codeText(v: string): string {
  const t = v.replace(/\n/g, " ");
  return t.length > 2 && t.startsWith(" ") && t.endsWith(" ") && t.trim() !== "" ? t.slice(1, -1) : t;
}

/** Parses `url "title")` after `(`. Returns the URL and the index after `)`, or null. */
function parseDest(s: string, j: number, find: Finders): { url: string; end: number } | null {
  let k = j;
  const n = s.length;
  while (k < n && (s[k] === " " || s[k] === "\t" || s[k] === "\n")) k++;
  let url: string;
  if (s[k] === "<") {
    const e = find.gt(k);
    const nl = e < 0 ? -1 : find.nl(k);
    if (e < 0 || (nl >= 0 && nl < e)) return null;
    url = s.slice(k + 1, e);
    k = e + 1;
  } else {
    const start = k;
    let depth = 0;
    while (k < n) {
      const ch = s[k]!;
      if (ch === "\\" && k + 1 < n) {
        k += 2;
        continue;
      }
      if (WS.test(ch)) break;
      if (ch === "(") {
        if (++depth > MAX_PARENS) return null;
      } else if (ch === ")") {
        if (depth === 0) break;
        depth--;
      }
      k++;
    }
    url = s.slice(start, k);
  }
  while (k < n && (s[k] === " " || s[k] === "\t" || s[k] === "\n")) k++;
  const q = s[k];
  if (q === '"' || q === "'" || q === "(") {
    const e = (q === "(" ? find.paren : q === '"' ? find.dq : find.sq)(k + 1);
    if (e < 0) return null;
    k = e + 1;
    while (k < n && (s[k] === " " || s[k] === "\t" || s[k] === "\n")) k++;
  }
  if (s[k] !== ")") return null;
  return { url: url.replace(/\\([!-/:-@[-`{-~])/g, "$1"), end: k + 1 };
}

/** The text of some inlines (an image's alt, an element nested too deep). Iterative: nesting can be deep. */
function plain(nodes: readonly Inline[]): string {
  let out = "";
  const stack: { list: readonly Inline[]; at: number }[] = [{ list: nodes, at: 0 }];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (top.at >= top.list.length) {
      stack.pop();
      continue;
    }
    const nd = top.list[top.at++]!;
    if (typeof nd === "string") out += nd;
    else if (nd.t === "code") out += nd.v;
    else if (nd.t === "img") out += nd.alt;
    else if (nd.t === "br") out += " ";
    else stack.push({ list: nd.c, at: 0 });
  }
  return out;
}

function safeCode(cp: number): number {
  return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? 0xfffd : cp;
}
