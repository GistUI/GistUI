import { describe, expect, test } from "bun:test";
import type { TableData } from "@gistui/core";
import { createChartModel, hasValues, toValue } from "../src/chart";
import { parseNumber, tableView } from "../src/table";

// Time limits are for a developer machine; shared CI runners are several times slower (GISTUI_PERF_SLACK is set there).
const SLOW = Math.max(1, Number(process.env.GISTUI_PERF_SLACK ?? 3) / 3);

describe("parseNumber (W4/W15)", () => {
  test("currency, suffixes, percent, accounting negatives, Unicode minus", () => {
    const cases: [unknown, number | null][] = [
      ["$1.2M", 1_200_000],
      ["3.4k", 3400],
      ["3.4K", 3400],
      ["2B", 2e9],
      ["1.5T", 1.5e12],
      ["$900k", 900_000],
      ["+12%", 12],
      ["-4.5%", -4.5],
      ["(300)", -300],
      ["($1,200.50)", -1200.5],
      ["−5", -5],
      ["-$5", -5],
      ["$-5", -5],
      ["€1,234,567", 1_234_567],
      ["12 €", 12],
      ["1 234", 1234],
      ["1,234", 1234],
      [".5", 0.5],
      ["5.", 5],
      ["1e3", 1000],
      ["1.5E-3", 0.0015],
      [42, 42],
      [-0.5, -0.5],
    ];
    for (const [input, want] of cases) expect([input, parseNumber(input)]).toEqual([input, want]);
  });

  test("dashes, n/a, empty and text are null", () => {
    for (const v of ["", "  ", "-", "—", "–", "--", "n/a", "N/A", "na", "null", "abc", "12 apples", "Q1", "5m", "1.2.3", "$", "%", "()", null, undefined, true, {}, Number.NaN, Infinity]) {
      expect([v, parseNumber(v)]).toEqual([v, null]);
    }
  });

  test("ambiguous decimal commas are null; grouped thousands still parse", () => {
    expect(parseNumber("1,5")).toBeNull();
    expect(parseNumber("1.200,50")).toBeNull();
    expect(parseNumber("12,34")).toBeNull();
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("12,345,678.9")).toBe(12345678.9);
    expect(parseNumber("1,2345")).toBeNull();
  });

  test("a very long cell is rejected without scanning it repeatedly", () => {
    const t0 = performance.now();
    expect(parseNumber("1".repeat(200_000) + "x")).toBeNull();
    expect(parseNumber(" ".repeat(200_000))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50 * SLOW);
  });

  test("toValue is the same parser", () => {
    expect(toValue("$1.2M")).toBe(1_200_000);
    expect(toValue("1,200")).toBe(1200);
    expect(toValue("—")).toBeNull();
  });
});

describe("chart model: formatted numbers (W4/W15)", () => {
  const pipe = (cols: [string, "number" | "string"][], text: string[][]): TableData => ({
    columns: cols.map(([name, type]) => ({ name, type })),
    // What the pipe-table parser stores: numbers for a number column, the raw text otherwise.
    rows: text.map((r) => r.map((c, i) => (cols[i]![1] === "number" ? toNumberLikeCore(c) : c === "" ? null : c))),
    text,
  });
  const toNumberLikeCore = (c: string): number | null => {
    const s = c.replace(/[\s,$€£¥%+]/g, "");
    return /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s) ? Number(s) : null;
  };

  test("a pipe-table column of `$1.2M` cells (typed string by the parser) is a series", () => {
    const m = createChartModel(pipe([["Q", "string"], ["Revenue", "string"]], [["Q1", "$1.2M"], ["Q2", "$900k"], ["Q3", "$4.5M"]]));
    expect(m.series.map((s) => [s.name, s.values])).toEqual([["Revenue", [1_200_000, 900_000, 4_500_000]]]);
    expect(hasValues(m)).toBe(true);
  });

  test("a first-row dash does not turn the column into text", () => {
    const m = createChartModel(pipe([["Month", "string"], ["Churn", "string"]], [["Jan", "—"], ["Feb", "2.1%"], ["Mar", "1.8%"]]));
    expect(m.series.map((s) => [s.name, s.values])).toEqual([["Churn", [null, 2.1, 1.8]]]);
  });

  test("a number column re-reads cells the pipe parser could not (suffixes, accounting negatives)", () => {
    const m = createChartModel(pipe([["Month", "string"], ["Net", "number"]], [["Jan", "1,200"], ["Feb", "(300)"], ["Mar", "3.4k"], ["Apr", "−5"]]));
    expect(m.series[0]!.values).toEqual([1200, -300, 3400, -5]);
  });

  test("text columns stay text; a `:s` hint is respected; mostly-text columns are not series", () => {
    const t = pipe([["Name", "string"], ["Team", "string"], ["Code", "string"], ["Mixed", "string"]], [["a", "Core", "12", "1"], ["b", "Infra", "34", "x"], ["c", "Core", "56", "y"]]);
    t.columns[2]!.hinted = true;
    expect(createChartModel(t).series).toEqual([]);
  });

  test("object data: an unparseable cell is a gap, not the end of the series", () => {
    const m = createChartModel([{ m: "Jan", rev: 10 }, { m: "Feb", rev: "n/a" }, { m: "Mar", rev: "$1.2k" }]);
    expect(m.series.map((s) => [s.name, s.values])).toEqual([["rev", [10, null, 1200]]]);
    // Most cells must parse: two words and one number is a text column.
    expect(createChartModel([{ m: "a", v: "low" }, { m: "b", v: "high" }, { m: "c", v: 3 }]).series).toEqual([]);
  });

  test("at most 5,000 rows are read (S18)", () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ x: i, y: i % 7 }));
    const m = createChartModel(rows);
    expect(m.rows).toBe(5000);
    expect(m.categories.length).toBe(5000);
    expect(m.series[0]!.values.length).toBe(5000);
    const t: TableData = { columns: [{ name: "x", type: "string" }, { name: "y", type: "number" }], rows: rows.map((r) => [`r${r.x}`, r.y]), text: rows.map((r) => [`r${r.x}`, String(r.y)]) };
    expect(createChartModel(t).rows).toBe(5000);
  });
});

describe("table sort: formatted numbers (W4/W15)", () => {
  test("a text column of `$1.2M`-style cells sorts by value, placeholders last", () => {
    const text = [["a", "$1.2M"], ["b", "$900k"], ["c", "$4.5M"], ["d", "$12M"], ["e", "—"]];
    const t: TableData = { columns: [{ name: "Name", type: "string" }, { name: "ARR", type: "string" }], rows: text.map((r) => [...r]), text };
    expect(tableView(t, { sort: { column: 1, dir: "asc" } }).rows.map((r) => r.text[1])).toEqual(["$900k", "$1.2M", "$4.5M", "$12M", "—"]);
    expect(tableView(t, { sort: { column: 1, dir: "desc" } }).rows.map((r) => r.text[1])).toEqual(["$12M", "$4.5M", "$1.2M", "$900k", "—"]);
  });

  test("a text column that is mostly words still sorts as text", () => {
    const text = [["b10"], ["a2"], ["a10"], ["7"]];
    const t: TableData = { columns: [{ name: "Id", type: "string" }], rows: text.map((r) => [...r]), text };
    expect(tableView(t, { sort: { column: 0, dir: "asc" } }).rows.map((r) => r.text[0])).toEqual(["7", "a2", "a10", "b10"]);
  });
});
