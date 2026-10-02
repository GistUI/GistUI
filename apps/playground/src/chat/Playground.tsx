/**
 * The examples page as a set of chats. Every example is in the sidebar on the left and has its own
 * thread: opening it asks the example's question, the reply says a sentence, and then its screen
 * streams in. A button or follow-up inside an answer sends the next message in that thread. There
 * is no message box: nothing is typed. Each answer can be seen as the rendered UI or as the GistUI program behind it.
 *
 * It uses the chat package's store and reply splitting over recorded answers (see
 * `./adapter`): no model is called.
 */

import { createChat, replyProgram, splitReply, type ChatMessage, type ChatStore } from "@gistui/chat";
import { useChat } from "@gistui/chat/react";
import { estimateTokens } from "@gistui/core";
import { GistUI, type GistUIAction } from "@gistui/react";
import { IconSvg, ui } from "@gistui/react/ui";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES } from "../examples";
import { demoMutations, demoTools } from "../tools";
import { questionFor, QUESTIONS, recorded, suggestions, TOKENS_PER_SECOND } from "./adapter";

type Theme = "light" | "dark";

const SITE = "https://gistui.com";
const GITHUB = "https://github.com/GistUI/GistUI";
const GROUPS = ["Showcase", "Dashboards", "Guides", "Reports", "Presentations", "Forms", "Content", "Playground"] as const;

const systemTheme = (): Theme => (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** The GistUI mark: four bars fading out, a stream of statements. */
function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect className="pgc-logo-square" width="32" height="32" rx="9" />
      <g className="pgc-logo-bars">
        <rect x="7" y="9" width="3" height="14" rx="1.5" />
        <rect x="12" y="9" width="3" height="14" rx="1.5" opacity=".8" />
        <rect x="17" y="9" width="3" height="14" rx="1.5" opacity=".6" />
        <rect x="22" y="9" width="3" height="14" rx="1.5" opacity=".4" />
      </g>
    </svg>
  );
}

/** One line of a program, with the statement's name picked out. */
function CodeLine({ text }: { text: string }) {
  const def = /^([$a-z][\w$-]*)(\s*=\s*)/.exec(text);
  if (!def) return <span className="pgc-line">{text + "\n"}</span>;
  return (
    <span className="pgc-line">
      <b>{def[1]}</b>
      {def[2] + text.slice(def[0].length) + "\n"}
    </span>
  );
}

interface AnswerProps {
  message: ChatMessage;
  theme: Theme;
  /** The latest answer: its UI may refresh its data on a timer. */
  live: boolean;
  onAction: (a: GistUIAction) => void;
  onRetry: () => void;
}

/** One reply: its sentence, then the screen, with a switch between the rendered UI and its program. */
const Answer = memo(function Answer({ message, theme, live, onAction, onRetry }: AnswerProps) {
  const streaming = message.status === "streaming";
  const parts = splitReply(message.content, { streaming });
  const program = replyProgram(parts);
  const hasUi = parts.some((p) => p.kind === "ui");
  // Questions to go on with, under a first screen that suggests none itself.
  const more = useMemo(() => (message.status === "done" ? suggestions(message.content) : ""), [message.status, message.content]);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [repairs, setRepairs] = useState(0);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(program).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <div className="pgc-msg" data-role="assistant" data-status={message.status}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <div key={i} className="pgc-say">
            {p.text.split("\n").map((line, j) => (line.startsWith("> ") ? <blockquote key={j}>{line.slice(2)}</blockquote> : line.trim() ? <p key={j}>{line}</p> : null))}
          </div>
        ) : null,
      )}
      {hasUi && (
        <div className="pgc-answer">
          <div className="pgc-answer-bar">
            <div className="pgc-seg" role="tablist" aria-label="View">
              {(["preview", "code"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                  <IconSvg name={v === "preview" ? "eye" : "code"} />
                  {v === "preview" ? "Preview" : "Code"}
                </button>
              ))}
            </div>
            <span className="pgc-meta">
              {streaming ? "streaming…" : `≈${estimateTokens(program).toLocaleString()} tokens`}
              {repairs > 0 && ` · ${repairs} repaired in code`}
            </span>
            {view === "code" && (
              <button type="button" className="pgc-copy" onClick={copy}>
                <IconSvg name={copied ? "check" : "layers"} />
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          {/* The UI stays mounted while the code is shown, so its state (a filled form, a chosen tab) is kept. */}
          <div hidden={view !== "preview"}>
            <GistUI
              library={ui}
              source={program}
              streaming={streaming}
              theme={theme}
              tools={demoTools}
              mutations={demoMutations}
              paused={!live}
              favicons
              className="pgc-ui"
              onAction={onAction}
              onAutofix={(r) => setRepairs(r.changes.length)}
            />
          </div>
          {view === "code" && (
            <pre className="pgc-code">
              <code>
                {program.split("\n").map((line, i) => (
                  <CodeLine key={i} text={line} />
                ))}
              </code>
            </pre>
          )}
        </div>
      )}
      {more && <GistUI library={ui} source={more} theme={theme} className="pgc-more" onAction={onAction} />}
      {streaming && parts.length === 0 && <span className="gistui-chat__typing" aria-label="Thinking" />}
      {message.status === "error" && (
        <div className="gistui-chat__error" role="alert">
          <span>{message.error ?? "Something went wrong."}</span>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
});

/** One example's thread: the messages, following the newest reply while you are at the bottom. */
function Thread({ store, theme }: { store: ChatStore; theme: Theme }) {
  const { messages } = useChat(store);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  // What a button or a form inside an answer does: it becomes the next message, marked as coming from the UI.
  const onAction = useCallback(
    (a: GistUIAction) => {
      if (a.type === "send") void store.send(a.message, { origin: "ui" });
      else if (a.type === "submit" && !a.partial) void store.send(a.message, { origin: "ui", action: "submit" });
    },
    [store],
  );
  const onRetry = useCallback(() => void store.regenerate(), [store]);
  let liveId: string | undefined;
  for (let i = messages.length - 1; i >= 0 && !liveId; i--) if (messages[i]!.role !== "user") liveId = messages[i]!.id;

  return (
    <div className="pgc-scroll" ref={scroller} onScroll={onScroll} aria-live="polite">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="pgc-msg" data-role="user">
            {m.origin === "ui" && <span className="pgc-origin">{m.action === "submit" ? "Form sent from the UI" : "Sent from the UI"}</span>}
            <div className="pgc-bubble">{m.content}</div>
          </div>
        ) : (
          <Answer key={m.id} message={m} theme={theme} live={m.id === liveId} onAction={onAction} onRetry={onRetry} />
        ),
      )}
    </div>
  );
}

/** The example named in the address (`#saas`), if there is one. */
const fromHash = (): string | null => {
  const id = typeof location === "undefined" ? "" : decodeURIComponent(location.hash.slice(1));
  return EXAMPLES.some((e) => e.id === id) ? id : null;
};

export function Playground() {
  // One chat per example, made when the example is first opened and kept while the page is open.
  const threads = useRef(new Map<string, ChatStore>());
  const [opened, setOpened] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());
  const [filter, setFilter] = useState("");
  const [drawer, setDrawer] = useState(false);

  /** Shows an example's thread. The first time, its question is asked and the answer streams in. */
  const open = useCallback((id: string) => {
    if (!threads.current.has(id)) {
      const store = createChat({ adapter: recorded });
      threads.current.set(id, store);
      void store.send(questionFor(id));
      setOpened((ids) => [...ids, id]);
    }
    setDrawer(false);
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  }, []);
  /** Asks the example's question again, from an empty thread. */
  const replay = (id: string) => {
    const store = threads.current.get(id);
    if (!store) return;
    store.stop();
    store.clear();
    void store.send(questionFor(id));
  };

  // An address with an example in it opens that example; the back button follows the address.
  useEffect(() => {
    const sync = () => {
      const id = fromHash();
      if (id) open(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [open]);

  // The page behind the chat follows the same theme; without a saved choice, the system decides.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (savedTheme() || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode */
    }
    setTheme(next);
  };

  // Examples that have no thread yet, to try next.
  const next = useMemo(() => {
    const fresh = QUESTIONS.filter((q) => !opened.includes(q.id));
    return (fresh.length ? fresh : QUESTIONS.filter((q) => q.id !== active)).slice(0, 3);
  }, [opened, active]);

  const q = filter.trim().toLowerCase();
  const list = EXAMPLES.filter((e) => !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
  const store = active ? threads.current.get(active) : undefined;
  const example = active ? EXAMPLES.find((e) => e.id === active) : undefined;

  return (
    <div className="gistui pgc" data-gistui-theme={theme} data-drawer={drawer || undefined}>
      <div className="pgc-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside className="pgc-side" aria-label="Examples">
        <a className="pgc-brand" href={SITE}>
          <Logo />
          <span>GistUI</span>
          <em>Examples</em>
        </a>
        <label className="pgc-search">
          <IconSvg name="search" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search examples" aria-label="Search examples" />
        </label>
        <nav className="pgc-nav" aria-label="Examples">
          {GROUPS.map((g) => {
            const items = list.filter((e) => e.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="pgc-group">
                <div className="pgc-group-title">{g === "Playground" ? "Live and repair" : g}</div>
                {items.map((e) => (
                  <button key={e.id} type="button" className="pgc-item" aria-current={e.id === active || undefined} data-seen={opened.includes(e.id) || undefined} onClick={() => open(e.id)} title={e.description}>
                    <IconSvg name={e.icon} />
                    <span>{e.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="pgc-main">
        <header className="pgc-head">
          <button type="button" className="pgc-icon pgc-menu" aria-label="Open the examples" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <IconSvg name="menu" />
          </button>
          {example && (
            <div className="pgc-title">
              <strong>{example.title}</strong>
              <span>{example.description}</span>
            </div>
          )}
          <span className="pgc-spacer" />
          <a className="pgc-link" href={GITHUB} rel="noreferrer">
            GitHub
          </a>
          <button type="button" className="pgc-icon" onClick={toggle} aria-label="Switch between light and dark">
            <IconSvg name={theme === "dark" ? "sun" : "moon"} />
          </button>
          {active && (
            <button type="button" className="pgc-new" onClick={() => replay(active)}>
              <IconSvg name="zap" />
              Replay
            </button>
          )}
        </header>

        {store ? (
          // Keyed by example: each thread has its own scroll position and its own answers.
          <Thread key={active} store={store} theme={theme} />
        ) : (
          <div className="pgc-scroll">
            <div className="pgc-hello">
              <Logo size={52} />
              <h1>What should GistUI render?</h1>
              <p>Pick an example on the left or a question below. Each one opens its own chat, and its screen streams in.</p>
              <div className="pgc-starters">
                {QUESTIONS.slice(0, 6).map((item) => (
                  <button key={item.id} type="button" onClick={() => open(item.id)}>
                    {item.q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pgc-dock">
          {active && (
            <div className="pgc-next" aria-label="Other examples to try">
              <span>Try next</span>
              {next.map((item) => (
                <button key={item.id} type="button" onClick={() => open(item.id)}>
                  {item.q}
                </button>
              ))}
            </div>
          )}
          <p className="pgc-note">Answers are recorded GistUI programs, streamed at {TOKENS_PER_SECOND} tokens per second. No model is called.</p>
        </div>
      </main>
    </div>
  );
}
