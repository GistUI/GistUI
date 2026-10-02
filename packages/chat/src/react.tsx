/**
 * `@gistui/chat/react`: chat layouts over a `ChatStore`. Assistant replies render their chat text as
 * Markdown and their ```gistui blocks with `<GistUI>`: all blocks of one reply are one program (a
 * later block amends the first), shown once, where the first block is. A button's `send` and a
 * form's submit become the next user message, marked as coming from the UI (for the person and for
 * the model), since their text was written by the program and not typed.
 *
 *   const chat = createChat({ adapter: openai({ url: "/api/chat", model: "…" }) })
 *   <Chat store={chat} library={ui} layout="full" suggestions={["Revenue dashboard", "Plan a trip"]} />
 *
 * Layouts: `full` (fills its container), `sidebar` (a panel on the right, with a launcher) and
 * `tray` (a bottom sheet). Settled messages never re-render while a new reply streams.
 */

import { GistUI, useWidget, type GistUIAction, type GistUILibrary, type GistUIProps } from "@gistui/react";
import { mayLoad } from "@gistui/core";
import { createMarkdown, defaultSafeUrl } from "@gistui/widgets/markdown";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { replyProgram, splitReply } from "./split";
import type { ChatMessage, ChatSnapshot, ChatStore } from "./store";

export function useChat(store: ChatStore): ChatSnapshot & Pick<ChatStore, "send" | "stop" | "regenerate" | "clear"> {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...snap,
    send: (t, from) => store.send(t, from),
    stop: () => store.stop(),
    regenerate: () => store.regenerate(),
    clear: () => store.clear(),
  };
}

export interface ChatProps extends Pick<GistUIProps, "tools" | "mutations" | "onToolCall" | "allowedHosts" | "theme" | "color" | "tokens" | "darkTokens" | "lockUntil"> {
  store: ChatStore;
  library: GistUILibrary;
  layout?: "full" | "sidebar" | "tray";
  title?: string;
  placeholder?: string;
  /** Starter prompts shown while the thread is empty. */
  suggestions?: readonly string[];
  /** Shown above the suggestions while the thread is empty. */
  empty?: ReactNode;
  /** Every action from the UI (the chat already sends `send` and `submit` as messages). */
  onAction?: (action: GistUIAction, message: ChatMessage) => void;
  /** Sidebar and tray: controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Chat(props: ChatProps): ReactNode {
  const { store, layout = "full", title = "Assistant" } = props;
  const [ownOpen, setOwnOpen] = useState(props.defaultOpen ?? layout === "full");
  const open = layout === "full" ? true : (props.open ?? ownOpen);
  const setOpen = (v: boolean) => {
    setOwnOpen(v);
    props.onOpenChange?.(v);
  };
  const root = (
    <div
      className={`gistui gistui-chat${props.className ? ` ${props.className}` : ""}`}
      data-layout={layout}
      data-open={open || undefined}
      data-gistui-theme={props.theme ?? "system"}
      data-gistui-color={props.color && props.color !== "neutral" ? props.color : undefined}
      role={layout === "full" ? undefined : "dialog"}
      aria-label={title}
      hidden={!open}
    >
      <ChatHeader store={store} title={title} onClose={layout === "full" ? undefined : () => setOpen(false)} />
      <ChatThread {...props} />
      <Composer store={store} placeholder={props.placeholder} />
    </div>
  );
  if (layout === "full") return root;
  return (
    <>
      {root}
      {!open && (
        <button type="button" className="gistui-chat__launcher" data-layout={layout} aria-label={`Open ${title}`} onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  );
}

function ChatHeader({ store, title, onClose }: { store: ChatStore; title: string; onClose: (() => void) | undefined }): ReactNode {
  const { messages } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <header className="gistui-chat__head">
      <span className="gistui-chat__title">{title}</span>
      <span className="gistui-chat__head-actions">
        {messages.length > 0 && (
          <button type="button" className="gistui-chat__icon" aria-label="New chat" title="New chat" onClick={() => store.clear()}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {onClose && (
          <button type="button" className="gistui-chat__icon" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </span>
    </header>
  );
}

/** The message list; follows the newest reply while you are at the bottom. */
export function ChatThread(props: ChatProps): ReactNode {
  const { store } = props;
  const { messages } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  const latest = useRef(props);
  latest.current = props;
  const onAction = useCallback((a: GistUIAction, m: ChatMessage) => {
    latest.current.onAction?.(a, m);
    // The text comes from the program, not from the keyboard: it is sent with that provenance.
    if (a.type === "send") void latest.current.store.send(a.message, { origin: "ui" });
    else if (a.type === "submit" && !a.partial) void latest.current.store.send(a.message, { origin: "ui", action: "submit" });
  }, []);
  // Stable, so a settled message is not rendered again while the next reply streams.
  const onRetry = useCallback(() => void latest.current.store.regenerate(), []);
  // Only the latest reply keeps refreshing its data (`every:`); earlier ones go quiet.
  let liveId: string | undefined;
  for (let i = messages.length - 1; i >= 0 && !liveId; i--) if (messages[i]!.role !== "user") liveId = messages[i]!.id;
  return (
    <div className="gistui-chat__scroll" ref={scroller} onScroll={onScroll} aria-live="polite">
      {messages.length === 0 ? (
        <div className="gistui-chat__empty">
          {props.empty ?? <p className="gistui-chat__hello">What should we build?</p>}
          {props.suggestions && props.suggestions.length > 0 && (
            <div className="gistui-chat__suggestions">
              {props.suggestions.map((s) => (
                <button key={s} type="button" className="gistui-chat__suggestion" onClick={() => void store.send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            library={props.library}
            tools={props.tools}
            mutations={props.mutations}
            onToolCall={props.onToolCall}
            hosts={props.allowedHosts?.join("\n")}
            theme={props.theme}
            color={props.color}
            tokens={props.tokens}
            darkTokens={props.darkTokens}
            lockUntil={props.lockUntil}
            live={m.id === liveId}
            onAction={onAction}
            onRetry={onRetry}
          />
        ))
      )}
    </div>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  library: GistUILibrary;
  tools: GistUIProps["tools"];
  mutations: GistUIProps["mutations"];
  onToolCall: GistUIProps["onToolCall"];
  /** `allowedHosts`, joined with line breaks (a string keeps the row's memo; an inline array would not). */
  hosts: string | undefined;
  theme: GistUIProps["theme"];
  color: string | undefined;
  tokens: GistUIProps["tokens"];
  darkTokens: GistUIProps["darkTokens"];
  lockUntil: GistUIProps["lockUntil"];
  /** The latest reply: its UI may refresh its data on a timer. */
  live: boolean;
  onAction: (a: GistUIAction, m: ChatMessage) => void;
  onRetry: () => void;
}

const MessageRow = memo(function MessageRow(props: MessageRowProps): ReactNode {
  const { message } = props;
  if (message.role !== "user") return <AssistantRow {...props} />;
  const fromUi = message.origin === "ui";
  return (
    <div className="gistui-chat__msg" data-role="user" data-origin={fromUi ? "ui" : undefined}>
      {fromUi && <span className="gistui-chat__origin">{message.action === "submit" ? "Form sent from the UI" : "Sent from the UI"}</span>}
      <div className="gistui-chat__bubble">{message.content}</div>
    </div>
  );
});

function AssistantRow({ message, library, tools, mutations, onToolCall, hosts, theme, color, tokens, darkTokens, lockUntil, live, onAction, onRetry }: MessageRowProps): ReactNode {
  const streaming = message.status === "streaming";
  const parts = splitReply(message.content, { streaming });
  const firstUi = parts.findIndex((p) => p.kind === "ui");
  const allowedHosts = useMemo(() => (hosts === undefined ? undefined : hosts.split("\n").filter(Boolean)), [hosts]);
  return (
    <div className="gistui-chat__msg" data-role="assistant" data-status={message.status}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <ChatMarkdown key={i} content={p.text} streaming={streaming && i === parts.length - 1} allowedHosts={allowedHosts} />
        ) : i === firstUi ? (
          // One program per message: every fence feeds this one UI, and it is done when the message is.
          <GistUI
            key="ui"
            library={library}
            source={replyProgram(parts)}
            streaming={streaming}
            tools={tools}
            mutations={mutations}
            // An earlier answer still loads its data and still answers the person; it stops refreshing on timers.
            paused={!live}
            {...(allowedHosts ? { allowedHosts } : {})}
            onToolCall={onToolCall}
            theme={theme}
            color={color}
            tokens={tokens}
            darkTokens={darkTokens}
            lockUntil={lockUntil}
            className="gistui-chat__ui"
            onAction={(a) => onAction(a, message)}
          />
        ) : null,
      )}
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
}

function ChatMarkdown({ content, streaming, allowedHosts }: { content: string; streaming: boolean; allowedHosts: readonly string[] | undefined }): ReactNode {
  // An image in the chat text loads by itself: with `allowedHosts`, only from those hosts.
  const isSafeUrl = useCallback((url: string, kind: "link" | "image") => defaultSafeUrl(url, kind) && (kind === "link" || mayLoad(url, { allowedHosts }, false)), [allowedHosts]);
  const ref = useWidget(createMarkdown, { content, streaming, isSafeUrl });
  return <div ref={ref} className="gistui-chat__text gistui-text" />;
}

/** The message box: Enter sends, Shift+Enter adds a line; a stop button while a reply streams. */
export function Composer({ store, placeholder }: { store: ChatStore; placeholder?: string | undefined }): ReactNode {
  const { status } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);
  const send = () => {
    if (!text.trim() || status === "streaming") return;
    void store.send(text);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <form
      className="gistui-chat__composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea ref={ref} rows={1} value={text} placeholder={placeholder ?? "Ask for a dashboard, a form, a report…"} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} aria-label="Message" />
      {status === "streaming" ? (
        <button type="button" className="gistui-chat__send" data-stop="" aria-label="Stop" onClick={() => store.stop()}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="gistui-chat__send" aria-label="Send" disabled={!text.trim()}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </form>
  );
}
