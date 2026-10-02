import { GistUI, type GistUIAction } from "@gistui/solid";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { MyCard } from "./MyCard";
import { samples } from "./samples";

export function App() {
  const [pick, setPick] = createSignal<keyof typeof samples>("dashboard");
  const [source, setSource] = createSignal(samples.dashboard);
  const [streaming, setStreaming] = createSignal(false);
  const [ownCard, setOwnCard] = createSignal(false);
  const [actions, setActions] = createSignal<GistUIAction[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  // Replays the program in small chunks, the way a model streams it.
  const stream = () => {
    clearInterval(timer);
    const full = samples[pick()];
    let at = 0;
    setSource("");
    setStreaming(true);
    timer = setInterval(() => {
      at = Math.min(full.length, at + 24);
      setSource(full.slice(0, at));
      if (at === full.length) {
        clearInterval(timer);
        setStreaming(false);
      }
    }, 16);
  };
  onCleanup(() => clearInterval(timer));

  return (
    <main style={{ "max-width": "1100px", margin: "0 auto", padding: "16px", display: "grid", gap: "16px", "font-family": "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: "12px", "align-items": "center", "flex-wrap": "wrap" }}>
        <strong>GistUI + Solid</strong>
        <select
          value={pick()}
          onChange={(e) => {
            setPick(e.currentTarget.value as keyof typeof samples);
            stream();
          }}
        >
          <option value="dashboard">Dashboard</option>
          <option value="form">Form</option>
        </select>
        <button type="button" onClick={stream}>
          Stream again
        </button>
        <label>
          <input type="checkbox" checked={ownCard()} onChange={(e) => setOwnCard(e.currentTarget.checked)} /> Use my Card
        </label>
      </header>
      <GistUI source={source()} streaming={streaming()} components={ownCard() ? { Card: MyCard } : undefined} onAction={(a) => setActions((xs) => [a, ...xs])} />
      <Show when={actions().length}>
        <pre style={{ "font-size": "12px", background: "#f4f4f5", padding: "12px", "border-radius": "8px", overflow: "auto" }}>
          <For each={actions()}>{(a) => `${JSON.stringify(a)}\n`}</For>
        </pre>
      </Show>
    </main>
  );
}
