/**
 * Shared setup for the renderer parity pages (React here; Vue, Svelte and Solid in `examples/*`):
 * the same example, theme, page style and readiness signal everywhere, so only the renderer differs.
 *   /parity.html?ex=saas&theme=dark
 */
import "@gistui/styles/styles.css";
import { EXAMPLES, type Example } from "./examples";
export { demoTools } from "./tools";

declare global {
  interface Window {
    __parityReady?: boolean;
  }
}

export interface ParityPage {
  example: Example;
  theme: "light" | "dark";
  stage: HTMLElement;
  /** Call once the framework has mounted GistUI: marks the page with its renderer and signals ready. */
  ready(renderer: string): void;
}

export function paritySetup(): ParityPage {
  const q = new URLSearchParams(location.search);
  const example = EXAMPLES.find((e) => e.id === q.get("ex")) ?? EXAMPLES[0]!;
  const theme = q.get("theme") === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.body.style.cssText = `margin:0;padding:16px;background:${theme === "dark" ? "#0b0b0c" : "#fff"}`;
  const stage = document.getElementById("stage")!;
  return {
    example,
    theme,
    stage,
    ready(renderer) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          stage.dataset.renderer = renderer;
          // React's tree carries fibers on its elements; the others' does not. Proves which one ran.
          stage.dataset.reactOwned = String(Object.keys(stage.querySelector(".gistui") ?? {}).some((k) => k.startsWith("__react")));
          stage.dataset.mounted = String(stage.querySelector(".gistui") !== null);
          window.__parityReady = true;
        }),
      );
    },
  };
}
