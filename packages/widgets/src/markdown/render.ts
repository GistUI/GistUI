/** Blocks and inlines → VNodes, with the URL policy and the streaming (open block) rules. */

import type { MarkdownProps } from "../types";
import type { Align, Block, ListItem } from "./blocks";
import { parseInline, type Inline } from "./inline";
import type { VEl, VNode } from "./vnode";

export type SafeUrl = NonNullable<MarkdownProps["isSafeUrl"]>;

interface Ctx {
  safe: SafeUrl;
}

/** Schemes that are never allowed, whatever `isSafeUrl` says. */
const DANGEROUS = /^(?:javascript|vbscript|data|file):/i;

/** Browsers ignore whitespace and control characters inside a scheme (`java\nscript:`). */
const normalize = (url: string) => url.replace(/[\u0000- \u007f]/g, "");

export function defaultSafeUrl(url: string, kind: "link" | "image"): boolean {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(normalize(url));
  if (!m) return true; // relative, `#anchor` or protocol-relative `//host`
  const scheme = m[1]!.toLowerCase();
  return scheme === "http" || scheme === "https" || (kind === "link" && scheme === "mailto");
}

export function makeSafe(custom?: MarkdownProps["isSafeUrl"]): SafeUrl {
  const check = custom ?? defaultSafeUrl;
  return (url, kind) => !DANGEROUS.test(normalize(url)) && check(url, kind);
}

/**
 * Renders one block. `open` means it is the last block of a stream that is still running: its inline
 * text gets the close-open-marks pass, and a block that has no visible content yet renders as null.
 */
export function renderBlock(b: Block, ctx: Ctx, open: boolean): VNode | null {
  switch (b.k) {
    case "p": {
      if (open && /^[-*_ \t]+$/.test(b.text)) return null;
      const c = inlines(parseInline(open ? withoutPendingTable(b.text) : b.text, open), ctx);
      return open && !c.length ? null : { t: "p", c };
    }
    case "h": {
      const c = inlines(parseInline(b.text, open), ctx);
      return open && !c.length ? null : { t: `h${b.level}`, c };
    }
    case "code": {
      const code: VEl = { t: "code", c: b.text ? [b.text] : [] };
      if (b.lang) code.a = [["class", `language-${b.lang}`], ["data-lang", b.lang]];
      return { t: "pre", c: [code] };
    }
    case "hr":
      return { t: "hr" };
    case "quote": {
      const c = blocks(b.children, ctx, open);
      return open && !c.length ? null : { t: "blockquote", c };
    }
    case "list": {
      const items = listItems(b, ctx, open);
      if (open && !items.length) return null;
      const el: VEl = { t: b.ordered ? "ol" : "ul", c: items };
      if (b.ordered && b.start !== 1) el.a = [["start", String(b.start)]];
      return el;
    }
    case "table": {
      const head: VNode = { t: "thead", c: [{ t: "tr", c: b.head.map((h, i) => tableCell("th", h, b.align[i], false, ctx)) }] };
      const c: VNode[] = [head];
      if (b.rows.length) c.push({ t: "tbody", c: tableRows(b, ctx, open) });
      return { t: "table", c };
    }
  }
}

type ListBlock = Extract<Block, { k: "list" }>;
type TableBlock = Extract<Block, { k: "table" }>;

/** The `<li>`s of a list. With `open`, the last item is still streaming (and absent while it shows nothing). */
export function listItems(b: ListBlock, ctx: Ctx, open: boolean): VNode[] {
  const items: VNode[] = [];
  b.items.forEach((item, i) => {
    const li = listItem(item, ctx, open && i === b.items.length - 1);
    if (li) items.push(li);
  });
  return items;
}

function tableCell(tag: "th" | "td", text: string, align: Align | undefined, open: boolean, ctx: Ctx): VNode {
  const el: VEl = { t: tag, c: inlines(parseInline(text, open), ctx) };
  if (align) el.a = [["style", `text-align:${align}`]];
  return el;
}

/** The body `<tr>`s of a table. With `open`, the last cell of the last row is still streaming. */
export function tableRows(b: TableBlock, ctx: Ctx, open: boolean): VNode[] {
  return b.rows.map((row, r) => ({
    t: "tr",
    c: row.map((text, i) => tableCell("td", text, b.align[i], open && r === b.rows.length - 1 && i === row.length - 1, ctx)),
  }));
}

function blocks(bs: readonly Block[], ctx: Ctx, open: boolean): VNode[] {
  const out: VNode[] = [];
  bs.forEach((b, i) => {
    const v = renderBlock(b, ctx, open && i === bs.length - 1);
    if (v) out.push(v);
  });
  return out;
}

function listItem(item: ListItem, ctx: Ctx, open: boolean): VNode | null {
  // A single paragraph renders inline (tight list); anything else renders as blocks.
  const only = item.children.length === 1 && item.children[0]!.k === "p" ? item.children[0]! : null;
  const c: VNode[] = only && only.k === "p" ? inlines(parseInline(only.text, open), ctx) : blocks(item.children, ctx, open);
  if (item.checked === null) return open && !c.length ? null : { t: "li", c };
  const box: VEl = { t: "input", a: [["type", "checkbox"], ["disabled", ""]] };
  if (item.checked) box.a!.push(["checked", ""]);
  return { t: "li", a: [["class", "task"]], c: [box, " ", ...c] };
}

/**
 * True for a line that may be a table's header row: it starts with a pipe, or has at least two
 * unescaped pipes outside code spans. One pipe in prose ("Run `ls | grep foo`", "a | b") is not.
 */
function tableLike(line: string): boolean {
  let i = 0;
  while (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9) i++;
  if (line[i] === "|") return true;
  let pipes = 0;
  /** Length of the backtick run that opened the code span we are in (0: not in one). */
  let code = 0;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === "`") {
      let j = i;
      while (line[j] === "`") j++;
      if (!code) code = j - i;
      else if (code === j - i) code = 0;
      i = j - 1;
    } else if (code) continue;
    else if (c === "\\") i++;
    else if (c === "|" && ++pipes === 2) return true;
  }
  return false;
}

/** A table's delimiter row as far as it has arrived: only spaces, pipes, colons and dashes. */
const delimiterSoFar = (line: string) => /^[ \t:|-]*$/.test(line);

/**
 * The open paragraph without the lines at its end that may still turn into a table: a header row
 * whose delimiter row has not (fully) arrived. They render as nothing until the next line decides.
 */
function withoutPendingTable(text: string): string {
  if (!text.includes("|")) return text;
  const last = text.lastIndexOf("\n");
  const line = text.slice(last + 1);
  if (last >= 0 && delimiterSoFar(line)) {
    // A header row and the start of its delimiter row.
    const prev = text.lastIndexOf("\n", last - 1);
    if (tableLike(text.slice(prev + 1, last))) return text.slice(0, Math.max(0, prev));
  }
  return tableLike(line) ? text.slice(0, Math.max(0, last)) : text;
}

function inlines(nodes: readonly Inline[], ctx: Ctx): VNode[] {
  const out: VNode[] = [];
  for (const nd of nodes) {
    if (typeof nd === "string") {
      out.push(nd);
      continue;
    }
    switch (nd.t) {
      case "strong":
      case "em":
      case "del":
        out.push({ t: nd.t, c: inlines(nd.c, ctx) });
        break;
      case "code":
        out.push({ t: "code", c: nd.v ? [nd.v] : [] });
        break;
      case "br":
        out.push({ t: "br" });
        break;
      case "a": {
        const c = inlines(nd.c, ctx);
        if (!ctx.safe(nd.href, "link")) {
          for (const v of c) out.push(v); // a rejected link is plain text
          break;
        }
        const a: [string, string][] = [["href", nd.href]];
        if (/^(?:https?:)?\/\//i.test(normalize(nd.href))) a.push(["rel", "noopener noreferrer nofollow"], ["target", "_blank"]);
        out.push({ t: "a", a, c });
        break;
      }
      case "img":
        if (ctx.safe(nd.src, "image")) {
          out.push({ t: "img", a: [["src", nd.src], ["alt", nd.alt], ["loading", "lazy"]] });
        } else if (nd.alt) out.push(nd.alt);
        break;
    }
  }
  // Merge adjacent text so the DOM gets one text node per run.
  const merged: VNode[] = [];
  for (const v of out) {
    const last = merged[merged.length - 1];
    if (typeof v === "string" && typeof last === "string") merged[merged.length - 1] = last + v;
    else merged.push(v);
  }
  return merged;
}
