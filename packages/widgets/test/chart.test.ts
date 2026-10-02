import { beforeEach, describe, expect, test } from "bun:test";
import type { TableData } from "@gistui/core";
import { createChart } from "../src/chart";
import type { ChartProps, ChartSelection } from "../src/types";

const table = (rows: (string | number | null)[][], cols = ["Month", "MAU", "WAU"]): TableData => ({
  columns: cols.map((name, i) => ({ name, type: i === 0 ? "string" : "number" })),
  rows,
  text: rows.map((r) => r.map((c) => (c === null ? "" : String(c)))),
});

const rev = table([
  ["Apr", 84500, 40100],
  ["May", 87200, 41000],
  ["Jun", 90100, null],
]);

let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.appendChild(host);
});

const q = (sel: string) => host.querySelectorAll(sel);
const one = (sel: string) => host.querySelector(sel) as HTMLElement;

function key(el: Element, k: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}
function click(el: Element, x = 0, y = 0) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
}
function pointer(el: Element, type: string, x: number, y = 50) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
}

function allAttributes(root: Element): string[] {
  const out: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const a of Array.from(el.attributes)) out.push(`${el.tagName}.${a.name}=${a.value}`);
  }
  return out;
}

describe("chart types", () => {
  test("bar: one rect per non-null value, grouped by series", () => {
    createChart(host, { data: rev, type: "bar" });
    expect(one(".gistui-chart").getAttribute("data-gistui-chart-type")).toBe("bar");
    expect(q(".gistui-chart__bar").length).toBe(5);
    expect(q(".gistui-chart__series").length).toBe(2);
    expect(q(".gistui-chart__legend-item").length).toBe(2);
    expect(q(".gistui-chart__grid-line").length).toBeGreaterThan(2);
  });

  test("stacked bar, hbar", () => {
    createChart(host, { data: rev, type: "bar", stacked: true });
    expect(q(".gistui-chart__bar").length).toBe(5);
    host.replaceChildren();
    createChart(host, { data: rev, type: "hbar" });
    expect(q(".gistui-chart__bar").length).toBe(5);
    expect(one(".gistui-chart").getAttribute("data-gistui-chart-type")).toBe("hbar");
  });

  test("line and area: a path per series, points per value, gaps split lines", () => {
    createChart(host, { data: rev, type: "line" });
    expect(q(".gistui-chart__line").length).toBe(2);
    expect(q(".gistui-chart__point").length).toBe(5);
    host.replaceChildren();
    const gappy = table([["a", 1, 1], ["b", null, 2], ["c", 3, 3]]);
    createChart(host, { data: gappy, type: "area", stacked: true });
    expect(q(".gistui-chart__area").length).toBe(2);
    const d = q(".gistui-chart__line")[0]!.getAttribute("d")!;
    expect(d.match(/M/g)!.length).toBe(2); // the gap splits the first series into two runs
  });

  test("pie and donut: a slice per positive value, legend per category", () => {
    const shares = table([["Organic", 34], ["Paid", 22], ["None", 0]], ["Channel", "Share"]);
    createChart(host, { data: shares, type: "pie" });
    expect(q(".gistui-chart__slice").length).toBe(2);
    expect(q(".gistui-chart__legend-item").length).toBe(3);
    host.replaceChildren();
    createChart(host, { data: shares, type: "donut" });
    expect(one(".gistui-chart__total").textContent).toBe("56");
    // A single category draws a full ring without NaN.
    host.replaceChildren();
    createChart(host, { data: table([["Only", 5]], ["k", "v"]), type: "donut" });
    expect(q(".gistui-chart__slice").length).toBe(1);
  });

  test("scatter with a numeric x axis", () => {
    const pts = [{ x: 1, y: 2 }, { x: 4, y: 8 }, { x: 9, y: 3 }];
    createChart(host, { data: pts, type: "scatter" });
    expect(q(".gistui-chart__point").length).toBe(3);
    const xs = Array.from(q(".gistui-chart__point")).map((c) => Number(c.getAttribute("cx")));
    expect(xs[0]! < xs[1]! && xs[1]! < xs[2]!).toBe(true);
  });

  test("negative values draw below the zero line", () => {
    createChart(host, { data: table([["a", 5], ["b", -5]], ["k", "v"]), type: "bar" });
    expect(q(".gistui-chart__zero").length).toBe(1);
    const [pos, neg] = Array.from(q(".gistui-chart__bar"));
    expect(Number(neg!.getAttribute("y"))).toBeGreaterThanOrEqual(Number(pos!.getAttribute("y")) + Number(pos!.getAttribute("height")) - 0.01);
  });

  test("empty data renders an empty state", () => {
    for (const data of [null, undefined, [], table([])]) {
      host.replaceChildren();
      createChart(host, { data, type: "line" });
      expect(one(".gistui-chart__empty")).not.toBeNull();
      expect(one(".gistui-chart").getAttribute("data-empty")).toBe("true");
    }
  });

  test("no NaN or Infinity in any attribute, whatever the data", () => {
    const nasty = [
      { k: "a", v: Number.NaN, w: Infinity },
      { k: "b", v: "x", w: -Infinity },
      { k: "c", v: 0, w: 0 },
    ] as unknown as Record<string, unknown>[];
    for (const type of ["bar", "hbar", "line", "area", "pie", "donut", "scatter"] as const) {
      host.replaceChildren();
      createChart(host, { data: nasty, type, stacked: true, zoom: true });
      host.replaceChildren();
      createChart(host, { data: rev, type, height: 0 });
      const bad = allAttributes(host).filter((a) => /NaN|Infinity/.test(a));
      expect(bad).toEqual([]);
    }
  });

  test("screen-reader table holds the data (built right after the first frame)", async () => {
    createChart(host, { data: rev, type: "bar", label: "Revenue" });
    await Bun.sleep(1);
    const t = one(".gistui-chart__sr-table");
    expect(t.querySelector("caption")!.textContent).toBe("Revenue");
    expect(t.querySelectorAll("tbody tr").length).toBe(3);
    expect(t.querySelector("tbody td")!.textContent).toBe("84,500");
  });
});

describe("interactions", () => {
  test("legend toggles a series and excludes it from the scale", () => {
    createChart(host, { data: rev, type: "bar" });
    const item = q(".gistui-chart__legend-item")[0]!;
    expect(item.getAttribute("aria-pressed")).toBe("true");
    click(item);
    expect(q(".gistui-chart__bar").length).toBe(2);
    expect(q(".gistui-chart__legend-item")[0]!.getAttribute("aria-pressed")).toBe("false");
    // Only WAU (≤ 41,000) remains: the top tick shrinks below 80k.
    const ticks = Array.from(q(".gistui-chart__axis--y .gistui-chart__tick")).map((t) => t.textContent);
    expect(ticks).not.toContain("80k");
    click(q(".gistui-chart__legend-item")[0]!);
    expect(q(".gistui-chart__bar").length).toBe(5);
  });

  test("pie legend hides a slice", () => {
    createChart(host, { data: table([["A", 1], ["B", 3]], ["k", "v"]), type: "pie" });
    click(q(".gistui-chart__legend-item")[1]!);
    expect(q(".gistui-chart__slice").length).toBe(1);
  });

  test("click selects a point; clicking it again clears", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data: rev, type: "bar", onSelect: (s) => got.push(s) });
    const bar = q(".gistui-chart__bar")[1]!; // MAU, May
    click(bar);
    expect(got[0]).toEqual({ kind: "point", x: "May", series: "MAU", value: 87200, row: 1 });
    expect(bar.getAttribute("data-selected")).toBe("true");
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(one(".gistui-chart").hasAttribute("data-has-selection")).toBe(true);
    click(q(".gistui-chart__bar")[1]!);
    expect(got[1]).toBeNull();
    expect(q(".gistui-chart__bar")[1]!.hasAttribute("data-selected")).toBe(false);
  });

  test("controlled selection highlights without re-rendering", () => {
    const c = createChart(host, { data: rev, type: "bar", selected: null });
    const svg = one(".gistui-chart__svg");
    const firstBar = q(".gistui-chart__bar")[0];
    c.update({ data: rev, type: "bar", selected: { kind: "point", x: "Jun", series: "MAU", value: 90100, row: 2 } });
    expect(one(".gistui-chart__svg")).toBe(svg);
    expect(q(".gistui-chart__bar")[0]).toBe(firstBar!);
    expect(host.querySelector('[data-selected="true"]')!.getAttribute("data-key")).toBe("0:2");
  });

  test("keyboard: roving tabindex, arrows move, Enter selects, Escape clears", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data: rev, type: "bar", onSelect: (s) => got.push(s) });
    const stops = Array.from(q('[tabindex="0"]'));
    expect(stops.length).toBe(1);
    const first = stops[0]!;
    expect(first.getAttribute("data-key")).toBe("0:0");
    key(first, "ArrowRight");
    const second = one('[tabindex="0"]');
    expect(second.getAttribute("data-key")).toBe("0:1");
    expect(q('[tabindex="0"]').length).toBe(1);
    expect(one(".gistui-chart__tooltip").hidden).toBe(false);
    expect(one(".gistui-chart__tooltip").textContent).toContain("87,200");
    key(second, "ArrowUp");
    expect(one('[tabindex="0"]').getAttribute("data-key")).toBe("1:1");
    key(one('[tabindex="0"]'), "Enter");
    expect(got.at(-1)).toMatchObject({ kind: "point", series: "WAU", row: 1 });
    key(one('[tabindex="0"]'), "Escape");
    expect(got.at(-1)).toBeNull();
  });

  test("interactive:false blocks selection but keeps hover", () => {
    const got: unknown[] = [];
    createChart(host, { data: rev, type: "bar", interactive: false, onSelect: (s) => got.push(s) });
    expect(one(".gistui-chart").getAttribute("aria-disabled")).toBe("true");
    const bar = q(".gistui-chart__bar")[0]!;
    expect(bar.getAttribute("role")).toBe("img");
    click(bar);
    key(bar, "Enter");
    expect(got).toEqual([]);
    bar.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(one(".gistui-chart__tooltip").hidden).toBe(false);
  });

  test("line hover shows every series for the nearest row", () => {
    createChart(host, { data: rev, type: "line" });
    const svg = one(".gistui-chart__svg");
    const pt = q('.gistui-chart__point[data-key="0:1"]')[0]!;
    pointer(svg, "pointermove", Number(pt.getAttribute("cx")), Number(pt.getAttribute("cy")));
    const tip = one(".gistui-chart__tooltip");
    expect(tip.hidden).toBe(false);
    expect(tip.querySelectorAll(".gistui-chart__tooltip-row").length).toBe(2);
    expect(q(".gistui-chart__crosshair").length).toBe(1);
  });

  test("range brush selects from/to categories", () => {
    const got: (ChartSelection | null)[] = [];
    const data = table([["a", 1, 1], ["b", 2, 2], ["c", 3, 3], ["d", 4, 4]]);
    createChart(host, { data, type: "line", select: "range", onSelect: (s) => got.push(s) });
    const svg = one(".gistui-chart__svg");
    const xs = Array.from(q('.gistui-chart__point[data-series="MAU"]')).map((p) => Number(p.getAttribute("cx")));
    pointer(svg, "pointerdown", xs[1]!);
    pointer(svg, "pointermove", xs[2]!);
    expect(q(".gistui-chart__brush").length).toBe(1);
    pointer(svg, "pointerup", xs[3]!);
    click(svg, xs[3]!); // the click that follows a drag is ignored
    expect(got).toEqual([{ kind: "range", from: "b", to: "d" }]);
    expect(q(".gistui-chart__brush").length).toBe(0);
  });

  test("range mode: a click clears, Enter selects a one-category range", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data: rev, type: "line", select: "range", selected: { kind: "range", from: "Apr", to: "May" }, onSelect: (s) => got.push(s) });
    expect(q(".gistui-chart__range").length).toBe(1);
    click(q(".gistui-chart__point")[0]!);
    expect(got).toEqual([null]);
    key(one('[tabindex="0"]'), "Enter");
    expect(got[1]).toEqual({ kind: "range", from: "Apr", to: "Apr" });
  });

  test("zoom: drag narrows the rows, double-click resets", () => {
    const rows = Array.from({ length: 10 }, (_, i) => [`r${i}`, i, i] as (string | number)[]);
    createChart(host, { data: table(rows), type: "line", zoom: true });
    const svg = one(".gistui-chart__svg");
    const xs = Array.from(q('.gistui-chart__point[data-series="MAU"]')).map((p) => Number(p.getAttribute("cx")));
    pointer(svg, "pointerdown", xs[2]!);
    pointer(svg, "pointermove", xs[5]!);
    pointer(svg, "pointerup", xs[5]!);
    expect(one(".gistui-chart").getAttribute("data-zoomed")).toBe("true");
    expect(q('.gistui-chart__point[data-series="MAU"]').length).toBe(4);
    svg.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(q('.gistui-chart__point[data-series="MAU"]').length).toBe(10);
  });

  test("interactive:false disables zoom", () => {
    const rows = Array.from({ length: 6 }, (_, i) => [`r${i}`, i, i] as (string | number)[]);
    createChart(host, { data: table(rows), type: "line", zoom: true, interactive: false });
    const svg = one(".gistui-chart__svg");
    pointer(svg, "pointerdown", 100);
    pointer(svg, "pointermove", 300);
    pointer(svg, "pointerup", 300);
    expect(one(".gistui-chart").hasAttribute("data-zoomed")).toBe(false);
  });
});

describe("dense charts", () => {
  const rows = Array.from({ length: 400 }, (_, i) => [`p${i}`, i % 50] as (string | number)[]);
  const data = table(rows, ["x", "v"]);

  test("only the tab stop carries role and label; keyboard and selection still work", () => {
    const got: (ChartSelection | null)[] = [];
    createChart(host, { data, type: "line", onSelect: (s) => got.push(s) });
    expect(one(".gistui-chart").getAttribute("data-dense")).toBe("true");
    expect(q(".gistui-chart__point").length).toBe(400);
    expect(q(".gistui-chart__point[aria-label]").length).toBe(1);
    const stop = one('[tabindex="0"]');
    expect(stop.getAttribute("role")).toBe("button");
    key(stop, "ArrowRight");
    const next = one('[tabindex="0"]');
    expect(next.getAttribute("data-key")).toBe("0:1");
    expect(q(".gistui-chart__point[aria-label]").length).toBe(1);
    expect(q("[tabindex]").length).toBe(1);
    key(next, "Enter");
    expect(got[0]).toMatchObject({ kind: "point", row: 1, value: 1 });
    expect(next.getAttribute("data-selected")).toBe("true");
    expect(next.getAttribute("aria-pressed")).toBe("true");
    key(next, "ArrowRight");
    expect(next.hasAttribute("aria-pressed")).toBe(false);
    expect(next.getAttribute("data-selected")).toBe("true");
  });
});

describe("lifecycle", () => {
  test("update with the same props does not touch the DOM", () => {
    const props: ChartProps = { data: rev, type: "bar" };
    const c = createChart(host, props);
    const bar = q(".gistui-chart__bar")[0];
    c.update({ ...props });
    c.update({ ...props, onSelect: () => {} });
    expect(q(".gistui-chart__bar")[0]).toBe(bar!);
  });

  test("new data re-renders into the same root; the focused mark survives", () => {
    const c = createChart(host, { data: rev, type: "bar" });
    const root = one(".gistui-chart");
    (q('[data-key="0:1"]')[0] as HTMLElement).focus();
    const more = table([...rev.rows, ["Jul", 95000, 42000]]);
    c.update({ data: more, type: "bar" });
    expect(one(".gistui-chart")).toBe(root);
    expect(q(".gistui-chart__bar").length).toBe(7);
    expect(document.activeElement?.getAttribute("data-key")).toBe("0:1");
  });

  test("animates once, on the first render with complete data", () => {
    const c = createChart(host, { data: rev, type: "bar", partial: true });
    expect(one(".gistui-chart").hasAttribute("data-animate")).toBe(false);
    c.update({ data: rev, type: "bar", partial: false });
    expect(one(".gistui-chart").getAttribute("data-animate")).toBe("true");
    c.update({ data: rev, type: "line", partial: false });
    expect(one(".gistui-chart").hasAttribute("data-animate")).toBe(false);
  });

  test("destroy removes the DOM and listeners", () => {
    const got: unknown[] = [];
    const c = createChart(host, { data: rev, type: "bar", onSelect: (s) => got.push(s) });
    const bar = q(".gistui-chart__bar")[0]!;
    c.destroy();
    expect(host.children.length).toBe(0);
    click(bar);
    c.update({ data: rev, type: "line" });
    expect(host.children.length).toBe(0);
    expect(got).toEqual([]);
  });

  test("data never reaches innerHTML", () => {
    const evil = table([["<img src=x onerror=alert(1)>", 1]], ["k", "v"]);
    createChart(host, { data: evil, type: "bar", label: "<b>x</b>" });
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("b")).toBeNull();
  });
});

describe("performance", () => {
  test("a 1,000-point line chart renders in under 10 ms", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => [`p${i}`, Math.sin(i / 20) * 100 + i] as (string | number)[]);
    const data = table(rows, ["x", "v"]);
    for (let i = 0; i < 5; i++) {
      const h = document.createElement("div");
      createChart(h, { data, type: "line" }).destroy();
    }
    // Best of many runs: a busy machine (a parallel build) slows some runs, not the best one.
    let best = Infinity;
    for (let i = 0; i < 25; i++) {
      const h = document.createElement("div");
      const t0 = performance.now();
      createChart(h, { data, type: "line" });
      best = Math.min(best, performance.now() - t0);
    }
    console.log(`1,000-point line chart: ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(10);
  });
});

describe("donut centre", () => {
  test("shares adding up to 100 show the largest share and its category", () => {
    const zones = table([["Ring of Fire", 81], ["Alpide belt", 15], ["Ridges", 4]], ["Setting", "Share"]);
    createChart(host, { data: zones, type: "donut" });
    expect(one(".gistui-chart__total").textContent).toBe("81%");
    expect(one(".gistui-chart__total-label").textContent).toBe("Ring of Fire");
  });
});
