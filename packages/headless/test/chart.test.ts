import { describe, expect, test } from "bun:test";
import type { TableData } from "@gistui/core";
import {
  bandScale,
  createChartModel,
  formatTick,
  formatValue,
  hasValues,
  linearScale,
  looksLikeYears,
  navigate,
  niceTicks,
  pieLayout,
  samePoint,
  stack,
  tickFormat,
  toggleHidden,
  valueExtent,
} from "../src/chart";

const table: TableData = {
  columns: [
    { name: "Month", type: "string" },
    { name: "MAU", type: "number" },
    { name: "Note", type: "string" },
    { name: "WAU", type: "number" },
  ],
  rows: [
    ["Apr", 84500, "a", 40100],
    ["May", null, "b", -5],
  ],
  text: [
    ["Apr", "84,500", "a", "40100"],
    ["May", "", "b", "-5"],
  ],
};

describe("chart model", () => {
  test("pipe table: first column is x, numeric columns are series", () => {
    const m = createChartModel(table);
    expect(m.xKey).toBe("Month");
    expect(m.categories).toEqual(["Apr", "May"]);
    expect(m.series.map((s) => [s.key, s.values, s.index])).toEqual([
      ["MAU", [84500, null], 0],
      ["WAU", [40100, -5], 1],
    ]);
    expect(m.xNumeric).toBe(false);
    expect(hasValues(m)).toBe(true);
  });

  test("x column by name, case-insensitive", () => {
    const m = createChartModel(table, { x: "wau" });
    expect(m.xKey).toBe("WAU");
    expect(m.categories).toEqual([40100, -5]);
    expect(m.xNumeric).toBe(true);
    expect(m.series.map((s) => s.key)).toEqual(["MAU"]);
  });

  test("array of objects: numeric detection, numeric strings, gaps", () => {
    const m = createChartModel([
      { month: "Jan", revenue: 10, users: "1,200", note: "x" },
      { month: "Feb", revenue: null, users: "$3,400" },
      { month: "Mar", revenue: "n/a" as unknown as number, users: 5 },
    ]);
    expect(m.xKey).toBe("month");
    // `n/a` in `revenue` is a gap, not the end of the series (W4); `note` is text.
    expect(m.series.map((s) => [s.key, s.values])).toEqual([
      ["revenue", [10, null, null]],
      ["users", [1200, 3400, 5]],
    ]);
  });

  test("object arrays with numeric x", () => {
    const m = createChartModel([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(m.xNumeric).toBe(true);
    expect(m.categories).toEqual([1, 3]);
  });

  test("empty and malformed data give an empty model", () => {
    for (const d of [null, undefined, [], [{}], { columns: [], rows: [], text: [] }]) {
      const m = createChartModel(d as never);
      expect(m.rows === 0 || m.series.length === 0).toBe(true);
      expect(hasValues(m)).toBe(false);
    }
  });

  test("NaN and Infinity become gaps", () => {
    const m = createChartModel([{ k: "a", v: Number.NaN }, { k: "b", v: Infinity }, { k: "c", v: 1 }]);
    expect(m.series[0]!.values).toEqual([null, null, 1]);
  });

  test("duplicate column names get unique keys", () => {
    const t: TableData = {
      columns: [{ name: "x", type: "string" }, { name: "v", type: "number" }, { name: "v", type: "number" }],
      rows: [["a", 1, 2]],
      text: [["a", "1", "2"]],
    };
    expect(createChartModel(t).series.map((s) => s.key)).toEqual(["v", "v (2)"]);
  });
});

describe("scales", () => {
  test("nice ticks", () => {
    expect(niceTicks(0, 87200)).toEqual({ min: 0, max: 100000, step: 20000, ticks: [0, 20000, 40000, 60000, 80000, 100000] });
    expect(niceTicks(-3, 7).ticks).toEqual([-4, -2, 0, 2, 4, 6, 8]);
    expect(niceTicks(0.1, 0.3).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
    expect(niceTicks(5, 5).ticks[0]).toBe(0);
    expect(niceTicks(0, 0).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(Number.NaN, 1).ticks.every(Number.isFinite)).toBe(true);
  });

  test("linear scale maps and inverts", () => {
    const s = linearScale([0, 87200], [200, 0]);
    expect(s.domain).toEqual([0, 100000]);
    expect(s(50000)).toBe(100);
    expect(s.invert(100)).toBe(50000);
    const raw = linearScale([10, 20], [0, 100], { nice: false });
    expect(raw(15)).toBe(50);
  });

  test("band scale", () => {
    const b = bandScale(4, [0, 400], 0.2);
    expect(b.step).toBe(100);
    expect(b.bandwidth).toBe(80);
    expect(b.pos(1)).toBe(110);
    expect(b.center(1)).toBe(150);
    expect(b.index(250)).toBe(2);
    expect(b.index(-10)).toBe(0);
    expect(b.index(999)).toBe(3);
  });

  test("stacking keeps positives and negatives apart", () => {
    const m = createChartModel([
      { k: "a", p: 2, q: 3, n: -1 },
      { k: "b", p: null, q: 1, n: -2 },
    ]);
    const segs = stack(m.series, m.rows);
    expect(segs[0]).toEqual([{ lo: 0, hi: 2 }, { lo: 0, hi: 0 }]);
    expect(segs[1]).toEqual([{ lo: 2, hi: 5 }, { lo: 0, hi: 1 }]);
    expect(segs[2]).toEqual([{ lo: -1, hi: 0 }, { lo: -2, hi: 0 }]);
    expect(valueExtent(m.series, m.rows, { stacked: true })).toEqual([-2, 5]);
    expect(valueExtent(m.series, m.rows)).toEqual([-2, 3]);
    expect(valueExtent([], 0)).toEqual([0, 1]);
    expect(valueExtent(createChartModel([{ k: "a", v: 5 }]).series, 1, { zero: true })).toEqual([0, 5]);
  });

  test("pie layout skips gaps, zeros, negatives and hidden rows", () => {
    const slices = pieLayout([1, null, 0, -3, 3]);
    expect(slices.map((s) => s.row)).toEqual([0, 4]);
    expect(slices[1]!.end).toBeCloseTo(Math.PI * 2);
    expect(slices[0]!.end).toBeCloseTo(Math.PI / 2);
    expect(pieLayout([1, 3], new Set([1])).map((s) => [s.row, s.end])).toEqual([[0, Math.PI * 2]]);
    expect(pieLayout([null, 0])).toEqual([]);
  });
});

describe("formatting and state", () => {
  test("compact ticks and full values", () => {
    expect([0, 950, 1200, 12500, 3_400_000, -2500, 0.25, 1e9].map(formatTick)).toEqual(["0", "950", "1.2k", "12.5k", "3.4M", "-2.5k", "0.25", "1B"]);
    expect(formatValue(84500)).toBe("84,500");
    expect(formatValue(62.456)).toBe("62.46");
    expect(formatValue(null)).toBe("–");
  });

  test("legend toggling and point identity", () => {
    const h = toggleHidden(new Set(), "MAU");
    expect([...h]).toEqual(["MAU"]);
    expect([...toggleHidden(h, "MAU")]).toEqual([]);
    expect(samePoint({ series: "a", row: 1 }, { series: "a", row: 1 })).toBe(true);
    expect(samePoint({ series: "a", row: 1 }, { series: "b", row: 1 })).toBe(false);
    expect(samePoint(null, null)).toBe(true);
    expect(samePoint(null, { series: "a", row: 0 })).toBe(false);
  });

  test("keyboard navigation", () => {
    // Two series × three rows, series 1 missing row 1.
    const items = [
      { s: 0, row: 0 },
      { s: 0, row: 1 },
      { s: 0, row: 2 },
      { s: 1, row: 0 },
      { s: 1, row: 2 },
    ];
    expect(navigate(items, 0, "ArrowRight")).toBe(1);
    expect(navigate(items, 2, "ArrowRight")).toBe(2);
    expect(navigate(items, 1, "ArrowLeft")).toBe(0);
    expect(navigate(items, 1, "ArrowUp")).toBe(3); // nearest row in series 1
    expect(navigate(items, 3, "ArrowDown")).toBe(0);
    expect(navigate(items, 3, "ArrowRight")).toBe(4);
    expect(navigate(items, 2, "Home")).toBe(0);
    expect(navigate(items, 0, "End")).toBe(4);
    expect(navigate(items, 0, "a")).toBe(-1);
    expect(navigate([], 0, "ArrowRight")).toBe(-1);
    // Horizontal bars: rows run top to bottom.
    expect(navigate(items, 0, "ArrowDown", true)).toBe(1);
  });
});

describe("axis tick labels (W8)", () => {
  const labels = (lo: number, hi: number, opts?: Parameters<typeof tickFormat>[1]) => {
    const t = niceTicks(lo, hi).ticks;
    return t.map(tickFormat(t, opts));
  };
  const distinct = (xs: string[]) => new Set(xs).size === xs.length;

  test("labels never collapse: the decimals come from the tick step", () => {
    expect(labels(10010, 10030)).toEqual(["10,010", "10,015", "10,020", "10,025", "10,030"]);
    expect(labels(1520, 1540)).toEqual(["1,520", "1,525", "1,530", "1,535", "1,540"]);
    expect(labels(0, 0.004)).toEqual(["0", "0.001", "0.002", "0.003", "0.004"]);
    expect(labels(12500, 12700)).toEqual(["12.5k", "12.55k", "12.6k", "12.65k", "12.7k"]);
    expect(labels(100000, 110000)).toEqual(["100k", "102k", "104k", "106k", "108k", "110k"]);
    expect(labels(100000, 107500, undefined)).toEqual(["100k", "102k", "104k", "106k", "108k"]);
    for (const [lo, hi] of [[10010, 10030], [1520, 1540], [0, 0.004], [999_400, 1_000_600], [0.00001, 0.00002], [-0.003, 0.003], [1e9, 1.0000001e9]] as const) {
      expect([lo, hi, distinct(labels(lo, hi))]).toEqual([lo, hi, true]);
    }
  });

  test("a step of 2.5 or 25 is not rounded away", () => {
    const t = [100000, 102500, 105000, 107500, 110000];
    expect(t.map(tickFormat(t))).toEqual(["100k", "102.5k", "105k", "107.5k", "110k"]);
    const u = [1500, 1525, 1550, 1575, 1600];
    expect(u.map(tickFormat(u))).toEqual(["1,500", "1,525", "1,550", "1,575", "1,600"]);
  });

  test("the unit is promoted when the mantissa rounds to 1000", () => {
    expect(formatTick(999_500)).toBe("1M");
    expect(formatTick(999_999_999)).toBe("1B");
    expect(formatTick(-999_950)).toBe("-1M");
    expect(formatTick(999_400)).toBe("999k");
  });

  test("years on an axis are never abbreviated", () => {
    const t = [2019, 2020, 2021, 2022, 2023];
    expect(t.map(tickFormat(t, { plain: true }))).toEqual(["2019", "2020", "2021", "2022", "2023"]);
    expect(looksLikeYears([2019, 2020, 2023])).toBe(true);
    expect(looksLikeYears([2019, 2020.5])).toBe(false);
    expect(looksLikeYears([999, 2020])).toBe(false);
    expect(looksLikeYears([])).toBe(false);
  });

  test("axes that read well today are unchanged", () => {
    const cases: [number, number][] = [[0, 87200], [0, 90100], [-3, 7], [0.1, 0.3], [0, 1], [0, 950], [0, 1500], [0, 12500], [0, 3_400_000], [-2500, 2500], [0, 0.25], [0, 1e9], [0, 5], [0, 100], [40100, 90100], [0, 56], [0, 2_000_000_000_000]];
    for (const [lo, hi] of cases) {
      const t = niceTicks(lo, hi).ticks;
      expect([lo, hi, t.map(tickFormat(t))]).toEqual([lo, hi, t.map(formatTick)]);
    }
  });
});
