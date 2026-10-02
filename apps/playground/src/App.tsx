import { estimateTokens, type GistUIError, type Patch } from "@gistui/core";
import { GistUI, type GistUIAction } from "@gistui/react";
import { IconSvg, ui } from "@gistui/react/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES, type Example } from "./examples";
import { demoMutations, demoTools } from "./tools";
import "@gistui/react/prompt";
import { expressive } from "@gistui/react";

type Mode = "light" | "dark" | "system";
type View = "preview" | "code";
type Device = "desktop" | "tablet" | "mobile";
type Panel = "errors" | "actions" | "prompt" | "stats";

const SPEEDS = { "30 tok/s": 30, "60 tok/s": 60, "300 tok/s": 300, Instant: 0 } as const;
type Speed = keyof typeof SPEEDS;

const COLORS: { id: string; swatch: string }[] = [
  { id: "auto", swatch: "conic-gradient(#e11d48, #f59e0b, #16a34a, #0d9488, #2563eb, #7c3aed, #e11d48)" },
  { id: "neutral", swatch: "#18181b" },
  { id: "slate", swatch: "#334155" },
  { id: "stone", swatch: "#57534e" },
  { id: "rose", swatch: "#e11d48" },
  { id: "pink", swatch: "#db2777" },
  { id: "violet", swatch: "#7c3aed" },
  { id: "indigo", swatch: "#4f46e5" },
  { id: "blue", swatch: "#2563eb" },
  { id: "teal", swatch: "#0d9488" },
  { id: "green", swatch: "#16a34a" },
  { id: "orange", swatch: "#ea580c" },
  { id: "amber", swatch: "#f59e0b" },
  { id: "red", swatch: "#dc2626" },
];

const GROUPS = ["Showcase", "Dashboards", "Guides", "Reports", "Presentations", "Forms", "Content", "Playground"] as const;

function load<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function systemDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function App() {
  const [active, setActive] = useState<Example>(() => EXAMPLES.find((e) => e.id === load("pg-example", "weather")) ?? EXAMPLES[0]!);
  const [source, setSource] = useState(active.source);
  const [shown, setShown] = useState(active.source);
  const [streaming, setStreaming] = useState(false);
  const [speed, setSpeed] = useState<Speed>("60 tok/s");
  const [mode, setMode] = useState<Mode>(() => load<Mode>("pg-mode", "system"));
  // Minimal (the default look) or expressive (gradient and glow effects, all theme tokens).
  const [look, setLook] = useState<"minimal" | "expressive">(() => load("pg-look", "minimal"));
  useEffect(() => save("pg-look", look), [look]);
  const [color, setColor] = useState<string>(() => load<string>("pg-color", "auto"));
  const [view, setView] = useState<View>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [panel, setPanel] = useState<Panel>("errors");
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<GistUIError[]>([]);
  const [actions, setActions] = useState<GistUIAction[]>([]);
  const [copied, setCopied] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dark, setDark] = useState(() => (mode === "system" ? systemDark() : mode === "dark"));
  const stats = useRef({ renders: 0, flushes: 0, start: 0, firstRender: 0 });
  const [statsView, setStatsView] = useState(stats.current);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    save("pg-mode", mode);
    const update = () => setDark(mode === "system" ? systemDark() : mode === "dark");
    update();
    if (mode !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [mode]);
  useEffect(() => save("pg-color", color), [color]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const stop = () => {
    if (timer.current !== null) cancelAnimationFrame(timer.current);
    timer.current = null;
  };

  const stream = useCallback(
    (src: string = source) => {
      stop();
      setView("preview");
      stats.current = { renders: 0, flushes: 0, start: performance.now(), firstRender: 0 };
      const tps = SPEEDS[speed];
      if (!tps) {
        setShown(src);
        setStreaming(false);
        return;
      }
      // ~4 characters per token.
      const cps = tps * 4;
      let t0 = performance.now();
      let pos = 0;
      setShown("");
      setStreaming(true);
      const tick = (now: number) => {
        pos = Math.min(src.length, pos + ((now - t0) / 1000) * cps);
        t0 = now;
        setShown(src.slice(0, Math.floor(pos)));
        if (pos >= src.length) {
          timer.current = null;
          setStreaming(false);
          return;
        }
        timer.current = requestAnimationFrame(tick);
      };
      timer.current = requestAnimationFrame(tick);
    },
    [source, speed],
  );

  useEffect(() => stop, []);

  // Editing renders instantly.
  const edit = (next: string) => {
    stop();
    setSource(next);
    setShown(next);
    setStreaming(false);
  };

  const stageRef = useRef<HTMLElement>(null);
  const pick = (ex: Example) => {
    stageRef.current?.scrollTo({ top: 0 });
    setDrawer(false);
    setActive(ex);
    save("pg-example", ex.id);
    setActions([]);
    edit(ex.source);
  };

  const devtools = useMemo(
    () => ({
      onNodeRender: () => {
        stats.current.renders++;
      },
      onFlush: (patches: readonly Patch[]) => {
        stats.current.flushes++;
        if (!stats.current.firstRender && patches.some((p) => p.op === "root") && stats.current.start) {
          stats.current.firstRender = performance.now() - stats.current.start;
        }
      },
    }),
    [],
  );

  useEffect(() => {
    const id = setInterval(() => setStatsView({ ...stats.current }), 250);
    return () => clearInterval(id);
  }, []);

  const prompt = useMemo(() => ui.prompt().text, []);
  const tokens = estimateTokens(source);
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const q = filter.trim().toLowerCase();
  const list = EXAMPLES.filter((e) => !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  // Theme, mode and speed: inline in the desktop bar, in the Customize sheet on phones.
  const colorsEl = (
      <div className="pg-colors" role="radiogroup" aria-label="Colour theme">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={color === c.id}
            title={c.id === "auto" ? "Auto: the example's own accent" : c.id}
            className="pg-swatch"
            style={{ background: c.swatch }}
            onClick={() => setColor(c.id)}
          />
        ))}
      </div>
  );
  const modeEl = (
      <div className="pg-seg pg-seg-sm" aria-label="Mode">
        {(["light", "dark", "system"] as Mode[]).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} title={m}>
            <IconSvg name={m === "light" ? "sun" : m === "dark" ? "moon" : "settings"} />
            <span className="pg-sheet-only">{m}</span>
          </button>
        ))}
      </div>
  );
  const lookEl = (
      <div className="pg-seg pg-seg-sm" aria-label="Style">
        {(["minimal", "expressive"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={look === l} onClick={() => setLook(l)} title={l === "minimal" ? "Minimal (default)" : "Expressive effects"}>
            <IconSvg name={l === "minimal" ? "minus" : "sparkles"} />
            <span className="pg-sheet-only">{l}</span>
          </button>
        ))}
      </div>
  );
  const speedEl = (
      <select className="pg-select" value={speed} onChange={(e) => setSpeed(e.target.value as Speed)} aria-label="Stream speed">
        {Object.keys(SPEEDS).map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
  );

  return (
    <div className="pg" data-drawer={drawer || undefined} data-sheet={sheet || undefined}>
      <div
        className="pg-scrim"
        onClick={() => {
          setDrawer(false);
          setSheet(false);
        }}
        aria-hidden
      />
      <aside className="pg-sheet" aria-label="Customize" aria-hidden={!sheet} inert={!sheet || undefined}>
        <div className="pg-sheet-head">
          <strong>Customize</strong>
          <button type="button" className="pg-icon" aria-label="Close" onClick={() => setSheet(false)}>
            <IconSvg name="x" />
          </button>
        </div>
        <div className="pg-sheet-body">
          <section>
            <h3>Colour theme</h3>
            {colorsEl}
          </section>
          <section>
            <h3>Appearance</h3>
            {modeEl}
          </section>
          <section>
            <h3>Style</h3>
            {lookEl}
          </section>
          <section>
            <h3>Stream speed</h3>
            {speedEl}
          </section>
        </div>
      </aside>
      <aside className="pg-side" aria-label="Examples">
        <div className="pg-brand">
          <span className="pg-logo" aria-hidden>
            <IconSvg name="sparkles" />
          </span>
          <div>
            <strong>GistUI</strong>
            <span>Playground</span>
          </div>
        </div>
        <label className="pg-search">
          <IconSvg name="search" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search examples" aria-label="Search examples" />
        </label>
        <nav className="pg-nav" aria-label="Examples">
          {GROUPS.map((g) => {
            const items = list.filter((e) => e.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="pg-group">
                <div className="pg-group-title">{g}</div>
                {items.map((e) => (
                  <button key={e.id} type="button" className="pg-item" aria-current={e.id === active.id || undefined} onClick={() => pick(e)} title={e.description}>
                    <IconSvg name={e.icon} />
                    <span>{e.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="pg-side-foot">
          <div className="pg-foot-row">
            <span>System prompt</span>
            <b>≈{estimateTokens(prompt).toLocaleString()} tok</b>
          </div>
          <div className="pg-foot-row">
            <span>This screen</span>
            <b>≈{tokens.toLocaleString()} tok</b>
          </div>
        </div>
      </aside>

      <main className="pg-main">
        <header className="pg-bar">
          <div className="pg-appbar">
            <button type="button" className="pg-icon" aria-label="Open examples" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <IconSvg name="menu" />
            </button>
            <span className="pg-appbar-brand">
              <span className="pg-logo" aria-hidden>
                <IconSvg name="sparkles" />
              </span>
              GistUI
            </span>
            <span className="pg-spacer" />
            <button type="button" className="pg-customize" aria-expanded={sheet} onClick={() => setSheet(true)}>
              <IconSvg name="palette" />
              Customize
            </button>
          </div>
          <div className="pg-seg" role="tablist" aria-label="View">
            {(["preview", "code"] as View[]).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                <IconSvg name={v === "preview" ? "eye" : "code"} />
                {v === "preview" ? "Preview" : "Code"}
              </button>
            ))}
          </div>
          {view === "preview" && (
            <div className="pg-seg pg-seg-sm" aria-label="Device">
              {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} title={d}>
                  {d[0]!.toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          )}
          <span className="pg-spacer" />
          <div className="pg-controls">
            {colorsEl}
            {modeEl}
            {lookEl}
            {speedEl}
          </div>
          <button type="button" className="pg-primary" onClick={() => stream()}>
            <IconSvg name={streaming ? "arrow-left" : "zap"} />
            {streaming ? "Restart" : "Stream"}
          </button>
        </header>

        <div className="pg-titlebar">
          <div>
            <h1>{active.title}</h1>
            <p>{active.description}</p>
          </div>
          <div className="pg-chips">
            <span className="pg-chip">
              <IconSvg name="zap" />
              {statsView.firstRender ? `${statsView.firstRender.toFixed(0)} ms first render` : "stream to measure"}
            </span>
            <span className="pg-chip" data-bad={errorCount > 0 || undefined}>
              <IconSvg name={errorCount ? "alert-circle" : "check-circle"} />
              {errorCount ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : errors.length ? `${errors.length} repaired` : "valid"}
            </span>
          </div>
        </div>

        <section className="pg-stage" ref={stageRef} hidden={view !== "preview"}>
          <div className="pg-frame" data-device={device}>
            <GistUI
              library={ui}
              source={shown}
              streaming={streaming}
              theme={dark ? "dark" : "light"}
              color={color === "auto" ? undefined : color}
              className="pg-preview"
              onError={setErrors}
              onAction={(a) => setActions((xs) => [a, ...xs].slice(0, 50))}
              tools={demoTools}
              mutations={demoMutations}
              favicons
              tokens={look === "expressive" ? expressive : undefined}
              devtools={devtools}
            />
          </div>
        </section>

        <section className="pg-code" hidden={view !== "code"}>
          <div className="pg-editor-wrap">
            <div className="pg-editor-bar">
              <span>
                <IconSvg name="file-text" /> {active.id}.gistui
              </span>
              <span className="pg-spacer" />
              <span className="pg-muted">
                {source.length.toLocaleString()} chars · ≈{tokens.toLocaleString()} tokens
              </span>
              <button type="button" className="pg-ghost" onClick={copy}>
                <IconSvg name={copied ? "check" : "layers"} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <textarea className="pg-editor" spellCheck={false} value={source} onChange={(e) => edit(e.target.value)} aria-label="GistUI source" />
          </div>
          <div className="pg-panel">
            <nav className="pg-tabs">
              {(["errors", "actions", "prompt", "stats"] as Panel[]).map((p) => (
                <button key={p} type="button" data-active={panel === p || undefined} onClick={() => setPanel(p)}>
                  {p === "errors" ? `Diagnostics (${errors.length})` : p === "actions" ? `Actions (${actions.length})` : p[0]!.toUpperCase() + p.slice(1)}
                </button>
              ))}
            </nav>
            <div className="pg-panel-body">
              {panel === "errors" &&
                (errors.length ? (
                  <ul className="pg-list">
                    {errors.map((e, i) => (
                      <li key={i} data-severity={e.severity}>
                        <code>{e.code}</code> {e.stmtId && <b>{e.stmtId}</b>} {e.line && <span className="pg-muted">line {e.line}</span>} — {e.message}
                        {e.fixed && <span className="pg-fixed">repaired</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pg-muted">No problems. The program is valid.</p>
                ))}
              {panel === "actions" &&
                (actions.length ? (
                  <ul className="pg-list">
                    {actions.map((a, i) => (
                      <li key={i}>
                        <code>{a.type}</code>{" "}
                        {a.type === "submit" ? (
                          <pre className="pg-json">{JSON.stringify({ ...a, type: undefined }, null, 2)}</pre>
                        ) : (
                          JSON.stringify({ ...a, type: undefined, steps: undefined })
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pg-muted">Click a button, a follow-up or a chart point in the preview.</p>
                ))}
              {panel === "prompt" && (
                <>
                  <p className="pg-muted">System prompt for the default library: ≈{estimateTokens(prompt)} tokens.</p>
                  <pre className="pg-pre">{prompt}</pre>
                </>
              )}
              {panel === "stats" && (
                <dl className="pg-stats">
                  <dt>Source</dt>
                  <dd>
                    {source.length.toLocaleString()} chars, ≈{tokens} tokens
                  </dd>
                  <dt>Time to first render</dt>
                  <dd>{statsView.firstRender ? `${statsView.firstRender.toFixed(0)} ms after stream start` : "—"}</dd>
                  <dt>Flushes</dt>
                  <dd>{statsView.flushes}</dd>
                  <dt>Node renders</dt>
                  <dd>{statsView.renders}</dd>
                </dl>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
