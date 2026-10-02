/**
 * Dialogs and drawers on a native <dialog> (top layer, focus trap, Esc to close).
 *
 *   Button("Invite team", opens:invite)         a button that opens a dialog
 *   invite = Dialog("Invite teammates", form, subtitle:"…", v:drawer, side:right, size:md)
 *   Button("Cancel", v:ghost, close)             closes the dialog it sits in
 *   Dialog("Filters", …, trigger:"Filters")      a dialog with its own trigger button
 *
 * A Form inside a dialog closes it after a valid submit.
 *
 * An open dialog renders at the `.gistui` root (a portal), not where its button is: a dialog opened
 * from inside a Form would otherwise nest its own <form> in that one. Theme tokens apply at the
 * root too, and the presets of the section it came from (accent, radius, density) are carried over.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FormContext, RootElementContext } from "../context";
import { str } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { PresetContext } from "./layout";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Inside an open dialog: `close()` closes it (Buttons with `close`, Forms after submit). */
export const OverlayCtx = createContext<{ close: () => void } | null>(null);

/** Set by a Button with `opens:`: the dialog it renders is controlled by that button. */
export const OpenerCtx = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

const CLOSE_MS = 200;

function DialogView({ open, onClose, props, children }: { open: boolean; onClose: () => void; props: Record<string, unknown>; children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(open);
  const root = useContext(RootElementContext);
  const presets = useContext(PresetContext);
  /** What had focus when the dialog opened (its button): focus returns there when it closes. */
  const opener = useRef<HTMLElement | null>(null);

  // Closes the native dialog while it is still in the document (once unmounted it can no longer be
  // closed, and focus is simply lost), then gives focus back to what opened it.
  const shut = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    const at = document.activeElement;
    const ours = !at || at === document.body || d.contains(at);
    if (d.open) d.close?.();
    if (ours && opener.current?.isConnected) opener.current.focus?.();
    opener.current = null;
  }, []);

  useEffect(() => {
    if (open) {
      if (!mounted) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      // Play the exit animation, then close the native dialog and unmount it.
      setClosing(true);
      const t = setTimeout(() => {
        shut();
        setClosing(false);
        setMounted(false);
      }, CLOSE_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted, shut]);

  useEffect(() => {
    const d = ref.current;
    if (mounted && d && !d.open) d.showModal?.();
  }, [mounted]);

  // Removed while open (its section left the program): closed first, for the same reasons.
  useIsoLayout(() => shut, [shut]);

  const close = useCallback(() => onClose(), [onClose]);
  if (!mounted) return null;
  const v = str(props.v) ?? "modal";
  const title = str(props.title);
  const subtitle = str(props.subtitle);
  const dialog = (
    <dialog
      ref={ref}
      className="gistui-dialog"
      data-gistui="Dialog"
      data-v={v}
      data-side={v === "drawer" ? (str(props.side) ?? "right") : undefined}
      data-size={str(props.size) ?? "md"}
      data-closing={closing || undefined}
      {...presets}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onMouseDown={(e) => {
        // A press on the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="gistui-dialog__panel">
        <header className="gistui-dialog__head">
          <div>
            {title && <h2 className="gistui-dialog__title">{title}</h2>}
            {subtitle && <p className="gistui-dialog__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="gistui-dialog__close" aria-label="Close" onClick={close}>
            <IconSvg name="x" />
          </button>
        </header>
        <div className="gistui-dialog__body">
          {/* Its own scope: buttons and fields in here do not belong to a Form the dialog was opened from. */}
          <FormContext.Provider value={null}>
            <OverlayCtx.Provider value={{ close }}>{children}</OverlayCtx.Provider>
          </FormContext.Provider>
        </div>
      </div>
    </dialog>
  );
  const target = root?.current;
  return target ? createPortal(dialog, target) : dialog;
}


export function Dialog({ props, children }: ComponentProps): ReactNode {
  const opener = useContext(OpenerCtx);
  const [own, setOwn] = useState(false);
  const open = opener ? opener.open : own;
  const setOpen = opener ? opener.setOpen : setOwn;
  const trigger = str(props.trigger);
  return (
    <>
      {!opener && trigger && (
        <button type="button" className="gistui-button" data-v="secondary" onClick={() => setOpen(true)}>
          {str(props.icon) && <IconSvg name={str(props.icon)} />}
          {trigger}
        </button>
      )}
      <DialogView open={open} onClose={() => setOpen(false)} props={props}>
        {children}
      </DialogView>
    </>
  );
}
