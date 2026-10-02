import { describe, expect, test } from "bun:test";
import { color, designStyle, gradient } from "../src/design";

const css = (input: Record<string, unknown>) => designStyle(input).style;

describe("design layer: a program cannot paint outside its container (S5)", () => {
  test("the page-covering frame is reduced to a bounded box", () => {
    const style = css({ pos: "absolute", inset: -4000, w: 4000, h: 4000, z: 50, fill: "bg" });
    expect(style).toEqual({ position: "absolute", inset: "0px", width: "2000px", height: "2000px", zIndex: 10, background: "var(--gistui-bg)" });
  });

  test("offsets are never negative", () => {
    expect(css({ x: -40, y: -8, right: -12, bottom: "-3rem", inset: "-10%" })).toEqual({ left: "0px", top: "0px", right: "0px", bottom: "0rem", inset: "0%" });
    expect(css({ x: 12, y: "50%", right: "2rem", bottom: 0, inset: 4 })).toEqual({ left: "12px", top: "50%", right: "2rem", bottom: "0px", inset: "4px" });
  });

  test("viewport units are dropped; the other units stay", () => {
    expect(css({ w: "9999vw", h: "100vh", minW: "50vw", maxH: "80vh" })).toEqual({});
    expect(css({ w: "50%", h: "12rem", minW: "20ch", maxW: "30em", minH: "240px", gap: "1.5rem" })).toEqual({ width: "50%", height: "12rem", minWidth: "20ch", maxWidth: "30em", minHeight: "240px", gap: "1.5rem" });
    expect(css({ layout: "grid", cols: "1fr 2fr 240px" }).gridTemplateColumns).toBe("1fr 2fr 240px");
  });

  test("lengths are capped: 2000px, 200rem", () => {
    expect(css({ w: 99999, h: "9999px", maxW: "9999rem", minH: "500em", gap: 5000, pad: [3000, "999rem"] })).toEqual({ width: "2000px", height: "2000px", maxWidth: "200rem", minHeight: "200em", gap: "2000px", padding: "2000px 200rem" });
    expect(css({ w: "9999%", h: "999ch" })).toEqual({ width: "200%", height: "200ch" });
    expect(css({ w: 640, h: "100%", pad: [8, 16], gap: 12 })).toEqual({ width: "640px", height: "100%", padding: "8px 16px", gap: "12px" });
  });

  test("z-index is capped at 10", () => {
    expect(css({ z: 999 }).zIndex).toBe(10);
    expect(css({ z: 3 }).zIndex).toBe(3);
    expect(css({ z: -5 }).zIndex).toBe(0);
  });

  test("never fixed to the page", () => {
    expect(css({ pos: "fixed" })).toEqual({});
    expect(css({ pos: "sticky" })).toEqual({ position: "sticky" });
  });
});

describe("design layer: gradients", () => {
  test("colour functions with spaces after the commas are accepted", () => {
    expect(gradient("linear(90deg, rgb(255, 0, 0), accent)")).toBe("linear-gradient(90deg, rgb(255, 0, 0), var(--gistui-accent))");
    expect(gradient("linear(90deg, rgba(255, 0, 0, 0.5) 20%, hsl(210 50% 40%) 80%)")).toBe("linear-gradient(90deg, rgba(255, 0, 0, 0.5) 20%, hsl(210 50% 40%) 80%)");
    expect(css({ fill: "linear(to right, rgb(0, 0, 0), rgb(255, 255, 255))" }).background).toBe("linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))");
  });

  test("what worked before still works; unsafe parts are still dropped", () => {
    expect(gradient("linear(135deg, accent, chart-2 80%)")).toBe("linear-gradient(135deg, var(--gistui-accent), var(--gistui-chart-2) 80%)");
    expect(gradient("radial(circle at 30% 20%, accent/30, transparent)")).toBe("radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--gistui-accent) 30%, transparent), transparent)");
    expect(gradient("linear(135deg, url(javascript:x), accent)")).toBeUndefined();
    expect(gradient("linear(135deg, rgb(url(x), 0, 0), accent)")).toBeUndefined();
    expect(gradient("linear(135deg, rgb(0, 0, 0);x, accent)")).toBeUndefined();
    expect(gradient("linear(135deg, accent)")).toBeUndefined();
    expect(color("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });
});
