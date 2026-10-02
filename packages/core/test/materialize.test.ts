import { describe, expect, test } from "bun:test";
import { defineLibrary } from "../src/schema";
import { createStream, parse } from "../src/stream";
import { DASHBOARD, lib } from "./fixtures/lib";
import { view } from "./helpers";

const codes = (src: string) => parse(src, lib).errors.map((e) => e.code);

describe("materializer", () => {
  test("dashboard example", () => {
    const r = parse(DASHBOARD, lib);
    expect(r.errors).toEqual([]);
    expect(r.valid).toEqual({ strict: true, lenient: true });
    expect(view(r.root)).toEqual({
      type: "Page",
      props: { gap: "lg" },
      children: [
        { type: "Header", props: { title: "Product Analytics", subtitle: "Usage, acquisition and revenue" } },
        {
          type: "Stats",
          props: {
            data: {
              table: ["Label:s", "Value:n", "Delta:n"],
              rows: [
                ["MAU", 128400, 6.2],
                ["New users (30d)", 24950, 3.1],
                ["MRR", 412000, 4.4],
              ],
            },
          },
        },
        {
          type: "Row",
          props: { wrap: true },
          children: [
            {
              type: "Card",
              children: [
                { type: "Header", props: { title: "Monthly Active Users" } },
                {
                  type: "Chart",
                  props: { data: { table: ["Month:s", "MAU:n"], rows: [["Apr", 84500], ["May", 87200]] }, type: "bar", y: "Users" },
                },
              ],
            },
            {
              type: "Card",
              children: [
                { type: "Text", props: { content: "### Acquisition" } },
                { type: "Chart", props: { data: { table: ["Channel:s", "Share:n"], rows: [["Organic", 34], ["Paid", 22]] }, type: "donut" } },
                { type: "Text", props: { content: "_Tip: track CAC by channel._" } },
              ],
            },
          ],
        },
        {
          type: "Card",
          children: [
            { type: "Header", props: { title: "Top Features" } },
            {
              type: "Table",
              props: {
                data: { table: ["Feature:s", "WAU:n", "Adoption %:n", "Uses/User:n"], rows: [["Dashboards", 48200, 62.5, 5.8]] },
              },
            },
          ],
        },
      ],
    });
  });

  test("node ids are statement ids and paths under them", () => {
    const r = parse(DASHBOARD, lib);
    expect(r.store.get("mau")!.children).toEqual(["mau/0", "mau/1"]);
    expect(r.store.get("acq")!.children).toEqual(["acq/0", "acq/1", "acq/2"]);
  });

  test("state, queries and expressions stay runtime expressions", () => {
    const r = parse(
      `$range = "30d"
root = Page(filter, list, total, body)
sales = @query("get_sales", {range:$range}, default:{rows:[]}, every:60)
filter = Select("range", "Range", ["7d", "30d", "90d"], bind:$range)
list = @each(sales.rows, r => Card(r.name, Stat("Revenue", r.total)))
total = "Total: " + @sum(sales.rows.total)
body = $tab == "done" ? doneView : formView
doneView = Text("Done")
formView = Form("goal", Input("goal", "Goal", bind:$goal), Button("Save", do:[@run(save), @set($tab, "done")]))
save = @mutation("update_goal", {goal:$goal})
`,
      lib,
    );
    expect(r.errors).toEqual([]);
    expect(view(r.root)).toMatchObject({
      type: "Page",
      children: [
        { type: "Select", props: { name: "range", label: "Range", options: ["7d", "30d", "90d"] }, dyn: { bind: "$range" } },
        { type: "#expr", dyn: { value: "@each(sales.rows, r => Card(r.name, Stat(\"Revenue\", r.total)))" } },
        { type: "#expr", dyn: { value: '"Total: " + @sum(sales.rows.total)' } },
        { type: "#expr", dyn: { value: '$tab == "done" ? doneView : formView' } },
      ],
    });
    expect([...r.program.program.state.keys()]).toEqual(["range"]);
    expect([...r.program.program.exprs.keys()].sort()).toEqual(["body", "list", "sales", "save", "total"]);
  });

  test("forward refs are placeholders until defined, then replaced in place", () => {
    const s = createStream(lib);
    s.push(`root = Page(head, body)\n`);
    s.flush();
    expect(s.store.get("head")).toMatchObject({ type: "#pending", partial: true });
    const rootBefore = s.store.get("root");
    s.push(`head = Header("Hi")\n`);
    s.flush();
    expect(s.store.get("head")).toMatchObject({ type: "Header", props: { title: "Hi" } });
    // The parent did not change: it only holds ids.
    expect(s.store.get("root")).toBe(rootBefore!);
  });

  test("placeholders carry the expected type when the parent allows only one", () => {
    const s = createStream(lib);
    s.push(`root = Tabs(t1)\n`);
    s.flush();
    expect(s.store.get("t1")).toMatchObject({ type: "#pending", expected: "Tab" });
  });

  test("unresolved refs are dropped and reported at the end", () => {
    const r = parse(`root = Page(a, missing)\na = Text("x")`, lib);
    expect(r.store.get("root")!.children).toEqual(["a"]);
    expect(r.errors).toMatchObject([{ code: "unresolved-ref", stmtId: "root", fixed: true }]);
    expect(r.valid).toEqual({ strict: false, lenient: true });
  });

  test("shared refs are materialized once (linear DAG)", () => {
    // 14 levels show 2^15 components, under the limit; 20 levels would show 2^21, and are capped.
    for (const n of [14, 20]) {
      const lines = ["root = Stack(a0)"];
      for (let i = 0; i < n; i++) lines.push(`a${i} = Stack([a${i + 1}, a${i + 1}])`);
      lines.push(`a${n} = Text("leaf")`);
      const t0 = performance.now();
      const r = parse(lines.join("\n"), lib);
      const ms = performance.now() - t0;
      if (n === 14) expect(r.errors).toEqual([]);
      else expect([...new Set(r.errors.map((e) => e.code))]).toEqual(["limit"]);
      expect(r.store.size).toBe(n + 2); // root + a0…aN
      expect(ms).toBeLessThan(20);
    }
  });

  test("cycles are cut and reported", () => {
    const r = parse(`root = Stack(a)\na = Stack(b)\nb = Stack(a)`, lib);
    expect(r.errors.map((e) => e.code)).toEqual(["cycle"]);
    expect(r.root).not.toBeNull();
  });

  test("a swapped-letter typo counts as one edit (Crad → Card, not Grid)", () => {
    const lib2 = defineLibrary({
      components: [
        { name: "Grid", children: true, props: {} },
        { name: "Card", children: true, props: {} },
      ],
    });
    expect(parse(`root = Crad("x")`, lib2).store.get("root")!.type).toBe("Card");
  });

  test("unknown components snap to the closest name", () => {
    const r = parse(`root = Crad("x")`, lib);
    expect(r.store.get("root")!.type).toBe("Card");
    expect(r.errors).toMatchObject([{ code: "unknown-component", fixed: true }]);
    expect(r.valid).toEqual({ strict: false, lenient: true });
  });

  test("unknown components with no close match render their children", () => {
    const r = parse(`root = Zzzzzzz("x", title:"t")`, lib);
    expect(view(r.root)).toEqual({
      type: "#unknown",
      props: { component: "Zzzzzzz", title: "t" },
      children: [{ type: "Text", props: { content: "x" } }],
    });
    expect(r.valid.lenient).toBe(false);
  });

  test("missing required props", () => {
    expect(codes(`root = Stat("Revenue")`)).toEqual(["missing-required"]);
  });

  test("a required prop fed by a later statement is not missing", () => {
    expect(codes(`root = Chart(d)\nd = |a|b\n|x|1`)).toEqual([]);
  });

  test("excess positional args", () => {
    expect(codes(`root = Stat("a", "b", "c", "d")`)).toEqual(["excess-args"]);
  });

  test("enum coercion: aliases, case, closest match, fallback", () => {
    const r = parse(`root = Stack(a, b, c, d)\na = Row(gap:medium)\nb = Row(gap:LG)\nc = Row(gap:lgg)\nd = Chart(t, type:sparkle)\nt = |x|y\n|a|1`, lib);
    expect(r.store.get("a")!.props.gap).toBe("md");
    expect(r.store.get("b")!.props.gap).toBe("lg");
    expect(r.store.get("c")!.props.gap).toBe("lg");
    expect(r.store.get("d")!.props.type).toBe("bar");
    expect(r.errors.map((e) => [e.code, e.severity, e.fixed ?? false])).toEqual([
      ["invalid-enum", "warning", true],
      ["invalid-enum", "error", true],
    ]);
  });

  test("type coercions", () => {
    const r = parse(`root = Table(t, pageSize:"25", sort:"true")\nt = |a\n|1`, lib);
    expect(r.store.get("root")!.props).toMatchObject({ pageSize: 25, sort: true });
  });

  test("prop aliases", () => {
    const r = parse(`root = Card("x", variant:sunk)`, lib);
    expect(r.store.get("root")!.props.v).toBe("sunk");
  });

  test("arrays in children position spread", () => {
    const r = parse(`root = Row([a, b])\na = Text("1")\nb = Text("2")`, lib);
    expect(r.store.get("root")!.children).toEqual(["a", "b"]);
  });

  test("a list statement spreads as children", () => {
    const r = parse(`root = Row(items)\nitems = [a, "b"]\na = Text("1")`, lib);
    expect(view(r.root)).toEqual({
      type: "Row",
      children: [
        { type: "Text", props: { content: "1" } },
        { type: "Text", props: { content: "b" } },
      ],
    });
  });

  test("leaked prose lines are ignored with a warning", () => {
    const r = parse(`Sure! Here is the UI:\nroot = Text("x")\nLet me know if…`, lib);
    expect(r.errors.map((e) => e.code)).toEqual(["prose-ignored", "prose-ignored"]);
    expect(r.valid).toEqual({ strict: true, lenient: true });
  });

  test("unreachable statements are reported", () => {
    expect(codes(`root = Text("x")\nextra = Text("y")`)).toEqual(["unreachable"]);
  });

  test("no root: the first component is used", () => {
    const r = parse(`main = Text("x")`, lib);
    expect(r.store.root).toBe("main");
  });
});

describe("edit operations", () => {
  const base = `root = Stack(kpis)\nkpis = Row(k1, k2)\nk1 = Stat("MAU", "128k")\nk2 = Stat("MRR", "$412k")\n`;

  test("patch a positional prop by schema name", () => {
    const r = parse(base + `k2.value = "$415k"`, lib);
    expect(r.store.get("k2")!.props).toEqual({ label: "MRR", value: "$415k" });
  });

  test("append a child", () => {
    const r = parse(base + `kpis += k3\nk3 = Stat("Churn", "2%")`, lib);
    expect(r.store.get("kpis")!.children).toEqual(["k1", "k2", "k3"]);
  });

  test("delete removes the node and the reference", () => {
    const r = parse(base + `k1 = null`, lib);
    expect(r.store.get("k1")).toBeUndefined();
    expect(r.store.get("kpis")!.children).toEqual(["k2"]);
    expect(r.errors).toEqual([]);
  });

  test("the last definition wins", () => {
    const r = parse(base + `k1 = Stat("DAU", "40k")`, lib);
    expect(r.store.get("k1")!.props).toEqual({ label: "DAU", value: "40k" });
  });

  test("a patch to a missing statement is reported", () => {
    expect(parse(base + `nope.value = "x"`, lib).errors.map((e) => e.code)).toEqual(["patch-target-missing"]);
  });
});
