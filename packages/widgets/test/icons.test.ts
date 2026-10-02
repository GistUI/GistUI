import { expect, test } from "bun:test";
import { iconNames, iconPath, isGlyph, resolveIcon } from "../src/icons";

test("every icon compiles to path data that starts with an absolute moveto per part", () => {
  for (const n of iconNames) {
    const d = iconPath(n)!;
    expect(d.length).toBeGreaterThan(5);
    expect(d[0]).toBe("M");
    // A relative moveto right after a closepath would be measured from the subpath start.
    expect(d).not.toMatch(/Z\s*m(?!0 0)/); // `Zm0 0` (continue from the subpath start) is intentional
  }
});

test("aliases, case and glyphs", () => {
  expect(resolveIcon("Money")).toBe("dollar");
  expect(resolveIcon("trending up")).toBe("trending-up");
  expect(resolveIcon("nope")).toBeUndefined();
  expect(isGlyph("🍣")).toBe(true);
  expect(isGlyph("nope")).toBe(false);
});

test("a relative moveto keeps its implicit line-tos relative", () => {
  // search: the handle must go from (21,21) up-left by 4.3, not to (-4.3,-4.3).
  expect(iconPath("search")).toContain("M21 21l-4.3-4.3");
});
