import type { Expr, GistUINode, NodeStore, Runtime } from "@gistui/core";
import type { FieldRules } from "@gistui/headless";
import { createContext, useContext, type RefObject } from "react";
import type { GistUILibrary } from "./library";

export type { FormSubmitAction, GistUIAction } from "@gistui/headless/actions";
import type { GistUIAction } from "@gistui/headless/actions";

export interface DevtoolsHooks {
  /** Called on every NodeView render (per-node render counts). */
  onNodeRender?: (id: string) => void;
}

export interface EngineContextValue {
  store: NodeStore;
  /** State, queries, expressions and actions; `runtime.view(id)` is the node to render. */
  runtime: Runtime;
  library: GistUILibrary;
  emit: (action: GistUIAction) => void;
  lockUntil: "done" | "ready";
  devtools: DevtoolsHooks | undefined;
}

export const EngineContext = createContext<EngineContextValue | null>(null);
/**
 * The host's colour theme (`<GistUI color>`). When the host picks one, it wins over the accent a
 * generated program asks for (`Page(accent:…)`), so the app's brand is never overridden.
 */
export const HostColorContext = createContext<string | undefined>(undefined);
/** Only changes when a stream starts or ends, so few components ever re-render from it. */
export const StreamingContext = createContext(false);
/** The `.gistui` root element: Dialogs render there (a portal), outside any <form> they were opened from. */
export const RootElementContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** How a field's value is read from the form: text, a single checkbox (boolean) or a list. */
export type FieldKind = "text" | "bool" | "list";

export interface FormContextValue {
  register: (name: string, rules: FieldRules, kind: FieldKind) => () => void;
  errors: Readonly<Record<string, string>>;
  /** Counts resets (`Button(type:reset)`): fields then hand their own value back to their props. */
  resets: number;
  /** Saves a draft (`Button(type:draft)`): a partial submit; the form stays open. */
  saveDraft: () => void;
}

/** The Form around a field or button. Null outside a Form, and inside a Dialog (its own scope). */
export const FormContext = createContext<FormContextValue | null>(null);


export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("GistUI components must render inside <GistUI>");
  return ctx;
}

/** True while this message is still streaming. */
export function useIsStreaming(): boolean {
  return useContext(StreamingContext);
}

/**
 * True while an interactive component must not be used (§6.4). With `lockUntil="done"` (the default,
 * as in OpenUI) everything is locked until the stream ends; with `"ready"` only a node that is still
 * streaming is locked.
 */
export function useLocked(node: GistUINode): boolean {
  const streaming = useContext(StreamingContext);
  const { lockUntil } = useEngine();
  return lockUntil === "done" ? streaming : node.partial;
}

/** Runs a `do:[…]` action list (Buttons, clickable tiles). */
export function useRun(): (steps: Expr, nodeId: string) => void {
  const { runtime } = useEngine();
  return (steps, nodeId) => void runtime.run(steps, nodeId);
}

/** Sends an action to the host's `onAction`. */
export function useEmit(): (action: GistUIAction) => void {
  return useEngine().emit;
}
