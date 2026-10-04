/**
 * One page for both renderers. ?lib=gistui|openui loads only that renderer (and its CSS); ?screen= picks
 * the program. window.__run(chunk, intervalMs) streams it: the text grows by `chunk` characters every
 * `intervalMs`, on a fixed clock, so a busy page receives several chunks at once (as from a network
 * buffer) instead of slowing the stream down. The page records what it can measure itself; the runner
 * adds main-thread time from the browser.
 */
import { useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

type ViewProps = { text: string; streaming: boolean };
const screens = import.meta.glob("../screens/*.{oui,gistui}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const q = new URLSearchParams(location.search);
const lib = q.get("lib") === "openui" ? "openui" : "gistui";
const screen = q.get("screen") ?? "dashboard";
const source = screens[`../screens/${screen}.${lib === "openui" ? "oui" : "gistui"}`];
if (!source) throw new Error(`no screen ${screen}`);

const B = {
  lib, screen, chars: source.length,
  t0: 0, tEnd: 0, firstContent: 0, lastMutation: 0, domBatches: 0,
  updates: 0, frames: [] as number[], longTasks: [] as { start: number; duration: number }[], errors: [] as string[],
};
(window as any).__bench = B;
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) B.longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
} catch {}
window.addEventListener("error", (e) => B.errors.push(String(e.message)));

let push: (s: ViewProps) => void = () => {};
function App({ View }: { View: ComponentType<ViewProps> }) {
  const [s, set] = useState<ViewProps>({ text: "", streaming: true });
  push = set;
  return <View text={s.text} streaming={s.streaming} />;
}

const out = document.createElement("div");
out.id = "out";
document.getElementById("root")!.append(out);

new MutationObserver(() => {
  if (!B.t0) return;
  const now = performance.now();
  B.domBatches++;
  B.lastMutation = now;
  if (!B.firstContent && (out.textContent ?? "").trim().length > 0) B.firstContent = now;
}).observe(out, { subtree: true, childList: true, characterData: true, attributes: true });

const mod = lib === "openui" ? await import("./openui") : await import("./gistui");
createRoot(out).render(<App View={mod.View} />);

(window as any).__run = (chunk: number, interval: number) => {
  const total = Math.ceil(source.length / chunk);
  B.t0 = performance.now();
  let sent = 0;
  let last = B.t0;
  const frame = (t: number) => {
    B.frames.push(t - last);
    last = t;
    if (!B.tEnd || t - B.lastMutation < 1000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const tick = () => {
    const due = Math.min(total, Math.floor((performance.now() - B.t0) / interval) + 1);
    if (due > sent) {
      sent = due;
      B.updates++;
      push({ text: source.slice(0, sent * chunk), streaming: sent < total });
      if (sent === total) {
        B.tEnd = performance.now();
        return;
      }
    }
    setTimeout(tick, Math.max(0, B.t0 + sent * interval - performance.now()));
  };
  tick();
};
(window as any).__ready = true;
