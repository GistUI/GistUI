/**
 * What a renderer does with the runtime's outward events, the same for every framework: `@open`
 * opens a link (when allowed), and `send`, `open`, `emit` and errors reach the host's `onAction`.
 * (Tool calls are checked in core: see `tools.ts` there.)
 */

import type { RuntimeEvent } from "@gistui/core";
import type { GistUIAction } from "./actions";

export interface HostHandlers {
  onAction?: ((action: GistUIAction) => void) | undefined;
  onStateChange?: ((name: string, value: unknown) => void) | undefined;
  /** `@open(url)` opens the link in a new tab (http, https, mailto, tel). Default true. */
  openLinks?: boolean | undefined;
}

/** Routes a runtime event to the host's handlers. */
export function onRuntimeEvent(e: RuntimeEvent, p: HostHandlers): void {
  const nodeId = e.type === "state" ? "" : (e.nodeId ?? "");
  switch (e.type) {
    case "state":
      p.onStateChange?.(e.name, e.value);
      return;
    case "open":
      if (p.openLinks !== false && typeof window !== "undefined") window.open(e.url, "_blank", "noopener,noreferrer");
      p.onAction?.({ type: "open", url: e.url, nodeId });
      return;
    case "send":
      p.onAction?.({ type: "send", message: e.message, nodeId });
      return;
    case "emit":
      p.onAction?.({ type: "emit", event: e.event, payload: e.payload, nodeId });
      return;
    case "error":
      p.onAction?.({ type: "error", code: e.code, message: e.message, nodeId });
  }
}

/** Tokens that change colours override a program's accent; effect or spacing tokens do not. */
const COLOR_KEYS = new Set(["primary", "primaryHover", "primaryFg", "accent", "accentHover", "accentFg", "bg", "surface", "fg", "chart"]);
export function setsColor(t: object | undefined): boolean {
  return t ? Object.keys(t).some((k) => COLOR_KEYS.has(k) || /^--gistui-(primary|accent|chart)/.test(k)) : false;
}
