/**
 * Behaviour check page (tests/visual/shadcn.spec.ts): the demo program rendered with GistUI's
 * built-in components (`?ui=builtin`) or with shadcn/ui (`?ui=shadcn`); actions are collected on
 * `window.__actions` so the test can compare what each submits.
 */
import "@gistui/styles/styles.css";
import "./index.css";
import { GistUI, type GistUIAction } from "@gistui/react";
import { preloadAll, ui } from "@gistui/react/ui";
import { createRoot } from "react-dom/client";
import { shadcnTokens, shadcnUI } from "./gistui-shadcn";
import { PROGRAM } from "./program";

declare global {
  interface Window {
    __actions: GistUIAction[];
    __ready?: boolean;
  }
}

window.__actions = [];
const shadcn = new URLSearchParams(location.search).get("ui") === "shadcn";
document.body.style.cssText = "margin:0;padding:24px;max-width:720px";
await preloadAll();
createRoot(document.getElementById("root")!).render(
  <GistUI library={shadcn ? shadcnUI : ui} tokens={shadcn ? shadcnTokens : undefined} source={PROGRAM} onAction={(a) => window.__actions.push(a)} />,
);
requestAnimationFrame(() => requestAnimationFrame(() => (window.__ready = true)));
