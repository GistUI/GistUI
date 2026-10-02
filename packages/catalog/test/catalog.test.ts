import { describe, expect, test } from "bun:test";
import { estimateTokens, generatePrompt, parse } from "@gistui/core";
import { components, examples, guide, library, unions } from "../src/index";

describe("catalog", () => {
  test("every union member is a component", () => {
    for (const name of Object.values(unions).flat()) expect(library.get(name)).toBeDefined();
  });

  test("the canonical example is valid", () => {
    for (const ex of examples) {
      const r = parse(ex, library);
      expect(r.errors).toEqual([]);
      expect(r.valid).toEqual({ strict: true, lenient: true });
    }
  });

  test("component names are unique", () => {
    expect(new Set(components.map((c) => c.name)).size).toBe(components.length);
  });

  test("prompt with the example stays within budget", () => {
    // What apps send (ui.prompt()): syntax card, signatures, design guide and one example: about 70
    // components with runtime syntax, ≈3.6k real (o200k) tokens; OpenUI's chat library prompt is 11.3k.
    // The estimate (chars / 4) runs lower than real tokens; this limit catches growth.
    const p = generatePrompt(library, { examples: "one", libraryExamples: examples, libraryGuide: guide });
    // Raised from 3,300 after the first live benchmark (2026-09-30): the "only what is printed" rule
    // and the final check cost ~100 tokens and target the commonest live failures.
    expect(estimateTokens(p.text)).toBeLessThan(3450);
  });
});

describe("agent skill", () => {
  test("skills/gistui/reference.md matches the generated prompt (run `bun run skill` to update)", async () => {
    const { skillReference } = await import("../src/skill");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const onDisk = readFileSync(join(import.meta.dir, "../../../skills/gistui/reference.md"), "utf8");
    expect(onDisk).toBe(skillReference());
  });

  test("render.ts (the catalog for browsers) is generated from index.ts and in sync", async () => {
    const { readFileSync } = await import("node:fs");
    const { renderCatalogSource } = await import("../src/render-gen");
    expect(readFileSync(new URL("../src/render.ts", import.meta.url), "utf8")).toBe(renderCatalogSource());
    const lean = await import("../src/render");
    // Same components and signatures, minus prompt text.
    expect(lean.components.map((c) => c.name)).toEqual(components.map((c) => c.name));
    expect(JSON.stringify(lean.components)).not.toContain('"description"');
    for (const c of components) expect(lean.library.get(c.name)!.positional).toEqual(library.get(c.name)!.positional);
  });
});
