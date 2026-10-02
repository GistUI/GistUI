import { expect, test } from "bun:test";
import { columnValues, displayCell, filterTable, pageList } from "../src/table";

const data = {
  columns: [{ name: "Name", type: "string" as const }, { name: "Area", type: "string" as const }, { name: "WAU", type: "number" as const }],
  rows: [["Dashboards", "Analytics", 48200], ["Alerts", "Monitoring", 22400], ["Reports", "Analytics", 31900]],
  text: [["Dashboards", "Analytics", "48200"], ["Alerts", "Monitoring", "22400"], ["Reports", "Analytics", "31900"]],
};

test("search and column filters combine", () => {
  expect(filterTable(data, { query: "rep" }).rows).toHaveLength(1);
  expect(filterTable(data, { columns: new Map([[1, new Set(["Analytics"])]]) }).rows).toHaveLength(2);
  expect(filterTable(data, { query: "alerts", columns: new Map([[1, new Set(["Analytics"])]]) }).rows).toHaveLength(0);
  expect(filterTable(data, {})).toBe(data);
});

test("column values with counts, in first-seen order", () => {
  expect(columnValues(data, 1)).toEqual([{ value: "Analytics", count: 2 }, { value: "Monitoring", count: 1 }]);
});

test("unformatted large numbers get separators; authored text is kept", () => {
  expect(displayCell("48200", data.columns[2]!)).toBe("48,200");
  expect(displayCell("2024", data.columns[2]!)).toBe("2024");
  expect(displayCell("$412,000", data.columns[2]!)).toBe("$412,000");
  expect(displayCell("48200", data.columns[0]!)).toBe("48200");
});

test("page list keeps ends and neighbours with gaps", () => {
  expect(pageList(0, 5)).toEqual([0, 1, 2, 3, 4]);
  expect(pageList(10, 20)).toEqual([0, null, 9, 10, 11, null, 19]);
  expect(pageList(0, 20)).toEqual([0, 1, 2, 3, null, 19]);
});
