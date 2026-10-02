import { describe, expect, test } from "bun:test";
import { merge, toEditSource } from "../src/merge";
import { printProgram } from "../src/printer";
import { parse } from "../src/stream";
import { DASHBOARD, lib } from "./fixtures/lib";
import { view } from "./helpers";

const STATEFUL = `$range = "30d"
root = Page(filter, list, body)
filter = Select("range", "Range", ["7d", "30d", "90d"], bind:$range)
sales = @query("get_sales", {range:$range}, default:{rows:[]}, every:60)
list = @each(sales.rows, r => Card(r.name, Stat("Revenue", r.total)))
body = $tab == "done" ? Text("Done") : Button("Save", do:[@set($tab, "done")], v:ghost)
`;

describe("printer", () => {
  for (const [name, src] of [
    ["dashboard", DASHBOARD],
    ["stateful", STATEFUL],
  ] as const) {
    test(`${name}: print → parse gives the same tree`, () => {
      const a = parse(src, lib);
      const printed = printProgram(a.program, lib);
      const b = parse(printed, lib);
      expect(view(b.root)).toEqual(view(a.root));
      expect(b.errors).toEqual([]);
    });

    test(`${name}: the hoisted printout renders the same UI`, () => {
      const a = parse(src, lib);
      const hoisted = toEditSource(src, lib);
      const b = parse(hoisted, lib);
      expect(view(b.root)).toEqual(view(a.root));
      // Printing is stable: a second pass changes nothing.
      expect(toEditSource(hoisted, lib)).toBe(hoisted);
    });
  }

  test("hoisting gives every inline component an id", () => {
    const out = toEditSource(`root = Card(Header("Hi"), Row(Stat("A", "1"), "note"))`, lib);
    expect(out).toBe(
      [`root = Card(_c1, _c2)`, `_c1 = Header("Hi")`, `_c2 = Row(_c3, "note")`, `_c3 = Stat("A", "1")`, ``].join("\n"),
    );
  });

  test("runtime expressions are not hoisted", () => {
    const out = toEditSource(`root = Stack(list)\nlist = @each(rows, r => Card(r.name))\nrows = [1]`, lib);
    expect(out).toContain(`list = @each(rows, r => Card(r.name))`);
  });

  test("tables keep raw cells and add type hints only when needed", () => {
    const out = printProgram(parse(`root = Table(t)\nt = |Month|Rev:s\n|Apr|$84,500\n|May|n/a`, lib).program, lib);
    expect(out).toBe(`root = Table(t)\nt = |Month|Rev:s\n|Apr|$84,500\n|May|n/a\n`);
  });
});

describe("merge (edit mode)", () => {
  const base = toEditSource(`root = Stack(kpis)\nkpis = Row(Stat("MAU", "128k"), Stat("MRR", "$412k"))`, lib);

  test("the base printout", () => {
    expect(base).toBe(`root = Stack(kpis)\nkpis = Row(_c1, _c2)\n_c1 = Stat("MAU", "128k")\n_c2 = Stat("MRR", "$412k")\n`);
  });

  test("patch a prop that was passed positionally", () => {
    const r = merge(base, `_c2.value = "$415k"`, lib);
    expect(r.source).toContain(`_c2 = Stat("MRR", "$415k")`);
    expect(r.errors).toEqual([]);
  });

  test("patch an optional prop adds it by name", () => {
    expect(merge(base, `kpis.gap = lg`, lib).source).toContain(`kpis = Row(_c1, _c2, gap:lg)`);
  });

  test("append a child, then define it", () => {
    const r = merge(base, `kpis += k3\nk3 = Stat("Churn", "2%")`, lib);
    expect(r.source).toContain(`kpis = Row(_c1, _c2, k3)`);
    expect(r.source).toContain(`k3 = Stat("Churn", "2%")`);
  });

  test("delete drops the reference and anything left unreachable", () => {
    const r = merge(base, `_c1 = null`, lib);
    expect(r.source).toBe(`root = Stack(kpis)\nkpis = Row(_c2)\n_c2 = Stat("MRR", "$412k")\n`);
  });

  test("replacing a container garbage-collects its old children", () => {
    const r = merge(base, `kpis = Row(_c2)`, lib);
    expect(r.source).not.toContain("_c1");
  });

  test("new inline components get fresh ids", () => {
    const r = merge(base, `kpis += Stat("New", "1")`, lib);
    expect(r.source).toContain(`kpis = Row(_c1, _c2, _c3)`);
    expect(r.source).toContain(`_c3 = Stat("New", "1")`);
  });
});
