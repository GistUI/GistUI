/** Data components: the same markup, classes and data attributes as `@gistui/react`'s. */

import type { TableData } from "@gistui/core";
import { columnValues, displayCell, filterTable, nextSort, normalizeTable, pageList, tablePageSize, tableView, type TableSort } from "@gistui/headless";
import type { ChartProps, ChartSelection, ChartType, Widget } from "@gistui/widgets";
import { h, num, setAttrs, setStyle, setText, str, syncChildren } from "../dom";
import type { DomContext, DomInstance, DomRenderer } from "../types";
import { trendOf } from "./content";
import { flag } from "./attrs";
import { iconEl } from "./icon";
import { scrollArea } from "./scroll";

type Data = TableData | readonly Record<string, unknown>[] | null | undefined;
const asData = (v: unknown): Data => (Array.isArray(v) || (v && typeof v === "object" && "columns" in v) ? (v as Data) : null);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
const waiting = (expected: string) => h("div", { class: "gistui-skeleton", "data-expected": expected, "aria-busy": "true", "aria-label": "Loading" });

/** A cell with more text than this may wrap; shorter cells stay on one line (a name, a date). */
const WRAP_FROM = 32;

/** Tone for a tag cell: from its meaning when it reads like a status, otherwise stable per value. */
const TAG_TONES = ["info", "accent", "neutral", "success", "warning", "danger"] as const;
const MEANING: [RegExp, string][] = [
  [/^(none|n\/a|no|off|inactive|draft|unknown|-)$/i, "neutral"],
  [/(at risk|risk|critical|fail|error|down|declin|shrink|loss|late|blocked|overdue|tsunami|severe|high)/i, "danger"],
  [/(watch|warn|pending|review|stable|medium|moderate|paused|delay|partial)/i, "warning"],
  [/(healthy|growing|grow|up|active|done|complete|success|ok|on track|live|paid|low|yes|approved)/i, "success"],
];
function toneFor(value: string, all: readonly string[]): string {
  for (const [re, tone] of MEANING) if (re.test(value.trim())) return tone;
  const i = all.indexOf(value);
  return TAG_TONES[(i < 0 ? 0 : i) % TAG_TONES.length]!;
}

let seq = 0;

/** `fn`'s last result while its arguments are the same objects (as React's `useMemo`). */
function memo<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: A | null = null;
  let out!: R;
  return (...args) => {
    if (!last || args.length !== last.length || args.some((a, i) => a !== last![i])) {
      out = fn(...args);
      last = args;
    }
    return out;
  };
}

type Picked = ReadonlyMap<number, ReadonlySet<string>>;

/**
 * The toolbar, the header cells and the pager are created once and patched; only the body rows are
 * rebuilt, and only when the rows shown change. So the search box keeps its focus while you type, and
 * a sort header, a filter chip or a page button is still the focused element after its click.
 */
export const Table: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-table", "data-gistui": "Table" });
  const searchId = `gistui-search-${++seq}`;
  let c = ctx;
  let sort: TableSort | null = null;
  let sortFrom: string | undefined;
  let page = 0;
  let query = "";
  let picked: Picked = new Map();
  const area = scrollArea({ viewClass: "gistui-table__scroll" });
  const search = h("input", { id: searchId, class: "gistui-input", type: "search", placeholder: "Search…" });
  search.addEventListener("input", () => {
    query = search.value;
    page = 0;
    draw();
  });
  const searchLabel = h("label", { class: "gistui-table__search", for: searchId }, iconEl("search"), h("span", { class: "gistui-sr-only" }, "Search"), search);
  const toolbar = h("div", { class: "gistui-table__toolbar" });

  // Sorted, filtered and paged only when the data or that state changed (not on every draw).
  const normalize = memo((data: Data) => normalizeTable(data));
  const valuesOf = memo((_base: TableData) => new Map<number, { value: string; count: number }[]>());
  const filter = memo((base: TableData, q: string, columns: Picked) => filterTable(base, { query: q, columns }));
  const viewOf = memo((filtered: TableData, s: TableSort | null, pg: number, pageSize: number) => tableView(filtered, { sort: s, page: pg, pageSize }));

  // One group of chips per filter column, one chip per value.
  interface Chip {
    b: HTMLButtonElement;
    count: HTMLSpanElement;
  }
  const groups = new Map<number, { area: ReturnType<typeof scrollArea>; label: HTMLSpanElement; chips: Map<string, Chip> }>();
  const toggle = (col: number, value: string) => {
    page = 0;
    const next = new Map(picked);
    const set = new Set(next.get(col) ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    next.set(col, set);
    picked = next;
    draw();
  };

  // Header cells by column; a sortable one holds a button.
  interface Head {
    th: HTMLTableCellElement;
    b: HTMLButtonElement | null;
    name: Text;
    icon: string;
  }
  const heads: Head[] = [];
  const headRow = h("tr");
  const body = h("tbody");
  const table = h("table", null, h("thead", null, headRow), body);
  let bodyKey: unknown[] = [];

  // Pager: previous, next and one button per page number.
  let shown = 0;
  const go = (to: number) => {
    page = to;
    draw();
  };
  const nav = h("nav", { class: "gistui-table__pages", "aria-label": "Pages" });
  const prev = h("button", { type: "button", class: "gistui-page-btn", "aria-label": "Previous page" }, iconEl("chevron-left"));
  const next = h("button", { type: "button", class: "gistui-page-btn", "aria-label": "Next page" }, iconEl("chevron-right"));
  prev.addEventListener("click", () => go(shown - 1));
  next.addEventListener("click", () => go(shown + 1));
  const pageBtns = new Map<number, HTMLButtonElement>();
  const gaps: HTMLSpanElement[] = [];
  const range = h("span");
  const pager = h("div", { class: "gistui-table__pager" }, range, nav);

  const draw = () => {
    const p = c.props;
    const data = asData(p.data);
    const base = normalize(data);
    if (!base.columns.length) {
      el.className = "gistui-table";
      if (c.streaming && !data) syncChildren(el, [waiting("Table")]);
      else {
        el.classList.add("gistui-table__empty");
        syncChildren(el, [document.createTextNode("No data")]);
      }
      return;
    }
    el.classList.remove("gistui-table__empty");
    const findCol = (name: string) => base.columns.findIndex((col) => col.name.toLowerCase() === name.trim().toLowerCase());
    // `order:"-WAU"` sorts first (once, until the user picks a sort).
    const order = str(p.order);
    if (order !== sortFrom) {
      sortFrom = order;
      if (order) {
        const desc = order.startsWith("-");
        const col = findCol(desc ? order.slice(1) : order);
        sort = col >= 0 ? { column: col, dir: desc ? "desc" : "asc" } : null;
      }
    }
    const sortCols = new Set(p.sort === true ? base.columns.map((_, i) => i) : names(p.sortable).map(findCol).filter((i) => i >= 0));
    const filterCols = names(p.filter).map(findCol).filter((i) => i >= 0);
    const tagCols = new Set(names(p.tags).map(findCol).filter((i) => i >= 0));
    const cache = valuesOf(base);
    const values = (col: number) => {
      let v = cache.get(col);
      if (!v) cache.set(col, (v = columnValues(base, col)));
      return v;
    };
    const filtered = filter(base, query, picked);
    const pageSize = tablePageSize(num(p.pageSize), base.rows.length);
    const view = viewOf(filtered, sort, page, pageSize);
    setAttrs(el, { "data-striped": flag(p.striped === true) });

    const parts: Node[] = [];
    const searchable = p.search === true;
    // The attribute follows what was typed (as React's controlled input writes it).
    setAttrs(search, { value: query });
    if (searchable || filterCols.length) {
      const bar: Node[] = searchable ? [searchLabel] : [];
      for (const col of filterCols) {
        let g = groups.get(col);
        if (!g) {
          g = { area: scrollArea({ arrows: "none", wrapClass: "gistui-table__chips-wrap", viewClass: "gistui-table__chips" }), label: h("span", { class: "gistui-table__filter-label" }), chips: new Map() };
          groups.set(col, g);
        }
        const name = base.columns[col]!.name;
        setAttrs(g.area.view, { role: "group", "aria-label": `Filter by ${name}` });
        setText(g.label, name);
        const chips: Node[] = [g.label];
        const live = new Set<string>();
        for (const { value, count } of values(col).slice(0, 8)) {
          live.add(value);
          let chip = g.chips.get(value);
          if (!chip) {
            const n = h("span", { class: "gistui-chip__count" });
            chip = { b: h("button", { type: "button", class: "gistui-chip" }, value, n), count: n };
            chip.b.addEventListener("click", () => toggle(col, value));
            g.chips.set(value, chip);
          }
          setAttrs(chip.b, { "aria-pressed": picked.get(col)?.has(value) ? "true" : "false" });
          setText(chip.count, String(count));
          chips.push(chip.b);
        }
        for (const value of [...g.chips.keys()]) if (!live.has(value)) g.chips.delete(value);
        syncChildren(g.area.view, chips);
        bar.push(g.area.el);
      }
      syncChildren(toolbar, bar);
      parts.push(toolbar);
    }
    for (const [col, g] of [...groups]) {
      if (filterCols.includes(col)) continue;
      g.area.destroy();
      groups.delete(col);
    }

    view.columns.forEach((col, i) => {
      const sortable = sortCols.has(col.index);
      let head = heads[i];
      if (!head) heads[i] = head = { th: h("th"), b: null, name: document.createTextNode(""), icon: "" };
      setAttrs(head.th, { "data-align": col.align, "aria-sort": col.sort === "asc" ? "ascending" : col.sort === "desc" ? "descending" : undefined });
      if (head.name.data !== col.name) head.name.data = col.name;
      if (sortable && !head.b) {
        head.b = h("button", { type: "button", class: "gistui-table__sort" }, head.name);
        head.b.addEventListener("click", () => {
          sort = nextSort(sort, i);
          draw();
        });
        head.icon = "";
      } else if (!sortable) head.b = null;
      if (head.b) {
        setAttrs(head.b, { "data-sort": col.sort ?? undefined });
        const icon = col.sort ? "arrow-up" : "chevrons-up-down";
        if (icon !== head.icon) {
          head.icon = icon;
          syncChildren(head.b, [head.name, iconEl(icon)!]);
        }
      }
      syncChildren(head.th, [head.b ?? head.name]);
    });
    heads.length = view.columns.length;
    syncChildren(headRow, heads.map((x) => x.th));

    // The rows: rebuilt only when the page of rows shown (or how cells are shown) changed.
    const key = [view, [...tagCols].join(",")];
    if (key.some((k, i) => k !== bodyKey[i])) {
      bodyKey = key;
      const rows: Node[] = [];
      for (const r of view.rows) {
        const tr = h("tr");
        for (const col of view.columns) {
          const text = displayCell(r.text[col.index] ?? "", col);
          if (tagCols.has(col.index) && text) tr.append(h("td", { "data-align": col.align }, h("span", { class: "gistui-tag", "data-tone": toneFor(text, values(col.index).map((v) => v.value)) }, text)));
          else tr.append(h("td", { "data-align": col.align, "data-trend": col.index > 0 ? trendOf(text) : undefined, "data-wrap": text.length > WRAP_FROM ? "" : undefined }, text));
        }
        rows.push(tr);
      }
      if (!view.rows.length) rows.push(h("tr", null, h("td", { colspan: view.columns.length, class: "gistui-table__empty" }, "No matching rows")));
      syncChildren(body, rows);
    }
    syncChildren(area.view, [table]);
    parts.push(area.el);

    if (view.pageCount > 1) {
      shown = view.page;
      setAttrs(prev, { disabled: view.page === 0 });
      setAttrs(next, { disabled: view.page >= view.pageCount - 1 });
      const items: Node[] = [prev];
      const live = new Set<number>();
      let gap = 0;
      for (const pg of pageList(view.page, view.pageCount)) {
        if (pg === null) items.push((gaps[gap++] ??= h("span", { class: "gistui-page-btn", "aria-hidden": "true" }, "…")));
        else {
          live.add(pg);
          let b = pageBtns.get(pg);
          if (!b) {
            pageBtns.set(pg, (b = h("button", { type: "button", class: "gistui-page-btn" }, String(pg + 1))));
            b.addEventListener("click", () => go(pg));
          }
          setAttrs(b, { "aria-current": pg === view.page ? "page" : undefined });
          items.push(b);
        }
      }
      for (const pg of [...pageBtns.keys()]) if (!live.has(pg)) pageBtns.delete(pg);
      items.push(next);
      syncChildren(nav, items);
      const filteredNote = filtered.rows.length !== base.rows.length ? ` (filtered from ${base.rows.length})` : "";
      setText(range, `${view.page * pageSize + 1}–${Math.min(view.total, (view.page + 1) * pageSize)} of ${view.total}${filteredNote}`);
      parts.push(pager);
    }
    syncChildren(el, parts);
  };
  draw();
  return {
    el,
    update(next) {
      c = next;
      draw();
      return true;
    },
    destroy() {
      area.destroy();
      for (const g of groups.values()) g.area.destroy();
    },
  };
};

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** A small smooth sparkline with a fading wash. */
function sparkline(values: number[], invert: boolean): SVGElement | null {
  if (values.length < 2) return null;
  const w = 120;
  const ht = 34;
  // Loops, not `Math.min(...values)`: a program's array can be longer than an argument list may be.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 3 + (1 - (v - lo) / span) * (ht - 6)] as const);
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += `C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  // Green when the line moves the good way (down is good for inverted metrics such as churn).
  const up = values.at(-1)! >= values[0]! !== invert;
  const gid = `spark${++seq}`;
  const root = svg("svg", { class: "gistui-stat__spark", viewBox: `0 0 ${w} ${ht}`, preserveAspectRatio: "none", "aria-hidden": "true", style: `color:${up ? "var(--gistui-success)" : "var(--gistui-danger)"}` });
  const grad = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": 0.22 }), svg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": 0 }));
  const defs = svg("defs", {});
  defs.append(grad);
  root.append(defs, svg("path", { d: `${d}L${w},${ht}L0,${ht}Z`, fill: `url(#${gid})` }), svg("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.75, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
  return root;
}

const NUMBER = /^([^\d-]*?)(-?[\d,]*\.?\d+)(.*)$/s;

/** Animations only where people see them: not with reduced motion, in automation or test DOMs. */
function motionOk(): boolean {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return false;
  if ((navigator as { webdriver?: boolean }).webdriver) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A formatted number that counts up when it first scrolls into view, and from its old to its new
 * value when live data changes. The label is always the real value for screen readers and copy.
 */
function countUp(): { el: HTMLSpanElement; set(text: string | undefined): void; destroy(): void } {
  const el = h("span");
  let shown: number | null = null;
  let current: string | undefined;
  let raf = 0;
  let io: IntersectionObserver | null = null;
  const stop = () => {
    cancelAnimationFrame(raf);
    io?.disconnect();
    io = null;
  };
  return {
    el,
    set(text) {
      if (text === current) return;
      current = text;
      setAttrs(el, { "aria-label": text });
      stop();
      const m = text ? NUMBER.exec(text) : null;
      if (!m || !motionOk()) {
        setText(el, text ?? "");
        return;
      }
      const [, pre, digits, post] = m as unknown as [string, string, string, string];
      const target = Number(digits.replace(/,/g, ""));
      if (!Number.isFinite(target)) {
        setText(el, text ?? "");
        return;
      }
      const decimals = (digits.split(".")[1] ?? "").length;
      const grouped = digits.includes(",");
      const fmt = (n: number) => `${pre}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })}${post}`;
      const from = shown ?? 0;
      if (from === target) {
        setText(el, text!);
        return;
      }
      const run = () => {
        const start = performance.now();
        const dur = shown === null ? 900 : 500;
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          setText(el, fmt(from + (target - from) * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(step);
          else {
            setText(el, text!);
            shown = target;
          }
        };
        raf = requestAnimationFrame(step);
      };
      if (shown !== null) return run();
      setText(el, fmt(0));
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect();
          run();
        }
      });
      io.observe(el);
    },
    destroy: stop,
  };
}

interface StatData {
  label?: string | undefined;
  value?: string | undefined;
  delta?: string | undefined;
  note?: string | undefined;
  icon?: string | undefined;
  spark?: number[] | undefined;
  invert?: boolean;
}

function statCard(): { el: HTMLDivElement; set(d: StatData): void; destroy(): void } {
  const el = h("div", { class: "gistui-stat", "data-gistui": "Stat" });
  const label = h("span", { class: "gistui-stat__label" });
  const value = h("span", { class: "gistui-stat__value" });
  const counter = countUp();
  value.append(counter.el);
  const foot = h("span", { class: "gistui-stat__foot" });
  let key = "";
  return {
    el,
    set(d) {
      counter.set(d.value);
      const k = JSON.stringify([d.label, d.delta, d.note, d.icon, d.spark, d.invert]);
      if (k === key && el.firstChild) return;
      key = k;
      syncChildren(label, [...(d.icon ? [iconEl(d.icon)].filter((x): x is Element => x !== null) : []), document.createTextNode(d.label ?? "")]);
      const t = trendOf(d.delta);
      // Colour says good or bad; the arrow says up or down.
      const tone = t && (t === "up") !== (d.invert ?? false) ? "up" : t ? "down" : undefined;
      const footParts: Node[] = [];
      if (d.delta) footParts.push(h("span", { class: "gistui-stat__delta", "data-trend": tone }, t ? iconEl(t === "up" ? "trending-up" : "trending-down") : null, d.delta));
      if (d.note) footParts.push(h("span", null, d.note));
      syncChildren(foot, footParts);
      const spark = d.spark ? sparkline(d.spark, d.invert ?? false) : null;
      syncChildren(el, [label, value, ...(footParts.length ? [foot] : []), ...(spark ? [spark] : [])]);
    },
    destroy: () => counter.destroy(),
  };
}

const numbers = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(Number).filter((n) => Number.isFinite(n));
  return out.length > 1 ? out : undefined;
};

export const Stat: DomRenderer = (ctx) => {
  const card = statCard();
  const apply = (c: DomContext) => {
    const p = c.props;
    c.design(card.el);
    card.set({ label: str(p.label), value: str(p.value), delta: str(p.delta), note: str(p.note), icon: str(p.icon), spark: numbers(p.spark), invert: p.invert === true });
  };
  apply(ctx);
  return {
    el: card.el,
    update(c) {
      apply(c);
      return true;
    },
    destroy: () => card.destroy(),
  };
};

/** One Stat per row of a |Label|Value|Delta|Note table (columns by position; raw cell text is shown). */
export const Stats: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-stats", "data-gistui": "Stats" });
  const cards: ReturnType<typeof statCard>[] = [];
  const apply = (c: DomContext) => {
    const data = asData(c.props.data);
    if (c.streaming && !data) {
      syncChildren(el, [waiting("Stats")]);
      return;
    }
    const rows = normalizeTable(data).text;
    while (cards.length < rows.length) cards.push(statCard());
    while (cards.length > rows.length) cards.pop()!.destroy();
    rows.forEach((row, i) => cards[i]!.set({ label: row[0], value: row[1], delta: row[2] || undefined, note: row[3] || undefined }));
    syncChildren(el, cards.map((x) => x.el));
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
    destroy: () => cards.forEach((x) => x.destroy()),
  };
};

export const Progress: DomRenderer = (ctx) => {
  const label = h("span");
  const note = h("span");
  const bar = h("div", { class: "gistui-progress__bar" });
  const track = h("div", { class: "gistui-progress__track", role: "progressbar", "aria-valuemin": 0 }, bar);
  const el = h("div", { class: "gistui-progress", "data-gistui": "Progress" }, h("div", { class: "gistui-progress__head" }, label, note), track);
  const apply = (c: DomContext) => {
    const p = c.props;
    const max = num(p.max) ?? 100;
    const value = num(p.value) ?? 0;
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
    setAttrs(el, { "data-tone": str(p.tone) });
    setText(label, str(p.label) ?? "");
    setText(note, str(p.note) ?? `${Math.round(pct)}%`);
    setAttrs(track, { "aria-valuemax": max, "aria-valuenow": value, "aria-label": str(p.label) });
    setStyle(bar, { width: `${pct}%` });
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
  };
};

/** The chart engine is its own chunk (heavy components load lazily). */
type ChartFactory = (el: HTMLElement, props: ChartProps) => Widget<ChartProps>;
let chartFactory: ChartFactory | null = null;
let chartLoading: Promise<ChartFactory> | null = null;
/** Starts loading the chart chunk early, e.g. when a stream first mentions `Chart(`. */
export const preloadChart = (): Promise<ChartFactory> => (chartLoading ??= import("@gistui/widgets/chart").then((m) => (chartFactory = m.createChart)));

export const Chart: DomRenderer = (ctx) => {
  const el = h("div", { "data-gistui": "Chart", class: "gistui-stack", "data-gap": "sm" });
  const header = h("header", { class: "gistui-header", "data-size": "sm" });
  const title = h("h3", { class: "gistui-header__title" });
  const subtitle = h("p", { class: "gistui-header__subtitle" });
  const skeleton = h("div", { class: "gistui-skeleton", "data-expected": "Chart" });
  const host = h("div");
  let c = ctx;
  let widget: Widget<ChartProps> | null = null;
  let selected: ChartSelection | null = null;
  let failed = false;
  let fallback: DomInstance | null = null;
  let dead = false;

  const chartProps = (): ChartProps => {
    const p = c.props;
    return {
      data: asData(p.data),
      type: (str(p.type) as ChartType | undefined) ?? "bar",
      stacked: p.stacked === true,
      zoom: p.zoom === true,
      select: p.select === "range" ? "range" : "point",
      selected,
      onSelect: (sel) => {
        selected = sel;
        // `bind:$pick` holds the selected category (x), e.g. for a drill-down table below the chart.
        const b = c.binding();
        if (b.bound) b.set(sel && "x" in sel ? sel.x : null);
        c.emit({ type: "select", nodeId: c.node.id, value: sel });
        draw();
      },
      interactive: !c.locked,
      partial: c.node.partial,
      ...(str(p.x) ? { x: str(p.x) } : {}),
      ...(str(p.y) ? { y: str(p.y) } : {}),
      // What a screen reader calls the chart: its title, else its axis label.
      ...((str(p.title) ?? str(p.y)) ? { label: str(p.title) ?? str(p.y) } : {}),
      // A program-chosen height stays in a sane range.
      ...(num(p.height) ? { height: Math.max(80, Math.min(1200, Math.round(num(p.height)!))) } : {}),
      ...(p.legend !== undefined ? { legend: p.legend === true } : {}),
    };
  };
  const draw = () => {
    // If the chart chunk cannot be loaded, the data is still shown, as a table.
    if (failed) {
      fallback ??= Table({ ...c, props: { data: c.props.data } });
      syncChildren(el, [fallback.el]);
      return;
    }
    const props = chartProps();
    const t = str(c.props.title);
    const s = str(c.props.subtitle);
    setText(title, t ?? "");
    setText(subtitle, s ?? "");
    syncChildren(header, [...(t ? [title] : []), ...(s ? [subtitle] : [])]);
    if (chartFactory && !widget) widget = chartFactory(host, props);
    else widget?.update(props);
    const wait = !widget || (c.streaming && !props.data);
    setStyle(skeleton, props.height ? { height: props.height } : undefined);
    setAttrs(host, { hidden: wait });
    syncChildren(el, [...(t || s ? [header] : []), ...(wait ? [skeleton] : []), host]);
  };
  if (!chartFactory) {
    // The chunk can arrive after this chart is gone: no widget is created for it then.
    preloadChart().then(
      () => {
        if (!dead) draw();
      },
      () => {
        failed = true;
        if (!dead) draw();
      },
    );
  }
  draw();
  return {
    el,
    update(next) {
      c = next;
      draw();
      return true;
    },
    destroy() {
      dead = true;
      widget?.destroy();
      fallback?.destroy?.();
    },
  };
};
