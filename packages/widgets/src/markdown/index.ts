/**
 * Streaming Markdown widget. Top-level blocks before the open (last) one are complete: they are
 * rendered once in final form and their DOM is never touched again. Only the open region is
 * re-parsed on each update, and it is patched into the DOM, so streaming stays close to linear.
 *
 * A block counts as complete once the block after it has a complete first line: that line alone
 * decides where the earlier block ended, and no later text can change it (see ./blocks). A table
 * needs its second line too: its delimiter row is what makes the lines before it a separate block.
 *
 * The same holds inside the open block when it is a long list or table: an item is complete once
 * the next item's first line is, a row once the next row has started. Completed items and rows are
 * frozen too, so each update parses and patches only the last item or row.
 */

import type { MarkdownProps, Widget } from "../types";
import { parseTop, type Align, type TopBlock } from "./blocks";
import { listItems, makeSafe, renderBlock, tableRows, type SafeUrl } from "./render";
import { patch, patchChildren, toDom, toHtml, type VNode } from "./vnode";

export { defaultSafeUrl } from "./render";

/** An empty text node keeps a block's DOM slot while it has nothing to show yet. */
const EMPTY = "";

/** The open list or table once its first items or rows are frozen: only the rest is live. */
interface Tail {
  k: "list" | "table";
  /** The `<ul>`/`<ol>` or `<tbody>` that holds the frozen children and then the live ones. */
  el: Element;
  /** The live children: their VNodes and the DOM node of the first one. */
  v: VNode[];
  first: Node | null;
  /** Table only: its column count and alignment (the header row is frozen). */
  cols: number;
  align: Align[];
}

class MarkdownView implements Widget<MarkdownProps> {
  private content = "";
  private streaming = false;
  private custom: MarkdownProps["isSafeUrl"];
  private safe: SafeUrl = makeSafe();
  private started = false;
  /** Offset in `content` where the open region (not yet frozen blocks) starts. */
  private frozenEnd = 0;
  /** Rendered blocks of the open region, in order. */
  private open: { v: VNode; dom: Node }[] = [];
  /** Set when the open region starts inside a list or table: `open[0]` is that block. */
  private tail: Tail | null = null;

  constructor(private readonly el: HTMLElement) {
    el.classList.add("gistui-md");
  }

  update(props: MarkdownProps): void {
    const content = props.content ?? "";
    const streaming = props.streaming ?? false;
    if (this.started && content === this.content && streaming === this.streaming && props.isSafeUrl === this.custom) return;
    if (!this.started || !content.startsWith(this.content) || props.isSafeUrl !== this.custom) this.reset(props.isSafeUrl);
    this.started = true;
    this.content = content;
    this.streaming = streaming;

    let base = this.frozenEnd;
    let region = content.slice(base);
    let top = parseTop(region, this.tail?.k === "table" ? this.tail.cols : undefined);
    if (this.tail && top[0]?.block.k !== this.tail.k) {
      // Text that only grows cannot get here; if it does, start over rather than show something wrong.
      this.reset(this.custom);
      base = 0;
      region = content;
      top = parseTop(region);
    }
    /** The block's start is settled: no later text can move it (see the note at the top). */
    const settled = (b: TopBlock) => {
      const nl = region.indexOf("\n", b.start);
      return nl >= 0 && (b.block.k !== "table" || region.includes("\n", nl + 1));
    };
    let done = 0;
    for (let k = 0; k + 1 < top.length && settled(top[k + 1]!); k++) done = k + 1;

    const ctx = { safe: this.safe };
    const doc = this.el.ownerDocument;
    top.forEach((b, i) => {
      const openTail = streaming && i === top.length - 1;
      const tail = i === 0 ? this.tail : null;
      if (tail) {
        // Only the live items or rows: the frozen ones before them are not looked at.
        const next = b.block.k === "list" ? listItems(b.block, ctx, openTail) : b.block.k === "table" ? tableRows({ ...b.block, align: tail.align }, ctx, openTail) : [];
        tail.first = patchChildren(tail.el, tail.v, next, tail.first);
        tail.v = next;
        return;
      }
      const v = renderBlock(b.block, ctx, openTail) ?? EMPTY;
      const slot = this.open[i];
      if (slot) {
        slot.dom = patch(slot.dom, slot.v, v);
        slot.v = v;
      } else {
        const dom = toDom(v, doc);
        this.el.appendChild(dom);
        this.open.push({ v, dom });
      }
    });
    for (const extra of this.open.splice(top.length)) extra.dom.parentNode?.removeChild(extra.dom);

    // Freeze the completed blocks.
    if (done > 0) {
      this.open.splice(0, done);
      this.frozenEnd = base + top[done]!.start;
      this.tail = null;
    }
    // Then, when one block is left open, its completed items or rows.
    const last = top[done];
    if (last?.parts && done === top.length - 1) this.freezeParts(last, base, region);
  }

  /** Freezes the complete items of an open list, or the complete rows of an open table. */
  private freezeParts(b: TopBlock, base: number, region: string): void {
    const parts = b.parts!;
    const block = b.block;
    // A list item is complete once the next item's first line is; a row once the next row started.
    const count = block.k === "list" && !region.includes("\n", parts[parts.length - 1]!) ? parts.length - 2 : parts.length - 1;
    if (count < 1) return;
    let tail = this.tail;
    if (!tail) {
      const slot = this.open[0]!;
      if (typeof slot.v === "string") return;
      if (block.k === "list") tail = { k: "list", el: slot.dom as Element, v: slot.v.c ?? [], first: slot.dom.firstChild, cols: 0, align: [] };
      else if (block.k === "table") {
        const body = slot.v.c?.[1];
        const el = slot.dom.lastChild as Element | null;
        if (!el || !body || typeof body === "string") return;
        tail = { k: "table", el, v: body.c ?? [], first: el.firstChild, cols: block.head.length, align: block.align };
      } else return;
    }
    let first = tail.first;
    for (let k = 0; k < count && first; k++) first = first.nextSibling;
    tail.first = first;
    tail.v = tail.v.slice(count);
    this.tail = tail;
    this.frozenEnd = base + parts[count]!;
  }

  destroy(): void {
    this.el.replaceChildren();
    this.el.classList.remove("gistui-md");
    this.open = [];
    this.tail = null;
  }

  private reset(custom: MarkdownProps["isSafeUrl"]): void {
    this.el.replaceChildren();
    this.frozenEnd = 0;
    this.open = [];
    this.tail = null;
    this.custom = custom;
    this.safe = makeSafe(custom);
  }
}

export function createMarkdown(el: HTMLElement, props: MarkdownProps): Widget<MarkdownProps> {
  const view = new MarkdownView(el);
  view.update(props);
  return view;
}

/** The same output as the widget's final render, as an escaped HTML string (SSR, email). */
export function renderMarkdownToString(content: string, opts: { isSafeUrl?: MarkdownProps["isSafeUrl"] } = {}): string {
  const ctx = { safe: makeSafe(opts.isSafeUrl) };
  let html = "";
  for (const b of parseTop(content)) {
    const v = renderBlock(b.block, ctx, false);
    if (v) html += toHtml(v);
  }
  return html;
}
