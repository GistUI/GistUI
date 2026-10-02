import { GistUI, type GistUIAction } from "@gistui/react";
import { ui } from "@gistui/react/ui";
import { useEffect, useRef, useState } from "react";
import { shadcnTokens, shadcnUI } from "./gistui-shadcn";
import { PROGRAM } from "./program";

export function App() {
  const [shadcn, setShadcn] = useState(true);
  const [source, setSource] = useState(PROGRAM);
  const [streaming, setStreaming] = useState(false);
  const [actions, setActions] = useState<GistUIAction[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  // Replays the program in small chunks, the way a model streams it.
  const stream = () => {
    clearInterval(timer.current);
    let at = 0;
    setSource("");
    setStreaming(true);
    timer.current = setInterval(() => {
      at = Math.min(PROGRAM.length, at + 24);
      setSource(PROGRAM.slice(0, at));
      if (at === PROGRAM.length) {
        clearInterval(timer.current);
        setStreaming(false);
      }
    }, 16);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="flex flex-wrap items-center gap-3 text-sm">
        <strong>GistUI + shadcn/ui</strong>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shadcn} onChange={(e) => setShadcn(e.target.checked)} /> Render with shadcn/ui
        </label>
        <button type="button" className="underline" onClick={stream}>
          Stream again
        </button>
      </header>
      <GistUI library={shadcn ? shadcnUI : ui} tokens={shadcn ? shadcnTokens : undefined} source={source} streaming={streaming} onAction={(a) => setActions((xs) => [a, ...xs])} />
      {actions.length > 0 && <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{actions.map((a) => JSON.stringify(a.type === "submit" ? { type: a.type, partial: a.partial, values: a.values } : a)).join("\n")}</pre>}
    </main>
  );
}
