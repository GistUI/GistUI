import { beforeEach, describe, expect, test } from "bun:test";
import type { TableData } from "@gistui/core";
import { createChart } from "../src/chart";
import type { ChartSelection } from "../src/types";

// Time limits are for a developer machine; shared CI runners are several times slower (GISTUI_PERF_SLACK is set there).
const SLOW = Math.max(1, Number(process.env.GISTUI_PERF_SLACK ?? 3) / 3);

const table = (rows: (string | number | null)[][], cols = ["Month", "MAU", "WAU"]): TableData => ({
  columns: cols.map((name, i) => ({ name, type: i === 0 ? "string" : "number" })),
  rows,
  text: rows.map((r) => r.map((c) => (c === null ? "" : String(c)))),
});

/** `rows` × `k` series. */
const grid = (rows: number, k: number, f: (r: number, s: number) => number | null): TableData =>
  table(
    Array.from({ length: rows }, (_, r) => [`c${r}`, ...Array.from({ length: k }, (_, s) => f(r, s))]),
    ["x", ...Array.from({ length: k }, (_, s) => `s${s}`)],
  );

let host: HTMLElement;
function mount(width?: number): void {
  document.body.replaceChildren();
  host = document.createElement("div");
  if (width) Object.defineProperty(host, "clientWidth", { value: width });
  document.body.appendChild(host);
}
beforeEach(() => mount());

const q = (sel: string) => Array.from(host.querySelectorAll(sel));
const one = (sel: string) => host.querySelector(sel) as HTMLElement;
const num = (el: Element, a: string) => Number(el.getAttribute(a));
const ticks = (axis: "x" | "y") => q(`.gistui-chart__axis--${axis} .gistui-chart__tick`).map((t) => t.textContent ?? "");

function pointer(el: EventTarget, type: string, x: number, y = 50) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
}
function click(el: Element, x = 0, y = 0) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
}

/** Left edge and width (or top and height with `vertical`) of a bar, from its path. */
function barSpan(el: Element, vertical = false): [number, number] {
  const nums = (el.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const d = el.getAttribute("d")!;
  const plain = /^M[-\d.]+,[-\d.]+h/.test(d); // M x,y h w v h h -w Z
  if (plain) return vertical ? [nums[1]!, nums[3]!] : [nums[0]!, nums[2]!];
  const coords = d.replace(/[A-Za-z]/g, " ").trim().split(/[\s,]+/).map(Number);
  const xs: number[] = [];
  const ys: number[] = [];
  // Rounded bars are written with absolute commands only: collect the x and y of every pair.
  for (const m of d.matchAll(/([-\d.]+),([-\d.]+)/g)) {
    xs.push(Number(m[1]));
    ys.push(Number(m[2]));
  }
  for (const m of d.matchAll(/H([-\d.]+)/g)) xs.push(Number(m[1]));
  for (const m of d.matchAll(/V([-\d.]+)/g)) ys.push(Number(m[1]));
  void coords;
  const v = vertical ? ys : xs;
  // Direction matters: the first x is the left edge for a well-formed bar.
  return [v[0]!, Math.max(...v) - Math.min(...v)];
}

describe("isolated points are visible (W11)", () => {
  test("a line or area with one row marks its point", () => {
    for (const type of ["line", "area"] as const) {
      mount();
      createChart(host, { data: table([["Jan", 5]], ["k", "v"]), type });
      expect(q(".gistui-chart__point").length).toBe(1);
      expect(q(".gistui-chart__point[data-solo]").length).toBe(1);
    }
  });

  test("points isolated by gaps are marked; points on a drawn segment are not", () => {
    createChart(host, { data: table([["a", 1], ["b", null], ["c", 5], ["d", null], ["e", 2]], ["k", "v"]), type: "line" });
    expect(q(".gistui-chart__point[data-solo]").map((p) => p.getAttribute("data-key"))).toEqual(["0:0", "0:2", "0:4"]);
    mount();
    createChart(host, { data: table([["a", 1], ["b", 2], ["c", null], ["d", 4]], ["k", "v"]), type: "line" });
    expect(q(".gistui-chart__point[data-solo]").map((p) => p.getAttribute("data-key"))).toEqual(["0:3"]);
    mount();
    createChart(host, { data: table([["a", 1], ["b", 2], ["c", 3]], ["k", "v"]), type: "area" });
    expect(q(".gistui-chart__point[data-solo]").length).toBe(0);
  });
});

describe("grouped bars always have a positive width (W12)", () => {
  test("12 rows × 6 series at 320px: every bar is at least 1px wide and bars do not overlap", () => {
    mount(320);
    createChart(host, { data: grid(12, 6, (r, s) => r + s + 1), type: "bar" });
    const bars = q(".gistui-chart__bar");
    expect(bars.length).toBe(72);
    for (const b of bars) expect(b.getAttribute("d")).not.toMatch(/h-|NaN/);
    const firstRow = [0, 1, 2, 3, 4, 5].map((s) => barSpan(one(`[data-key="${s}:0"]`)));
    for (const [, w] of firstRow) expect(w).toBeGreaterThanOrEqual(1);
    for (let s = 1; s < 6; s++) expect(firstRow[s]![0]).toBeGreaterThanOrEqual(firstRow[s - 1]![0] + firstRow[s - 1]![1] - 0.011);
  });

  test("horizontal bars too", () => {
    mount(320);
    createChart(host, { data: grid(12, 6, (r, s) => r + s + 1), type: "hbar", height: 200 });
    const firstRow = [0, 1, 2, 3, 4, 5].map((s) => barSpan(one(`[data-key="${s}:0"]`), true));
    for (const [, h] of firstRow) expect(h).toBeGreaterThanOrEqual(1);
    for (let s = 1; s < 6; s++) expect(firstRow[s]![0]).toBeGreaterThanOrEqual(firstRow[s - 1]![0] + firstRow[s - 1]![1] - 0.011);
  });
});

describe("a range selection does not dim every mark (W13)", () => {
  test("only a point selection sets data-has-selection", () => {
    const data = table([["a", 1, 1], ["b", 2, 2], ["c", 3, 3]]);
    const c = createChart(host, { data, type: "line", select: "range", selected: { kind: "range", from: "a", to: "b" } });
    expect(q(".gistui-chart__range").length).toBe(1);
    expect(one(".gistui-chart").hasAttribute("data-has-selection")).toBe(false);
    c.update({ data, type: "line", selected: { kind: "point", x: "b", series: "MAU", value: 2, row: 1 } });
    expect(one(".gistui-chart").hasAttribute("data-has-selection")).toBe(true);
    expect(q("[data-selected]").length).toBe(1);
    c.update({ data, type: "line", selected: null });
    expect(one(".gistui-chart").hasAttribute("data-has-selection")).toBe(false);
  });
});

describe("pointer handling (W14)", () => {
  const data = table([["a", 1, 1], ["b", 2, 2], ["c", 3, 3], ["d", 4, 4]]);
  const xs = () => q('.gistui-chart__point[data-series="MAU"]').map((p) => num(p, "cx"));

  test("a drag released outside the chart ends there; coming back does not resize the brush", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data, type: "line", select: "range", onSelect: (s) => got.push(s) });
    const svg = one(".gistui-chart__svg");
    const x = xs();
    pointer(svg, "pointerdown", x[1]!);
    pointer(svg, "pointermove", x[2]!);
    expect(q(".gistui-chart__brush").length).toBe(1);
    pointer(document, "pointerup", x[3]! + 500); // released outside the SVG
    expect(q(".gistui-chart__brush").length).toBe(0);
    expect(got).toEqual([{ kind: "range", from: "b", to: "d" }]);
    pointer(svg, "pointermove", x[0]!);
    expect(q(".gistui-chart__brush").length).toBe(0);
    expect(got.length).toBe(1);
  });

  test("pointercancel abandons the drag without selecting", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data, type: "line", select: "range", onSelect: (s) => got.push(s) });
    const svg = one(".gistui-chart__svg");
    const x = xs();
    pointer(svg, "pointerdown", x[0]!);
    pointer(svg, "pointermove", x[2]!);
    pointer(svg, "pointercancel", x[2]!);
    expect(q(".gistui-chart__brush").length).toBe(0);
    pointer(svg, "pointermove", x[3]!);
    expect(q(".gistui-chart__brush").length).toBe(0);
    expect(got).toEqual([]);
    // The next gesture works normally.
    pointer(svg, "pointerdown", x[0]!);
    pointer(svg, "pointermove", x[1]!);
    pointer(svg, "pointerup", x[1]!);
    expect(got).toEqual([{ kind: "range", from: "a", to: "b" }]);
  });

  test("the pointer is captured once a drag starts, and touch scrolling stays vertical while draggable", () => {
    createChart(host, { data, type: "line", zoom: true });
    const svg = one(".gistui-chart__svg") as unknown as SVGSVGElement & { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
    const captured: number[] = [];
    const released: number[] = [];
    svg.setPointerCapture = (id) => void captured.push(id);
    svg.releasePointerCapture = (id) => void released.push(id);
    const x = xs();
    // A press alone is not captured: its click must still land on the mark under it.
    pointer(svg, "pointerdown", x[1]!);
    expect(captured).toEqual([]);
    pointer(svg, "pointermove", x[1]! + 2);
    expect(captured).toEqual([]);
    pointer(svg, "pointermove", x[2]!);
    pointer(svg, "pointermove", x[3]!);
    expect(captured).toEqual([1]);
    expect(svg.style.touchAction).toBe("pan-y");
    pointer(document, "pointerup", x[3]!);
    expect(released).toEqual([1]);
    mount();
    createChart(host, { data, type: "line" });
    expect((one(".gistui-chart__svg") as HTMLElement).style.touchAction).toBe("");
    mount();
    createChart(host, { data, type: "bar", select: "range" });
    expect((one(".gistui-chart__svg") as HTMLElement).style.touchAction).toBe("pan-y");
    mount();
    createChart(host, { data, type: "line", zoom: true, interactive: false });
    expect((one(".gistui-chart__svg") as HTMLElement).style.touchAction).toBe("");
  });

  test("with zoom on, a press and release without a drag is still a click on the mark", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data: [{ x: 1, y: 2 }, { x: 4, y: 8 }, { x: 9, y: 3 }], type: "scatter", zoom: true, onSelect: (s) => got.push(s) });
    const p = q(".gistui-chart__point")[1]!;
    pointer(p, "pointerdown", num(p, "cx"), num(p, "cy"));
    pointer(p, "pointerup", num(p, "cx"), num(p, "cy"));
    click(p, num(p, "cx"), num(p, "cy"));
    expect(got).toEqual([{ kind: "point", x: 4, series: "y", value: 8, row: 1 }]);
    expect(one(".gistui-chart").hasAttribute("data-zoomed")).toBe(false);
  });

  test("a click selects only inside the plot rectangle", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data, type: "line", onSelect: (s) => got.push(s) });
    const svg = one(".gistui-chart__svg");
    const p = one('.gistui-chart__point[data-key="0:1"]');
    click(one(".gistui-chart__legend"), num(p, "cx"), num(p, "cy")); // legend background
    click(one(".gistui-chart__tooltip"), num(p, "cx"), num(p, "cy"));
    click(one(".gistui-chart"), num(p, "cx"), num(p, "cy"));
    click(svg, 2, num(p, "cy")); // y-axis margin
    click(svg, num(p, "cx"), 238); // x-axis labels
    expect(got).toEqual([]);
    click(svg, num(p, "cx"), num(p, "cy"));
    expect(got.length).toBe(1);
    expect(got[0]).toMatchObject({ kind: "point", row: 1 });
    // A click on a mark itself always selects it.
    mount();
    createChart(host, { data, type: "bar", onSelect: (s) => got.push(s) });
    click(one('.gistui-chart__bar[data-key="1:2"]'));
    expect(got[1]).toMatchObject({ kind: "point", series: "WAU", row: 2 });
  });
});

describe("stacked areas, long bar lists, empty pies (W25)", () => {
  test("a stacked area draws negative series away from zero", () => {
    createChart(host, { data: table([["a", -3, -3], ["b", -3, -3], ["c", -3, -3]]), type: "area", stacked: true });
    const zero = num(one(".gistui-chart__zero"), "y1");
    const first = num(one('[data-key="0:1"]'), "cy");
    const second = num(one('[data-key="1:1"]'), "cy");
    expect(first).toBeGreaterThan(zero + 1); // −3 is below the zero line
    expect(second).toBeGreaterThan(first + 1); // −6 is below −3
    // Positive stacks are as before: the second series sits above the first.
    mount();
    createChart(host, { data: table([["a", 3, 3], ["b", 3, 3]]), type: "area", stacked: true });
    expect(num(one('[data-key="1:1"]'), "cy")).toBeLessThan(num(one('[data-key="0:1"]'), "cy"));
  });

  test("hbar: 40 rows get room for their labels when the height is not set", () => {
    createChart(host, { data: grid(40, 1, (r) => r + 1), type: "hbar" });
    const ys = q(".gistui-chart__axis--y .gistui-chart__tick").map((t) => num(t, "y"));
    expect(ys.length).toBe(40);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(12);
    expect(num(one(".gistui-chart__svg"), "height")).toBeGreaterThan(240);
    // Few rows keep the default height.
    mount();
    createChart(host, { data: grid(8, 1, (r) => r + 1), type: "hbar" });
    expect(num(one(".gistui-chart__svg"), "height")).toBe(240);
  });

  test("hbar: with a fixed height (or very many rows) labels are thinned instead of overlapping", () => {
    createChart(host, { data: grid(40, 1, (r) => r + 1), type: "hbar", height: 240 });
    expect(num(one(".gistui-chart__svg"), "height")).toBe(240);
    const ys = q(".gistui-chart__axis--y .gistui-chart__tick").map((t) => num(t, "y"));
    expect(ys.length).toBeLessThan(40);
    expect(ys.length).toBeGreaterThan(5);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(12);
    expect(q(".gistui-chart__bar").length).toBe(40);
    mount();
    createChart(host, { data: grid(400, 1, (r) => r + 1), type: "hbar" });
    const many = q(".gistui-chart__axis--y .gistui-chart__tick").map((t) => num(t, "y"));
    for (let i = 1; i < many.length; i++) expect(many[i]! - many[i - 1]!).toBeGreaterThanOrEqual(12);
    expect(num(one(".gistui-chart__svg"), "height")).toBeLessThanOrEqual(720);
  });

  test("a pie or donut whose values are all zero shows the empty state", () => {
    for (const type of ["pie", "donut"] as const) {
      mount();
      createChart(host, { data: table([["a", 0], ["b", 0]], ["k", "v"]), type });
      expect(one(".gistui-chart").getAttribute("data-empty")).toBe("true");
      expect(one(".gistui-chart__empty").textContent).toBe("No data");
      expect(q("svg").length).toBe(0);
    }
    // Hiding every slice from the legend is not "no data": the legend must stay to bring them back.
    mount();
    createChart(host, { data: table([["a", 1]], ["k", "v"]), type: "pie" });
    click(one(".gistui-chart__legend-item"));
    expect(q(".gistui-chart__legend-item").length).toBe(1);
    expect(one(".gistui-chart").hasAttribute("data-empty")).toBe(false);
  });
});

describe("dense series (W26b, S18)", () => {
  const big = Array.from({ length: 50_000 }, (_, i) => ({ t: `p${i}`, a: Math.sin(i / 300) * 100 + (i % 97 === 0 ? 400 : 0), b: Math.cos(i / 500) * 50 }));

  test("50k rows × 2 series: a bounded number of nodes, and a path of about 2 points per pixel", () => {
    mount(600);
    const t0 = performance.now();
    createChart(host, { data: big, type: "line" });
    const ms = performance.now() - t0;
    expect(q(".gistui-chart__line").length).toBe(2);
    expect(host.querySelectorAll(".gistui-chart__svg *").length).toBeLessThan(100);
    expect(q(".gistui-chart__point").length).toBeLessThanOrEqual(2);
    for (const line of q(".gistui-chart__line")) {
      const points = (line.getAttribute("d")!.match(/[ML]/g) ?? []).length;
      expect(points).toBeGreaterThan(300);
      expect(points).toBeLessThanOrEqual(2 * 600 + 2);
    }
    expect(ms).toBeLessThan(150 * SLOW);
  });

  test("the spikes survive decimation", () => {
    mount(400);
    const rows = Array.from({ length: 4000 }, (_, i) => [`p${i}`, i === 1234 ? 1000 : i === 3210 ? -500 : 10] as (string | number)[]);
    createChart(host, { data: table(rows, ["x", "v"]), type: "line" });
    const ys = (one(".gistui-chart__line").getAttribute("d")!.match(/,(-?[\d.]+)/g) ?? []).map((s) => Number(s.slice(1)));
    const plotTop = Math.min(...q(".gistui-chart__grid-line").map((l) => num(l, "y1")));
    const plotBottom = Math.max(...q(".gistui-chart__grid-line").map((l) => num(l, "y1")));
    expect(Math.min(...ys)).toBeLessThan(plotTop + (plotBottom - plotTop) * 0.2); // the +1000 spike
    expect(Math.max(...ys)).toBeGreaterThan(plotBottom - (plotBottom - plotTop) * 0.05); // the −500 dip
  });

  test("hover, keyboard and selection still work on a decimated chart", () => {
    mount(600);
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data: big, type: "line", onSelect: (s) => got.push(s) });
    const svg = one(".gistui-chart__svg");
    pointer(svg, "pointermove", 300, 100);
    expect(one(".gistui-chart__tooltip").hidden).toBe(false);
    expect(one(".gistui-chart__tooltip").querySelectorAll(".gistui-chart__tooltip-row").length).toBe(2);
    expect(q(".gistui-chart__point[data-active]").length).toBeGreaterThanOrEqual(1);
    expect(q(".gistui-chart__crosshair").length).toBe(1);
    const stop = one('[tabindex="0"]');
    expect(stop.getAttribute("role")).toBe("button");
    stop.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const next = one('[tabindex="0"]');
    expect(next).not.toBe(stop);
    next.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(got[0]).toMatchObject({ kind: "point", series: "a" });
    expect(next.getAttribute("data-selected")).toBe("true");
    expect(q(".gistui-chart__point").length).toBeLessThan(12);
  });

  test("charts that are not dense keep every point", () => {
    mount(600);
    createChart(host, { data: grid(1000, 1, (r) => r % 50), type: "line" });
    expect(q(".gistui-chart__point").length).toBe(1000);
  });

  test("huge data never throws, whatever the type; a chart reads at most 5,000 rows", async () => {
    const huge = Array.from({ length: 300_000 }, (_, i) => ({ x: i, y: i % 13, z: (i * 7) % 5 }));
    for (const type of ["bar", "hbar", "line", "area", "pie", "donut", "scatter"] as const) {
      mount(600);
      expect(() => createChart(host, { data: huge, type, stacked: true, zoom: true })).not.toThrow();
      expect(host.querySelectorAll(".gistui-chart__svg *").length).toBeLessThan(25_000);
    }
    await Bun.sleep(5);
    expect(host.querySelectorAll(".gistui-chart__sr-table tbody tr").length).toBe(5000);
  });
});

describe("axis labels (W8)", () => {
  test("a narrow range far from zero has distinct tick labels", () => {
    createChart(host, { data: table([["a", 10012], ["b", 10019], ["c", 10028]], ["k", "v"]), type: "line" });
    const y = ticks("y");
    expect(new Set(y).size).toBe(y.length);
    expect(y).toContain("10,020");
    mount();
    createChart(host, { data: table([["a", 0.001], ["b", 0.0035]], ["k", "v"]), type: "bar" });
    expect(new Set(ticks("y")).size).toBe(ticks("y").length);
    expect(ticks("y")).toContain("0.001");
  });

  test("a scatter over years labels the x axis with years", () => {
    createChart(host, { data: [2019, 2020, 2021, 2022, 2023].map((year, i) => ({ year, value: i * 3 + 1 })), type: "scatter" });
    expect(ticks("x")).toEqual(["2019", "2020", "2021", "2022", "2023"]);
    // Amounts on x are abbreviated as before.
    mount();
    createChart(host, { data: [{ price: 5000, n: 1 }, { price: 15000, n: 2 }, { price: 25000, n: 3 }], type: "scatter" });
    expect(ticks("x")).toEqual(["5k", "10k", "15k", "20k", "25k"]);
  });
});
