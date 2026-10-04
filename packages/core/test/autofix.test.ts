import { describe, expect, test } from "bun:test";
import { autofix, createStream, defineLibrary, parse } from "../src/index";

const lib = defineLibrary({
  components: [
    { name: "Card", children: true, props: { variant: { type: "enum", values: ["card", "sunk"] } } },
    { name: "Callout", args: ["variant", "title", "description"], props: { variant: { type: "enum", values: ["info", "warning"], required: true }, title: { type: "string", required: true }, description: { type: "string", required: true } } },
    { name: "Dialog", args: ["label"], children: true, props: { label: { type: "string", required: true }, tone: { type: "enum", values: ["default", "outline"] } } },
    { name: "Item", args: ["value", "title"], props: { value: { type: "string", required: true }, title: { type: "string", required: true } } },
    { name: "Text", args: ["text"], props: { text: { type: "string", required: true } } },
    { name: "Table", args: ["rows"], props: { rows: { type: "data", required: true } } },
    { name: "Divider", props: {} },
  ],
});
const errorsOf = (src: string) => parse(src, lib).errors.filter((e) => e.severity === "error" || ["unknown-prop", "invalid-prop", "invalid-enum", "unreachable"].includes(e.code));

describe("autofix (deterministic repair, no model)", () => {
  test("a valid program is left alone", () => {
    const r = autofix(`root = Card(Text("Hi"))\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.changes).toEqual([]);
  });

  test("text in a required enum's slot keeps its text; the enum is added by name", () => {
    const r = autofix(`root = Card(c)\nc = Callout("Budget tip", "Spend is on track.")\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`c = Callout("Budget tip", "Spend is on track.", variant:info)`);
  });

  test("invalid optional values and unknown props are dropped; references to nothing removed", () => {
    const r = autofix(`root = Card(d, missing)\nd = Dialog("Open", Text("x"), tone:primary, color:red)\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`root = Card(d)`);
    expect(r.source).toMatch(/d = Dialog\("Open", _c\d+\)/);
    expect(errorsOf(r.source)).toEqual([]);
  });

  test("a missing required name is filled; a section nobody used is added to root", () => {
    const r = autofix(`root = Card(i)\ni = Item(title:"Billing")\nextra = Text("Also shown")\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`i = Item(title:"Billing", value:"billing")`);
    expect(r.source).toContain(`root = Card(i, extra)`);
  });

  test("every change is listed", () => {
    const r = autofix(`root = Card(d)\nd = Dialog("Open", tone:primary)\n`, lib);
    expect(r.changes.some((c) => c.includes("tone"))).toBe(true);
  });
});

describe("autofix keeps what the model wrote", () => {
  test("a table written inside a call moves to its own statement, commas in cells included", () => {
    const r = autofix(`root = Card(t)\nt = Table(|Speaker|Bio|, |Alex|CTO, Acme|, |Priya|Head of Platform|)\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`t = Table(tRows)`);
    expect(r.source).toContain(`|Alex|CTO, Acme`);
    expect(r.source).toContain(`|Priya|Head of Platform`);
  });

  test("an inline table with literal \\n between rows, followed by more arguments", () => {
    const r = autofix(`root = Card(t, variant:sunk)\nt = Table(|Day|Rate\\n|Mon|2.1\\n|Tue|1.8|)\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`|Mon|2.1`);
    expect(r.source).toContain(`|Tue|1.8`);
    expect(r.source).toContain(`root = Card(t, variant:sunk)`);
  });

  test("curly quotes used as string quotes", () => {
    const r = autofix(`root = Card(Text(“Hello”))\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`"Hello"`);
  });

  test("a reference that misses a statement by case or one letter points at it", () => {
    const r = autofix(`root = Card(MetricsCard, incidentsPanel)\nmetricsCard = Text("MRR")\nincidentPanel = Text("2 open")\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toContain(`root = Card(metricsCard, incidentPanel)`);
  });

  test("a component named without parentheses is called", () => {
    const r = autofix(`root = Card(Text("a"), Divider)\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toMatch(/Divider\(\)/);
  });

  test("unused sections that only mention each other in text are still placed", () => {
    // `genre` appears in genreRows' header, and genreRows is used by genre: only genre goes on root.
    const r = autofix(`root = Card(Text("Overview"))\ngenre = Card(Text("By genre"), Table(genreRows))\ngenreRows = |genre|share\n|Drama|40\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toMatch(/root = Card\(_c\d+, genre\)/);
  });

  test("a data table nobody used is shown in a table, not deleted", () => {
    const r = autofix(`root = Card(Text("Learners"))\nrisk = |Learner|Score\n|Ann|3\n`, lib);
    expect(r.valid).toBe(true);
    expect(r.source).toMatch(/root = Card\(_c\d+, Table\(risk\)\)|root = Card\(_c\d+, _c\d+\)/);
    expect(r.source).toContain(`|Ann|3`);
  });
});

describe("autofix in place (renderers)", () => {
  const lib = defineLibrary({
    components: [
      { name: "Page", children: true, props: {} },
      { name: "Card", children: true, props: { v: { type: "enum", values: ["card", "sunk"] } } },
      { name: "Header", args: ["title"], props: { title: { type: "string", required: true } } },
      { name: "Text", args: ["text"], props: { text: { type: "string", required: true } } },
      { name: "Callout", args: ["text"], props: { text: { type: "string", required: true } } },
    ],
  });
  const BROKEN = `root = Page(Card(Header("Hi"), colour:"red"), Txt("hello"), missing)\nnote = Callout("Placed by autofix")\n`;

  test('shape:"original" keeps components inline, so their ids are the ones they had while streaming', () => {
    const r = autofix(BROKEN, lib, { shape: "original" });
    expect(r.valid).toBe(true);
    expect(r.source).not.toMatch(/_c\d+/);
    expect(r.source).toContain("Card(Header(");
  });

  test("rewrite() repairs a program in the same store: unchanged nodes keep their identity", () => {
    const s = createStream(lib);
    s.push(BROKEN);
    s.end();
    const header = s.store.get("root/0/0");
    expect(header?.type).toBe("Header");
    const patches = s.rewrite(autofix(BROKEN, lib, { shape: "original" }).source);
    expect(s.store.get("root/0/0")).toBe(header);
    // The unused Callout already existed; only root's children change.
    expect(patches.some((p) => p.op === "children" && p.id === "root")).toBe(true);
    expect(s.errors().filter((e) => e.severity === "error")).toEqual([]);
    expect(s.snapshot()?.children.map((c) => c.type)).toEqual(["Card", "Text", "Callout"]);
  });
});
