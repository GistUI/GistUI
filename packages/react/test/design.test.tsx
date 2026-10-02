import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { GistUI } from "../src/index";
import { ui } from "../src/ui";
import { preloadDesign } from "../src/design";
import { color, designStyle, gradient } from "@gistui/headless/design";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("design layer: values", () => {
  test("colours: theme names with opacity, hex, colour functions; anything else is dropped", () => {
    expect(color("accent")).toBe("var(--gistui-accent)");
    expect(color("accent/15")).toBe("color-mix(in srgb, var(--gistui-accent) 15%, transparent)");
    expect(color("#0af")).toBe("#0af");
    expect(color("oklch(0.7 0.1 250)")).toBe("oklch(0.7 0.1 250)");
    for (const bad of ["red;background:url(x)", "rgb(0 0 0);}", "var(--x)", "rgb(url(x))", "expression(alert(1))", "nope", "rgb(1,2,3)<"]) expect(color(bad)).toBeUndefined();
  });

  test("gradients are rebuilt from validated parts", () => {
    expect(gradient("linear(135deg, accent, chart-2 80%)")).toBe("linear-gradient(135deg, var(--gistui-accent), var(--gistui-chart-2) 80%)");
    expect(gradient("radial(circle at 30% 20%, accent/30, transparent)")).toBe("radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--gistui-accent) 30%, transparent), transparent)");
    expect(gradient("linear(135deg, url(javascript:x), accent)")).toBeUndefined();
    expect(gradient("linear(135deg, accent)")).toBeUndefined();
  });

  test("keys map to CSS; unknown keys and unsafe values vanish; images only through safe URLs", () => {
    const { style, attrs } = designStyle({
      layout: "row",
      gap: 12,
      pad: [8, 16],
      align: "center",
      w: "fill",
      maxW: 640,
      fill: "surface",
      stroke: "border",
      radius: "lg",
      shadow: "md",
      size: 18,
      weight: "semibold",
      color: "muted",
      upper: true,
      pos: "absolute",
      x: 12,
      z: 999,
      hover: "lift",
      position: "fixed",
      onClick: "alert(1)",
      image: "javascript:alert(1)",
      behavior: "url(x.htc)",
    });
    expect(style).toMatchObject({
      display: "flex",
      flexDirection: "row",
      gap: "12px",
      padding: "8px 16px",
      alignItems: "center",
      flex: "1 1 0",
      maxWidth: "640px",
      background: "var(--gistui-surface)",
      border: "1px solid var(--gistui-border)",
      borderRadius: "var(--gistui-radius-lg)",
      fontSize: "18px",
      fontWeight: 600,
      color: "var(--gistui-fg-muted)",
      textTransform: "uppercase",
      position: "absolute",
      left: "12px",
      zIndex: 10,
    });
    expect(attrs).toEqual({ "data-hover": "lift" });
    expect(JSON.stringify(style)).not.toMatch(/javascript|url\(x|fixed|alert/);
    expect(designStyle({ image: "https://example.com/a.jpg", fill: "sunk" }).style).toMatchObject({ background: 'url("https://example.com/a.jpg") center / cover no-repeat', backgroundColor: "var(--gistui-surface-sunk)" });
  });
});

describe("design layer: rendering", () => {
  test("Frame and style:{…} on components; classNames per component type", async () => {
    await preloadDesign();
    const src = `root = Frame(Card(Text("Hi", style:{size:20, color:"accent"}), style:{radius:24, hover:"lift"}), style:{layout:"row", gap:8, fill:"accent/10"})\n`;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<GistUI library={ui} source={src} classNames={{ Card: "my-card", Frame: "my-frame" }} />));
    const frame = host.querySelector<HTMLElement>('[data-gistui="Frame"]')!;
    expect(frame.className).toBe("gistui-frame my-frame");
    expect(frame.style.display).toBe("flex");
    expect(frame.style.gap).toBe("8px");
    const card = host.querySelector<HTMLElement>(".gistui-card")!;
    expect(card.className).toContain("my-card");
    expect(card.style.borderRadius).toBe("24px");
    expect(card.getAttribute("data-hover")).toBe("lift");
    const text = host.querySelector<HTMLElement>(".gistui-text")!;
    expect(text.style.fontSize).toBe("20px");
    act(() => root.unmount());
  });
});
