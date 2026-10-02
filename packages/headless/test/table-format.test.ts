import { describe, expect, test } from "bun:test";
import type { TableData } from "@gistui/core";
import { displayCell, filterTable, normalizeTable, tablePageSize, tableView } from "../src/table";

const pipe = (cols: [string, "number" | "string"][], text: string[][]): TableData => ({
  columns: cols.map(([name, type]) => ({ name, type })),
  rows: text.map((r) => r.map((c, i) => (cols[i]![1] === "number" ? (c === "" ? null : Number(c.replace(/,/g, ""))) : c === "" ? null : c))),
  text,
});

/** What a renderer shows: `normalizeTable` → `tableView` → `displayCell` per cell. */
function shown(data: Parameters<typeof normalizeTable>[0], column: number): string[] {
  const view = tableView(normalizeTable(data));
  return view.rows.map((r) => displayCell(r.text[column] ?? "", view.columns[column]!));
}

describe("table display (W16)", () => {
  test("object data: a year column is not grouped", () => {
    expect(shown([{ year: 2024, users: 48200 }, { year: 2025, users: 51000 }], 0)).toEqual(["2024", "2025"]);
    expect(shown([{ year: 2024, users: 48200 }, { year: 2025, users: 51000 }], 1)).toEqual(["48,200", "51,000"]);
    // By value: every cell is an integer between 1000 and 2999.
    expect(shown([{ founded: 1998 }, { founded: 2011 }], 0)).toEqual(["1998", "2011"]);
    // By header: ids, zips and codes are not quantities, whatever their size.
    expect(shown([{ orderId: 104233 }, { orderId: 98 }], 0)).toEqual(["104233", "98"]);
    expect(shown([{ zip: 90210 }], 0)).toEqual(["90210"]);
    // A header that only contains the letters is not an id: "Paid" still groups.
    expect(shown([{ Paid: 48200 }, { Paid: 950 }], 0)).toEqual(["48,200", "950"]);
  });

  test("pipe tables: a column is formatted consistently", () => {
    const t = pipe([["Feature", "string"], ["WAU", "number"]], [["a", "800"], ["b", "9100"], ["c", "48200"]]);
    expect(shown(t, 1)).toEqual(["800", "9,100", "48,200"]);
    // Nothing in the column needs separators: 4-digit cells stay as written.
    expect(shown(pipe([["k", "string"], ["v", "number"]], [["a", "800"], ["b", "9100"]]), 1)).toEqual(["800", "9100"]);
    // Years and ids stay as written even next to nothing else.
    expect(shown(pipe([["Year", "number"], ["v", "number"]], [["2024", "1"], ["12024", "2"]]), 0)).toEqual(["2024", "12024"]);
    expect(shown(pipe([["Order no.", "number"]], [["104233"], ["2001"]]), 0)).toEqual(["104233", "2001"]);
    // Text the author formatted is never touched.
    expect(shown(pipe([["k", "string"], ["v", "number"]], [["a", "$412,000"], ["b", "48200"]]), 1)).toEqual(["$412,000", "48,200"]);
  });

  test("long integers are grouped digit by digit, not through a double", () => {
    const col = { name: "n", type: "number" as const };
    expect(displayCell("12345678901234567890", col)).toBe("12,345,678,901,234,567,890");
    expect(displayCell("-9007199254740993", col)).toBe("-9,007,199,254,740,993");
    expect(displayCell("12345678901234567890.25", col)).toBe("12,345,678,901,234,567,890.25");
    expect(normalizeTable([{ n: "12345678901234567890" }]).text).toEqual([["12345678901234567890"]]);
  });

  test("a column without column-level information keeps the old rule (5+ digits)", () => {
    const col = { name: "WAU", type: "number" as const };
    expect(displayCell("48200", col)).toBe("48,200");
    expect(displayCell("2024", col)).toBe("2024");
    expect(displayCell("48200.5", col)).toBe("48,200.5");
  });

  test("normalizing the same pipe table twice gives the same object", () => {
    const t = pipe([["k", "string"], ["v", "number"]], [["a", "48200"]]);
    expect(normalizeTable(t)).toBe(normalizeTable(t));
    expect(normalizeTable(t).rows).toBe(t.rows);
    expect(normalizeTable(t).text).toBe(t.text);
  });
});

describe("table search (W16)", () => {
  const t = pipe([["Feature", "string"], ["WAU", "number"]], [["Dashboards", "48200"], ["Alerts", "9100"], ["Reports", "31900"]]);

  test("matches the text as displayed, and still the text as written", () => {
    const n = normalizeTable(t);
    expect(filterTable(n, { query: "48,200" }).text.map((r) => r[0])).toEqual(["Dashboards"]);
    expect(filterTable(n, { query: "9,1" }).text.map((r) => r[0])).toEqual(["Alerts"]);
    expect(filterTable(n, { query: "48200" }).text.map((r) => r[0])).toEqual(["Dashboards"]);
    expect(filterTable(n, { query: "nothing" }).rows).toEqual([]);
  });
});

describe("tablePageSize: one rule for every renderer", () => {
  test("not given: a long table pages by ten, a short one is one page", () => {
    expect(tablePageSize(undefined, 12)).toBe(0);
    expect(tablePageSize(undefined, 13)).toBe(10);
    expect(tablePageSize(Number.NaN, 40)).toBe(10);
    expect(tablePageSize(-3, 40)).toBe(10);
  });
  test("0: one page, up to 200 rows; a longer table pages at 200", () => {
    expect(tablePageSize(0, 11)).toBe(0);
    expect(tablePageSize(0, 200)).toBe(0);
    expect(tablePageSize(0, 450)).toBe(200);
  });
  test("n: n rows, at most 200", () => {
    expect(tablePageSize(25, 1000)).toBe(25);
    expect(tablePageSize(5.9, 1000)).toBe(5);
    expect(tablePageSize(100000, 1000)).toBe(200);
  });
});
