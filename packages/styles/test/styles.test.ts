import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");

test("`hidden` wins over component display rules (inactive tab panels, closed accordion items)", () => {
  // Components set `display: flex` on panels; without this rule every tab panel would stay visible.
  expect(css).toMatch(/\.gistui \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test("everything is inside @layer gistui, so user CSS wins without !important", () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  // Only the layer order comes first: above Tailwind's reset (base), below its utilities.
  expect(withoutComments.startsWith("@layer theme, base, gistui, components, utilities;\n\n@layer gistui {")).toBe(true);
  expect(withoutComments.endsWith("}")).toBe(true);
});
