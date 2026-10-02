import { describe, expect, test } from "bun:test";
import { parse, type TableData } from "@gistui/core";
import { defineLibrary } from "@gistui/core";
import { nextSort, normalizeTable, tableView } from "../src/table";

const lib = defineLibrary({ components: [] });
const table = (src: string) => (parse(`t = ${src}`, lib).program.program.data.get("t") as TableData);

describe("table model", () => {
  const t = table("|Name|Revenue|Note\n|b|$2,000|x\n|a|n/a|y\n|c|$10|z");

  test("sorts numbers with nulls last, both directions", () => {
    expect(tableView(t, { sort: { column: 1, dir: "asc" } }).rows.map((r) => r.text[0])).toEqual(["c", "b", "a"]);
    expect(tableView(t, { sort: { column: 1, dir: "desc" } }).rows.map((r) => r.text[0])).toEqual(["b", "c", "a"]);
  });

  test("sorts text naturally and keeps raw display text", () => {
    const v = tableView(t, { sort: { column: 0, dir: "asc" } });
    expect(v.rows.map((r) => r.text[0])).toEqual(["a", "b", "c"]);
    expect(v.rows[1]!.text[1]).toBe("$2,000");
    expect(v.columns[1]).toMatchObject({ align: "right", sort: null });
    expect(v.columns[0]).toMatchObject({ align: "left", sort: "asc" });
  });

  test("pages, clamping the page number", () => {
    const v = tableView(t, { pageSize: 2, page: 9 });
    expect(v).toMatchObject({ total: 3, page: 1, pageCount: 2 });
    expect(v.rows.map((r) => r.index)).toEqual([2]);
  });

  test("header clicks cycle asc → desc → none", () => {
    expect(nextSort(null, 1)).toEqual({ column: 1, dir: "asc" });
    expect(nextSort({ column: 1, dir: "asc" }, 1)).toEqual({ column: 1, dir: "desc" });
    expect(nextSort({ column: 1, dir: "desc" }, 1)).toBeNull();
    expect(nextSort({ column: 1, dir: "desc" }, 0)).toEqual({ column: 0, dir: "asc" });
  });

  test("normalizes arrays of objects (query results)", () => {
    const n = normalizeTable([{ name: "A", total: 10 }, { name: "B", total: null, extra: true }]);
    expect(n.columns).toEqual([
      { name: "name", type: "string" },
      { name: "total", type: "number" },
      { name: "extra", type: "string" },
    ]);
    expect(n.rows).toEqual([
      ["A", 10, null],
      ["B", null, "true"],
    ]);
  });

  test("empty and scalar inputs", () => {
    expect(tableView(null).rows).toEqual([]);
    expect(normalizeTable([1, 2]).columns).toEqual([{ name: "Value", type: "number" }]);
  });
});
