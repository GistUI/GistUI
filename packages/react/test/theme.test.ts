import { expect, test } from "bun:test";
import { defineTheme, themeCss, tokenDeclarations } from "@gistui/headless/theme";

test("tokens map to --gistui-* variables", () => {
  const t = defineTheme({ primary: "#0f766e", primaryFg: "#fff", radius: 14, density: 0.9, chart: ["#111", "#222"], "--gistui-shadow-lg": "none" });
  const d = tokenDeclarations(t);
  expect(d).toContain("--gistui-primary:#0f766e");
  expect(d).toContain("--gistui-primary-fg:#fff");
  expect(d).toContain("--gistui-rounding:1.4");
  expect(d).toContain("--gistui-density:0.9");
  expect(d).toContain("--gistui-chart-2:#222");
  expect(d).toContain("--gistui-shadow-lg:none");
});

test("values cannot break out of the declaration block", () => {
  const css = themeCss("s1", { primary: "red;}body{display:none" });
  expect(css).not.toContain("}body{");
  expect(css.startsWith('.gistui[data-gistui-scope="s1"]{')).toBe(true);
});

test("dark tokens apply to dark and to system-dark", () => {
  const css = themeCss("s2", undefined, { primary: "#fff" });
  expect(css).toContain('[data-gistui-theme="dark"]{--gistui-primary:#fff}');
  expect(css).toContain("@media (prefers-color-scheme: dark)");
});
