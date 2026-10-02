import { describe, expect, test } from "bun:test";
import { parseStatement } from "../src/parser";
import { printExpr } from "../src/printer";
import { lib } from "./fixtures/lib";

const value = (src: string, partial = false) => {
  const text = /^\s*\$?[a-z_]\w*\s*=[^=]/.test(src) ? src : `x = ${src}`;
  const r = parseStatement(text, lib, partial);
  if (!r.stmt || !("value" in r.stmt)) throw new Error(`no value: ${JSON.stringify(r.problems)}`);
  return r.stmt.value;
};
const round = (src: string) => printExpr(value(src));

describe("parser", () => {
  test("statement kinds", () => {
    expect(parseStatement(`a = 1`, lib).stmt).toEqual({ kind: "assign", id: "a", value: { k: "num", v: 1 } });
    expect(parseStatement(`$tab = "a"`, lib).stmt).toEqual({ kind: "state", id: "tab", value: { k: "str", v: "a" } });
    expect(parseStatement(`k.value = "x"`, lib).stmt).toEqual({ kind: "patch", id: "k", prop: "value", value: { k: "str", v: "x" } });
    expect(parseStatement(`kpis += k5`, lib).stmt).toEqual({ kind: "append", id: "kpis", value: { k: "ref", name: "k5" } });
  });

  test("enums resolve only in key:WORD position of an enum prop", () => {
    expect(value(`Row(a, gap:lg)`)).toEqual({
      k: "comp",
      name: "Row",
      args: [{ value: { k: "ref", name: "a" } }, { name: "gap", value: { k: "enum", v: "lg" } }],
    });
    // `y` is a string prop, so a bare word there is a ref.
    expect(value(`Chart(d, y:users)`)).toMatchObject({ args: [{}, { name: "y", value: { k: "ref", name: "users" } }] });
  });

  test("flags resolve from boolean props of the enclosing component", () => {
    expect(value(`Row(a, b, wrap)`)).toMatchObject({ args: [{}, {}, { value: { k: "flag", name: "wrap" } }] });
    // `wrap` is not a flag of Card, so it stays a ref.
    expect(value(`Card(wrap)`)).toMatchObject({ args: [{ value: { k: "ref", name: "wrap" } }] });
  });

  test("named args with = and anywhere in the list", () => {
    expect(value(`Row(gap=sm, a)`)).toMatchObject({ args: [{ name: "gap", value: { k: "enum", v: "sm" } }, { value: { k: "ref" } }] });
  });

  test("digit-led enum words", () => {
    expect(value(`Row(gap:2xl)`)).toMatchObject({ args: [{ name: "gap", value: { k: "enum", v: "2xl" } }] });
  });

  test("expressions round-trip through the printer", () => {
    for (const s of [
      `$a + 1 * 2`,
      `($a + 1) * 2`,
      `$tab == "done" ? done : form`,
      `!$x && $y || $z`,
      `sales.rows[0].total`,
      `@each(sales.rows, r => Card(r.name, Stat("Revenue", r.total)))`,
      `@query("get_sales", {range:$range}, default:{rows:[]}, every:60)`,
      `[@run(save), @set($tab, "done"), @send("Goal saved")]`,
      `(a, b) => a + b`,
      `-5`,
      `"Total: " + @sum(sales.rows.total)`,
    ]) {
      expect(round(s)).toBe(s);
    }
  });

  test("string escapes are JSON", () => {
    expect(value(`"a\\n\\"b\\" \\u00e9"`)).toEqual({ k: "str", v: 'a\n"b" é' });
  });

  describe("partial (stream tail) parsing", () => {
    test("auto-closes brackets", () => {
      expect(printExpr(value(`x = Card(Header("Monthly`, true))).toBe(`Card(Header("Monthly"))`);
    });
    test("drops an identifier that may still grow", () => {
      expect(printExpr(value(`x = Row(a, Car`, true))).toBe(`Row(a)`);
      expect(printExpr(value(`x = Row(a, b,`, true))).toBe(`Row(a, b)`);
    });
    test("drops an incomplete named arg and trailing operator", () => {
      expect(printExpr(value(`x = Row(a, gap:`, true))).toBe(`Row(a)`);
      expect(printExpr(value(`x = $a +`, true))).toBe(`$a`);
    });
    test("reports the open string", () => {
      const r = parseStatement(`x = Card("### Tit`, lib, true);
      expect(r.openString).toEqual({ k: "str", v: "### Tit", partial: true });
    });
    test("no value yet is not an error", () => {
      expect(parseStatement(`x = Ca`, lib, true)).toEqual({ stmt: null, problems: [] });
    });
  });

  test("recovers from a missing comma and reports it", () => {
    const r = parseStatement(`x = Card("a" "b")`, lib);
    expect(r.stmt).not.toBeNull();
    expect(r.problems).toHaveLength(1);
  });

  test("hard syntax errors fail the statement", () => {
    expect(parseStatement(`x = Card(?)`, lib).stmt).toBeNull();
  });

  test("tables", () => {
    const r = parseStatement(`t = |Month|Rev:n|Note\n|---|---|---|\n|Apr|$84,500|a \\| b\n|May|n/a|`, lib);
    expect(r.stmt).toEqual({
      kind: "table",
      id: "t",
      table: {
        columns: [
          { name: "Month", type: "string" },
          { name: "Rev", type: "number", hinted: true },
          { name: "Note", type: "string" },
        ],
        rows: [
          ["Apr", 84500, "a | b"],
          ["May", null, null],
        ],
        text: [
          ["Apr", "$84,500", "a | b"],
          ["May", "n/a", ""],
        ],
      },
    });
  });
});

test("capitalized statement ids are statements and can be referenced", async () => {
  const { parse, defineLibrary } = await import("../src/index");
  const lib = defineLibrary({ components: [{ name: "Card", children: true, props: {} }, { name: "Tag", args: ["label"], props: { label: { type: "string", required: true } } }] });
  const r = parse(`root = Card(a)\na = SummaryTag\nSummaryTag = Tag("ok")\nThe dashboard shows revenue.\n`, lib);
  expect(r.errors.filter((e) => e.severity === "error")).toEqual([]);
  expect(r.errors.some((e) => e.code === "prose-ignored")).toBe(true);
  expect(r.root?.children[0]?.type).toBe("Tag");
});

describe("table mappings and bare enum values", () => {
  const mk = async () => {
    const { defineLibrary } = await import("../src/index");
    return defineLibrary({
      components: [
        { name: "Card", children: true, props: { variant: { type: "enum", values: ["card", "sunk"] }, direction: { type: "enum", values: ["row", "column"] } } },
        { name: "Col", args: ["label", "data"], props: { label: { type: "string", required: true }, data: { type: "array", required: true }, type: { type: "enum", values: ["string", "number"] } } },
        { name: "Table", children: { of: ["Col"] }, props: {}, table: { columns: { component: "Col", label: "label", values: "data", type: "type" } } },
        { name: "Series", args: ["category", "values"], props: { category: { type: "string", required: true }, values: { type: "array", required: true } } },
        { name: "BarChart", args: ["labels"], children: { of: ["Series"] }, props: { labels: { type: "array", required: true }, variant: { type: "enum", values: ["grouped", "stacked"] } }, table: { labels: "labels", columns: { component: "Series", label: "category", values: "values", numeric: true } } },
        { name: "PieChart", args: ["labels", "values"], props: { labels: { type: "array", required: true }, values: { type: "array", required: true } }, table: { labels: "labels", values: "values" } },
        { name: "Text", args: ["size?"], props: { size: { type: "enum", values: ["small", "large-heavy"] } } },
        { name: "Icon", args: ["name"], props: { name: { type: "enum", values: ["sun", "check-circle"], open: true, required: true }, plain: { type: "boolean" } } },
        { name: "Callout", args: ["variant", "title", "description"], props: { variant: { type: "enum", values: ["info", "warning"], required: true }, title: { type: "string", required: true }, description: { type: "string", required: true } } },
      ],
    });
  };

  test("a pipe table becomes the component's parts", async () => {
    const { parse } = await import("../src/index");
    const lib = await mk();
    const r = parse(`root = Card(t, c, p)\nt = Table(rows)\nc = BarChart(sales, stacked)\np = PieChart(mix)\nrows = |Name|Spend:n\n|Ada|$1,200\nsales = |Week|Web|Store\n|W1|10|4\n|W2|12|5\nmix = |Channel|Share\n|Web|60\n|Store|40\n`, lib);
    expect(r.errors.filter((e) => e.severity === "error")).toEqual([]);
    const [t, c, p] = r.root!.children;
    expect(t!.children.map((x) => [x.type, x.props])).toEqual([
      ["Col", { label: "Name", data: ["Ada"] }],
      ["Col", { label: "Spend", data: ["$1,200"], type: "number" }],
    ]);
    expect(c!.props).toEqual({ labels: ["W1", "W2"], variant: "stacked" });
    expect(c!.children.map((x) => x.props)).toEqual([
      { category: "Web", values: [10, 12] },
      { category: "Store", values: [4, 5] },
    ]);
    expect(p!.props).toEqual({ labels: ["Web", "Store"], values: [60, 40] });
  });

  test("bare enum values, hyphenated ones too; a statement with that name stays a reference", async () => {
    const { parse } = await import("../src/index");
    const lib = await mk();
    const a = parse(`root = Card(x, sunk, row)\nx = Text(large-heavy)\n`, lib);
    expect(a.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(a.root!.props).toEqual({ variant: "sunk", direction: "row" });
    expect(a.root!.children[0]!.props).toEqual({ size: "large-heavy" });
    const b = parse(`root = Card(x, row)\nx = Text()\nrow = Card(sunk)\n`, lib);
    expect(b.root!.props).toEqual({});
    expect(b.root!.children.map((c) => c.type)).toEqual(["Text", "Card"]);
    expect(b.root!.children[1]!.props).toEqual({ variant: "sunk" });
  });

  test("a hyphenated word in a positional enum slot is one value, open enums included", async () => {
    const { parse } = await import("../src/index");
    const lib = await mk();
    const r = parse(`root = Card(Icon(check-circle, plain), Icon(cloud-sun))\n`, lib);
    expect(r.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(r.root!.children.map((c) => c.props)).toEqual([{ name: "check-circle", plain: true }, { name: "cloud-sun" }]);
  });

  test("a prop given by name, flag or bare enum word keeps its slot; positionals fill the rest in order", async () => {
    const { parse } = await import("../src/index");
    const lib = await mk();
    const want = { variant: "info", title: "T", description: "D" };
    for (const call of [`Callout(variant:info, "T", "D")`, `Callout("T", "D", info)`, `Callout(info, "T", "D")`, `Callout("D", info, title:"T")`, `Callout("T", "D", variant:info)`]) {
      const r = parse(`root = Card(${call})\n`, lib);
      expect(r.errors.filter((e) => e.severity === "error")).toEqual([]);
      expect(r.root!.children[0]!.props).toEqual(want);
    }
  });

  test("lenient forms some models write: bare text, optional props by position, tables inside a call", async () => {
    const { parse, defineLibrary } = await import("../src/index");
    const lib = defineLibrary({
      components: [
        { name: "Card", children: true, props: {} },
        { name: "Item", args: ["value", "title"], props: { value: { type: "string", required: true }, title: { type: "string", required: true }, detail: { type: "string" }, tone: { type: "enum", values: ["info", "warn"] } } },
        { name: "Chart", args: ["data"], props: { data: { type: "data", required: true }, x: { type: "string" } } },
      ],
    });
    // A bare word in a text slot that nothing defines is that text (a warning, not an error).
    const a = parse(`root = Card(Item(billing, "Billing"))\n`, lib);
    expect(a.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(a.errors.map((e) => e.code)).toContain("bare-text");
    expect(a.root!.children[0]!.props).toEqual({ value: "billing", title: "Billing" });
    // …but a statement with that name still wins.
    expect(parse(`root = Card(Item(billing, "Billing"))\nbilling = "acct"\n`, lib).root!.children[0]!.props.value).toBe("acct");
    // Positional values past the required ones fill optional props in order; null skips one.
    const b = parse(`root = Card(Item("v", "T", "More", "warn"), Item("v", "T", null, "info"))\n`, lib);
    expect(b.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(b.root!.children.map((c) => c.props)).toEqual([{ value: "v", title: "T", detail: "More", tone: "warn" }, { value: "v", title: "T", tone: "info" }]);
    // Pipe rows inside a call become a table statement.
    const c = parse(`root = Card(trend)\ntrend = Chart(\n  |Week|Volume\n  |W1|30\n  |W2|45\n, x:"Week")\n`, lib);
    expect(c.errors.filter((e) => e.severity === "error")).toEqual([]);
    const chart = c.root!.children[0]!;
    expect(chart.props.x).toBe("Week");
    expect(JSON.stringify(chart.props.data)).toContain("W2");
  });

  test("streaming: a bare enum word turns into a reference when its statement arrives", async () => {
    const { createStream } = await import("../src/index");
    const lib = await mk();
    const s = createStream(lib);
    s.push("root = Card(row)\n");
    expect(s.snapshot()!.props).toEqual({ direction: "row" });
    s.push("row = Card(sunk)\n");
    s.end();
    expect(s.snapshot()!.props).toEqual({});
    expect(s.snapshot()!.children[0]!.props).toEqual({ variant: "sunk" });
  });
});

describe("flags in objects and bare enum positionals", () => {
  test("`{wrap, clip}` means `{wrap:true, clip:true}`; `Icon(plane)` is the enum value unless a statement is named plane", async () => {
    const { parse, defineLibrary } = await import("../src/index");
    const lib = defineLibrary({
      components: [
        { name: "Frame", children: true, props: { style: { type: "object" } } },
        { name: "Icon", args: ["name"], props: { name: { type: "enum", values: ["star", "user"], open: true, required: true } } },
      ],
    });
    const a = parse(`root = Frame(Icon(plane), Icon(star), style:{layout:"row", wrap, clip, gap:8})\n`, lib);
    expect(a.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(a.root!.props.style).toEqual({ layout: "row", wrap: true, clip: true, gap: 8 });
    expect(a.root!.children.map((c) => c.props.name)).toEqual(["plane", "star"]);
    const b = parse(`root = Frame(Icon(plane))\nplane = Icon(user)\n`, lib);
    expect(b.errors.filter((e) => e.severity === "error").map((e) => e.code)).toContain("invalid-enum");
  });
});
