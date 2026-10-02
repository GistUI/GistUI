/**
 * Renderer parity page (used by tests/visual/parity.spec.ts): one example rendered by React
 * (`?r=react`) or by the vanilla renderer (`?r=vanilla`), with nothing else on the page.
 * Vue, Svelte and Solid have the same page in their example apps (`examples/*`).
 */
import { mount } from "@gistui/vanilla";
import { ui as domUi } from "@gistui/vanilla/ui";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";
import { createRoot } from "react-dom/client";
import { demoTools, paritySetup } from "./parity-setup";

const { example, theme, stage, ready } = paritySetup();
if (new URLSearchParams(location.search).get("r") === "vanilla") {
  mount(stage, { library: domUi, source: example.source, theme, tools: demoTools });
  ready("vanilla");
} else {
  createRoot(stage).render(<GistUI library={ui} source={example.source} theme={theme} tools={demoTools} />);
  ready("react");
}
