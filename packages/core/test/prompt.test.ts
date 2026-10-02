import { describe, expect, test } from "bun:test";
import { componentDocs, estimateTokens, generatePrompt } from "../src/prompt";
import { signature } from "../src/signature";
import { lib } from "./fixtures/lib";

const tools = [
  { name: "get_sales", args: "{range:str}", description: "Sales rows" },
  { name: "add_goal", args: "{goal:num}" },
];

describe("prompt generator", () => {
  test("is byte-stable, whatever order tools come in", () => {
    const a = generatePrompt(lib, { tools }).text;
    const b = generatePrompt(lib, { tools: [...tools].reverse() }).text;
    expect(a).toBe(b);
    expect(a).toBe(generatePrompt(lib, { tools }).text);
  });

  test("the syntax card's examples use only the library's own components, props and values", async () => {
    const { defineLibrary } = await import("../src/index");
    const small = defineLibrary({
      components: [
        { name: "Box", group: "Layout", children: true, props: { variant: { type: "enum", values: ["plain", "sunk"] }, wrap: { type: "boolean" } } },
        { name: "Label", group: "Content", args: ["text"], props: { text: { type: "string", required: true } } },
      ],
      textComponent: "Label",
    });
    const p = generatePrompt(small, { examples: ["root = Box(Label(\"Hi\"))"], notes: { Layout: ["- Box is the root."] } });
    for (const missing of ["Row(", "Page(", "Card(", "Tag(", "Stack("]) expect(p.text).not.toContain(missing);
    expect(p.text).toContain("`Box(a, b, wrap)`");
    expect(p.text).toContain("`Box(a, b, sunk)`");
    expect(p.text).toContain("`root = Box(head, body)`");
    expect(p.text).toContain("`Box(Label(\"New\"), Label(\"Sale\"))`");
    // Group notes sit under their group's signatures; the final check comes before any tools.
    expect(p.text).toMatch(/Layout:\n  Box\(.*\n  - Box is the root\./);
    expect(p.sections.map((x) => x.name)).toContain("check");
    expect(generatePrompt(small, { tools }).sections.at(-1)!.name).toBe("tools");
  });

  test("the dynamic tool list goes last", () => {
    const p = generatePrompt(lib, { tools });
    expect(p.sections.at(-1)!.name).toBe("tools");
    expect(p.text.trimEnd().endsWith("- get_sales {range:str}: Sales rows")).toBe(true);
    expect(p.text.indexOf("add_goal")).toBeLessThan(p.text.indexOf("get_sales"));
  });

  test("signatures", () => {
    expect(signature(lib.get("Chart")!)).toBe("Chart(data:data, type:bar|hbar|line|area|pie|donut|scatter, x:str, y:str, bind:$var, zoom)");
    expect(signature(lib.get("Header")!)).toBe("Header(title, subtitle?)");
    expect(signature(lib.get("Page")!)).toBe("Page(...Block, gap:none|xs|sm|md|lg|xl)");
    expect(signature(lib.get("Input")!)).toBe("Input(name, label, type:text|email|number|password|url, min:num, bind:$var, required)");
  });

  test("unions are written once", () => {
    const p = generatePrompt(lib).text;
    expect(p.match(/Block = /g)).toHaveLength(1);
  });

  test("an enum used by several props is declared once as a named type", () => {
    const p = generatePrompt(lib).text;
    expect(p).toContain("Gap = none|xs|sm|md|lg|xl");
    expect(p).toContain("Row(...children, gap:Gap,");
    expect(p.match(/none\|xs\|sm\|md\|lg\|xl/g)).toHaveLength(1);
    // A list used once stays inline.
    expect(p).toContain("type:bar|hbar|line|area|pie|donut|scatter");
  });

  test("modes", () => {
    expect(generatePrompt(lib, { mode: "edit" }).text).toContain("Change one prop: `id.prop = value`");
    const inline = generatePrompt(lib, { mode: "inline" }).text;
    expect(inline).toContain("```gistui");
    expect(inline).not.toContain("no code fences");
  });

  test("groups filter the catalog", () => {
    const p = generatePrompt(lib, { groups: ["Charts"] }).text;
    expect(p).toContain("Chart(");
    expect(p).not.toContain("Button(");
  });

  test("progressive mode lists names only and offers gistui_docs", () => {
    const p = generatePrompt(lib, { progressive: true }).text;
    expect(p).toContain("gistui_docs(name)");
    expect(p).not.toContain("type:bar|hbar");
    expect(componentDocs(lib, "chart")).toStartWith("Chart(data:data");
  });

  test("examples", () => {
    expect(generatePrompt(lib, { examples: ["root = Text(\"hi\")"] }).text).toContain('Example:\nroot = Text("hi")');
    expect(generatePrompt(lib, { examples: "none", libraryExamples: ["root = X()"] }).text).not.toContain("Example:");
    expect(generatePrompt(lib, { examples: "one", libraryExamples: ["root = A()", "root = B()"] }).text).toContain("root = A()");
  });

  test("budget: the fixture library prompt stays under 800 estimated tokens", () => {
    // The plan's gate is ≤ 2.5k real tokens for the 70-component benchmark catalog (Phase 3).
    // Raised from 800 after the live benchmarks: the "only what is printed" and "leave optional props
    // out" rules and the final check target the commonest live failures.
    expect(estimateTokens(generatePrompt(lib, { tools }).text)).toBeLessThan(900);
  });
});
