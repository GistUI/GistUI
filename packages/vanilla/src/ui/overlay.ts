/**
 * Dialogs and drawers on a native <dialog> (top layer, focus trap, Esc to close), as in
 * `@gistui/react`. A Button with `opens:` controls the dialog it renders; a Button with `close` and a
 * Form after a valid submit close the dialog they sit in.
 */

import { h, setAttrs, setText, str, syncChildren } from "../dom";
import { FORM } from "../field";
import type { DomContext, DomRenderer } from "../types";
import { iconEl } from "./icon";

/** Inside an open dialog: `close()` closes it. */
export const OVERLAY = Symbol("gistui.overlay");
export interface OverlayHandle {
  close(): void;
}

/** Provided by a Button with `opens:`: the dialog it renders is controlled by that button. */
export const OPENER = Symbol("gistui.opener");
export interface OpenerHandle {
  readonly open: boolean;
  setOpen(open: boolean): void;
  /** Called when `open` changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
  /** The opener's element (the button): the dialog finds the GistUI root and its section's presets from it. */
  anchor?: () => Element;
}

/** An open/closed state with listeners (a Button's for the dialog it opens). */
export function openerState(): OpenerHandle {
  let open = false;
  const listeners = new Set<() => void>();
  return {
    get open() {
      return open;
    },
    setOpen(v) {
      if (v === open) return;
      open = v;
      for (const cb of [...listeners]) cb();
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

const CLOSE_MS = 200;
/** Presets a section can set (accent, rounding, density): an open dialog carries the ones around its opener. */
const PRESETS = ["data-gistui-color", "data-gistui-radius", "data-gistui-density"] as const;

export const Dialog: DomRenderer = (ctx) => {
  let c = ctx;
  const opener = ctx.consume<OpenerHandle>(OPENER);
  const own = openerState();
  const state = opener ?? own;
  const close = () => state.setOpen(false);
  const overlay: OverlayHandle = { close };
  // Its own scope: buttons and fields in here do not belong to a Form the dialog was opened from.
  const scope = (x: DomContext) => {
    x.provide<OverlayHandle>(OVERLAY, overlay);
    x.provide(FORM, undefined);
  };
  scope(ctx);

  const title = h("h2", { class: "gistui-dialog__title" });
  const subtitle = h("p", { class: "gistui-dialog__subtitle" });
  const titles = h("div");
  const closeBtn = h("button", { type: "button", class: "gistui-dialog__close", "aria-label": "Close" }, iconEl("x"));
  closeBtn.addEventListener("click", close);
  const body = h("div", { class: "gistui-dialog__body" });
  const dialog = h("dialog", { class: "gistui-dialog", "data-gistui": "Dialog" }, h("div", { class: "gistui-dialog__panel" }, h("header", { class: "gistui-dialog__head" }, titles, closeBtn), body));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  // A press on the backdrop (the dialog element itself, outside the panel) closes it.
  dialog.addEventListener("mousedown", (e) => {
    if (e.target === dialog) close();
  });
  const trigger = h("button", { type: "button", class: "gistui-button" });
  trigger.addEventListener("click", () => state.setOpen(true));
  // The component's element holds the trigger button only. The <dialog>, while it is on screen, is a
  // child of the GistUI root (as React's portal): outside any <form> or clipping box around its
  // opener, with the presets of the section it was opened from so it keeps that section's look.
  const el = h("div", { style: "display:contents" });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let mounted = false;
  /** What had focus when the dialog opened (its button): focus returns there when it closes. */
  let focusBack: HTMLElement | null = null;

  const attach = () => {
    const from = opener?.anchor?.() ?? el;
    const root = from.closest(".gistui");
    for (const name of PRESETS) {
      const section = from.closest(`[${name}]`);
      setAttrs(dialog, { [name]: section && section !== root ? section.getAttribute(name) : undefined });
    }
    const home = root ?? el;
    if (dialog.parentNode !== home) home.append(dialog);
  };
  // Closes the native dialog while it is still in the document (once removed it can no longer be
  // closed, and focus is simply lost), then gives focus back to what opened it.
  const shut = () => {
    const at = document.activeElement;
    const ours = !at || at === document.body || dialog.contains(at);
    if (dialog.open) dialog.close?.();
    if (ours && focusBack?.isConnected) focusBack.focus?.();
    focusBack = null;
  };
  const sync = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (state.open) {
      if (!mounted) focusBack = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      mounted = true;
      setAttrs(dialog, { "data-closing": undefined });
      attach();
      if (dialog.isConnected && !dialog.open) dialog.showModal?.();
    } else if (mounted) {
      // Play the exit animation, then close the native dialog and take it out.
      setAttrs(dialog, { "data-closing": "true" });
      timer = setTimeout(() => {
        shut();
        mounted = false;
        setAttrs(dialog, { "data-closing": undefined });
        dialog.remove();
      }, CLOSE_MS);
    }
  };
  const draw = () => {
    const p = c.props;
    const v = str(p.v) ?? "modal";
    const t = str(p.title);
    const s = str(p.subtitle);
    setAttrs(dialog, { "data-v": v, "data-side": v === "drawer" ? (str(p.side) ?? "right") : undefined, "data-size": str(p.size) ?? "md", "aria-label": t });
    setText(title, t ?? "");
    setText(subtitle, s ?? "");
    syncChildren(titles, [...(t ? [title] : []), ...(s ? [subtitle] : [])]);
    c.place(body);
    const label = str(p.trigger);
    const withTrigger = !opener && Boolean(label);
    if (withTrigger) {
      setAttrs(trigger, { "data-v": "secondary" });
      const icon = str(p.icon);
      const shown = JSON.stringify([icon, label]);
      if (shown !== triggerShown) {
        triggerShown = shown;
        const svg = iconEl(icon);
        syncChildren(trigger, [...(svg ? [svg] : []), document.createTextNode(label!)]);
      }
    }
    syncChildren(el, withTrigger ? [trigger] : []);
    // An open dialog stays on screen if the root was drawn again around it.
    if (mounted && state.open && !dialog.isConnected) attach();
  };
  let triggerShown = "";
  const off = state.subscribe(() => {
    draw();
    sync();
  });
  draw();
  sync();
  return {
    el,
    update(next: DomContext) {
      c = next;
      scope(c);
      draw();
      return true;
    },
    destroy() {
      off();
      if (timer) clearTimeout(timer);
      // Removed while open (its section left the program): closed first, for the same reasons.
      if (mounted) shut();
      dialog.remove();
    },
  };
};
