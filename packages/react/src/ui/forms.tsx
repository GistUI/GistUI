import type { NodeRef } from "@gistui/core";
import type { FieldRules } from "@gistui/headless";
import { useContext, useId, useMemo, useState, type ReactNode } from "react";
import { FormContext, useEmit, useLocked, useRun } from "../context";
import { useDesign } from "../design";
import { lazyModule, num, safeUrl, str, useBinding, useLazyModule, useNodes } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { FieldError, useField, useOwnValue } from "./form";
import { OpenerCtx, OverlayCtx } from "./overlay";

/** Validation rules from a field's props (see FieldRules in @gistui/headless). */
export function rulesOf(props: Record<string, unknown>): FieldRules {
  const protocols = Array.isArray(props.protocols) ? props.protocols.map(String) : undefined;
  return {
    label: str(props.label),
    required: props.required === true || undefined,
    type: str(props.type),
    min: num(props.min),
    max: num(props.max),
    minLength: num(props.minLength),
    maxLength: num(props.maxLength),
    pattern: str(props.pattern),
    match: str(props.match),
    protocols,
    message: str(props.error),
  };
}

export function Field({ id, label, required, size, hint, error, children }: {
  id: string;
  label: string | undefined;
  required: boolean;
  size?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="gistui-field" data-size={size} data-invalid={error ? "" : undefined}>
      {label && (
        <label className="gistui-field__label" htmlFor={id} data-required={required || undefined}>
          {label}
        </label>
      )}
      {children}
      {error ? <FieldError id={`${id}-error`} error={error} /> : hint && <span className="gistui-field__hint">{hint}</span>}
    </div>
  );
}

const INPUT_TYPES = new Set(["text", "email", "number", "password", "url", "tel", "date"]);

export function Input({ node, props }: ComponentProps): ReactNode {
  const id = useId();
  const locked = useLocked(node);
  const required = props.required === true;
  const type = str(props.type) ?? "text";
  const error = useField(str(props.name), rulesOf(props));
  const [reveal, setReveal] = useState(false);
  const protocols = Array.isArray(props.protocols) ? props.protocols.map(String) : undefined;
  const placeholder = str(props.placeholder) ?? (type === "url" ? `${protocols?.[0] ?? "https"}://` : type === "email" ? "name@example.com" : undefined);
  const b = useBinding(node);
  // A bound number is held as a number, so the text being typed ("1.", "1.0", "-") cannot round-trip
  // through it: while the field has focus, it shows what was typed.
  const [typing, setTyping] = useState<string | null>(null);
  const value = b.bound
    ? {
        value: typing ?? (b.value == null ? "" : String(b.value)),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const text = e.target.value;
          if (type !== "number") return b.set(text);
          setTyping(text);
          b.set(text === "" || !Number.isFinite(Number(text)) ? text || null : Number(text));
        },
        onBlur: () => setTyping(null),
      }
    : { defaultValue: str(props.value) ?? (typeof props.value === "number" ? String(props.value) : undefined) };
  return (
    <Field id={id} label={str(props.label)} required={required} size={str(props.size)} hint={str(props.hint)} error={error}>
      <div className="gistui-input-wrap" data-type={type}>
        <input
          id={id}
          className="gistui-input"
          data-gistui="Input"
          name={str(props.name)}
          type={type === "password" && reveal ? "text" : INPUT_TYPES.has(type) ? type : "text"}
          inputMode={type === "email" ? "email" : type === "url" ? "url" : type === "tel" ? "tel" : type === "number" ? "decimal" : undefined}
          // Generated UI must not collect saved credentials: a password field never asks for autofill.
          autoComplete={type === "email" ? "email" : type === "tel" ? "tel" : type === "url" ? "url" : type === "password" ? "new-password" : undefined}
          placeholder={placeholder}
          min={num(props.min)}
          max={num(props.max)}
          minLength={num(props.minLength)}
          maxLength={num(props.maxLength)}
          required={required}
          disabled={locked}
          data-locked={locked || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...value}
        />
        {type === "password" && (
          <button type="button" className="gistui-input-reveal" aria-label={reveal ? "Hide password" : "Show password"} onClick={() => setReveal((r) => !r)}>
            <IconSvg name={reveal ? "x" : "eye"} />
          </button>
        )}
      </div>
    </Field>
  );
}

export function TextArea({ node, props }: ComponentProps): ReactNode {
  const id = useId();
  const locked = useLocked(node);
  const required = props.required === true;
  const error = useField(str(props.name), rulesOf(props));
  const b = useBinding(node);
  const value = b.bound
    ? { value: b.value == null ? "" : String(b.value), onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => b.set(e.target.value) }
    : { defaultValue: str(props.value) };
  return (
    <Field id={id} label={str(props.label)} required={required} size={str(props.size)} hint={str(props.hint)} error={error}>
      <textarea
        {...value}
        id={id}
        className="gistui-textarea"
        data-gistui="TextArea"
        name={str(props.name)}
        rows={num(props.rows) ?? 4}
        placeholder={str(props.placeholder)}
        minLength={num(props.minLength)}
        maxLength={num(props.maxLength)}
        required={required}
        disabled={locked}
        data-locked={locked || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </Field>
  );
}

/** Controlled when bound (`bind:$var`), uncontrolled otherwise. */
function nativeSelectValue(b: { bound: boolean; value: unknown; set: (v: unknown) => void }, multiple: boolean) {
  if (!b.bound) return { defaultValue: multiple ? [] : "" };
  return {
    value: multiple ? (Array.isArray(b.value) ? b.value.map(String) : []) : b.value == null ? "" : String(b.value),
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => b.set(multiple ? Array.from(e.target.selectedOptions, (o) => o.value) : e.target.value),
  };
}

const selectModule = lazyModule(() => import("./select").then((m) => m.SelectImpl));
export const preloadSelect = (): Promise<unknown> => selectModule.load();

/**
 * Zag's select and its positioning engine are their own chunk. A look-alike trigger shows while it
 * loads; if it cannot be loaded, a native <select> takes over so the form still works.
 */
export function Select(p: ComponentProps): ReactNode {
  const { node, props } = p;
  const locked = useLocked(node);
  const { value: Impl, failed } = useLazyModule(selectModule);
  if (Impl) return <Impl {...p} />;
  const label = str(props.label);
  if (failed) return <NativeSelect {...p} locked={locked} />;
  return (
    <div className="gistui-field gistui-select" data-gistui="Select" data-size={str(props.size)}>
      <span className="gistui-field__label">{label}</span>
      <button type="button" data-part="trigger" disabled>
        <span data-part="value-text" data-placeholder-shown="">
          {str(props.placeholder) || "Select…"}
        </span>
        <span data-part="indicator" aria-hidden>
          <IconSvg name="chevron-down" />
        </span>
      </button>
    </div>
  );
}

function NativeSelect({ node, props, locked }: ComponentProps & { locked: boolean }): ReactNode {
  const b = useBinding(node);
  const id = useId();
  const error = useField(str(props.name), { ...rulesOf(props), type: undefined });
  const options = Array.isArray(props.options) ? props.options.map(String) : [];
  return (
    <Field id={id} label={str(props.label)} required={props.required === true} size={str(props.size)} hint={str(props.hint)} error={error}>
      <select id={id} className="gistui-input" data-gistui="Select" name={str(props.name)} multiple={props.multiple === true} required={props.required === true} disabled={locked} {...nativeSelectValue(b, props.multiple === true)}>
        {props.multiple !== true && (
          <option value="" disabled>
            {str(props.placeholder) || "Select…"}
          </option>
        )}
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}

/** Focus came from the keyboard (so the control shows a focus ring). */
const keyboardFocus = (el: Element) => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * A native checkbox (or switch) with a custom control: the input stays in the form (FormData,
 * validation, keyboard, screen readers), visually hidden; the attributes match Zag's so styles apply.
 */
function useToggle(node: ComponentProps["node"], fromProps: boolean) {
  const b = useBinding(node);
  const [own, setOwn] = useOwnValue(fromProps);
  const checked = b.bound ? Boolean(b.value) : own;
  const setChecked = (v: boolean) => (b.bound ? b.set(v) : setOwn(v));
  const [focus, setFocus] = useState(false);
  const state = checked ? "checked" : "unchecked";
  const input = {
    checked,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setChecked(e.target.checked),
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => setFocus(keyboardFocus(e.target)),
    onBlur: () => setFocus(false),
  };
  return { state, focus, input };
}

export function Checkbox({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const id = useId();
  const t = useToggle(node, props.checked === true);
  const error = useField(str(props.name), { label: str(props.label), required: props.required === true || undefined, message: str(props.error) }, "bool");
  return (
    <div className="gistui-field" data-invalid={error ? "" : undefined}>
      <label className="gistui-checkbox" data-gistui="Checkbox" data-locked={locked || undefined} data-scope="checkbox" data-part="root" data-state={t.state} data-disabled={locked || undefined} htmlFor={id}>
        <span data-scope="checkbox" data-part="control" data-state={t.state} data-focus-visible={t.focus || undefined} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span data-scope="checkbox" data-part="label">{str(props.label)}</span>
        <input
          type="checkbox"
          id={id}
          className="gistui-sr-only"
          name={str(props.name)}
          required={props.required === true}
          disabled={locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...t.input}
        />
      </label>
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

export function Switch({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const id = useId();
  const t = useToggle(node, props.checked === true);
  // Registered as a boolean, so the Form reads it as true/false (unregistered, "on" would be read as text and submitted as false).
  useField(str(props.name), { label: str(props.label) }, "bool");
  return (
    <label className="gistui-switch"
 data-gistui="Switch" data-locked={locked || undefined} data-scope="switch" data-part="root" data-state={t.state} data-disabled={locked || undefined} htmlFor={id}>
      <span data-scope="switch" data-part="control" data-state={t.state} data-focus-visible={t.focus || undefined} aria-hidden>
        <span data-scope="switch" data-part="thumb" data-state={t.state} />
      </span>
      <span data-scope="switch" data-part="label">{str(props.label)}</span>
      <input type="checkbox" role="switch" id={id} className="gistui-sr-only" name={str(props.name)} disabled={locked} {...t.input} />
    </label>
  );
}

/**
 * A Button: `do:` runs steps; `opens:` opens a Dialog; `close` closes the dialog it is in; `href`
 * makes it a link. Inside a Form a primary button submits. Elsewhere, a button with none of these
 * sends its label as a message (parity with OpenUI).
 */
/** What a button needs, for your own component (see `useGistButton`). */
export interface GistButton {
  readonly label: string;
  /** primary | accent | secondary | ghost | link | danger */
  readonly variant: string;
  readonly size: string | undefined;
  readonly icon: string | undefined;
  /** Show only the icon; keep the label as the accessible name and tooltip. */
  readonly iconOnly: boolean;
  readonly full: boolean;
  /** A link button: render an `<a href target="_blank">` instead (no `buttonProps`). */
  readonly href: string | undefined;
  /** Spread onto your `<button>`: type (submit in a form), disabled, the click behaviour, draft and dialog attributes. */
  readonly buttonProps: {
    type: "submit" | "reset" | "button";
    disabled: boolean;
    onClick: () => void;
    /** Always undefined now (a draft button is `type="button"`); kept so existing spreads still type-check. */
    formNoValidate: boolean | undefined;
    "data-draft": "" | undefined;
    "aria-haspopup": "dialog" | undefined;
  };
  /** The Dialog this button opens (`opens:`): render it next to the button. */
  readonly dialog: ReactNode;
}

/**
 * Your own button (a shadcn/ui `<Button>`, MUI…) with GistUI's behaviour: `do:` actions, submitting
 * the Form it is in (and `type:draft`), opening a Dialog (`opens:`), closing one (`close`), links
 * (`href:`), and sending its label to the assistant when it does nothing else.
 *
 *   function MyButton(p: ComponentProps) {
 *     const b = useGistButton(p);
 *     return <>
 *       <Button variant={b.variant === "secondary" ? "secondary" : "default"} {...b.buttonProps}>{b.label}</Button>
 *       {b.dialog}
 *     </>;
 *   }
 */
export function useGistButton({ node, props, renderNode }: Pick<ComponentProps, "node" | "props" | "renderNode">): GistButton {
  const emit = useEmit();
  const run = useRun();
  const locked = useLocked(node);
  const overlay = useContext(OverlayCtx);
  const form = useContext(FormContext);
  const inForm = form !== null;
  const [open, setOpen] = useState(false);
  const label = str(props.label) ?? "";
  const steps = node.dyn?.do;
  const opens = props.opens && typeof props.opens === "object" ? (props.opens as NodeRef) : undefined;
  const closes = props.close === true;
  const v = str(props.v) ?? "primary";
  const explicit = str(props.type);
  const draft = explicit === "draft" && inForm;
  // A draft button is not a submit button: Enter in a field must submit the form, not save a draft.
  const type: "submit" | "reset" | "button" = explicit === "submit" || explicit === "reset" ? explicit : !explicit && inForm && !steps && !opens && !closes && (v === "primary" || v === "accent") ? "submit" : "button";
  const onClick = () => {
    if (closes) overlay?.close();
    if (draft) form?.saveDraft();
    if (opens) return setOpen(true);
    if (steps) return run(steps, node.id);
    if (type !== "button" || inForm || closes) return;
    emit({ type: "send", message: label, nodeId: node.id });
  };
  return {
    label,
    variant: v,
    size: str(props.size),
    icon: str(props.icon),
    iconOnly: props.iconOnly === true,
    full: props.full === true,
    href: safeUrl(props.href),
    buttonProps: {
      type,
      disabled: locked || props.disabled === true,
      onClick,
      formNoValidate: undefined,
      "data-draft": draft ? "" : undefined,
      "aria-haspopup": opens ? "dialog" : undefined,
    },
    dialog: opens ? (
      <OpenerCtx.Provider value={{ open, setOpen }}>
        <Opens target={opens} renderNode={renderNode} />
      </OpenerCtx.Provider>
    ) : null,
  };
}

/** The Dialog a button opens. Nothing while its statement has not streamed in: no skeleton beside the button. */
function Opens({ target, renderNode }: { target: NodeRef; renderNode: ComponentProps["renderNode"] }): ReactNode {
  const ids = useMemo(() => [target.$ref], [target.$ref]);
  const [dialog] = useNodes(ids);
  return !dialog || dialog.type === "#pending" ? null : renderNode(target);
}


export function Button(p: ComponentProps): ReactNode {
  const { node, props } = p;
  const b = useGistButton(p);
  const locked = useLocked(node);
  const d = useDesign("Button", props);
  const { label, icon, href, iconOnly } = b;
  const common = {
    className: d.className ? `gistui-button ${d.className}` : "gistui-button",
    style: d.style,
    ...d.attrs,
    "data-gistui": "Button",
    "data-v": b.variant,
    "data-size": b.size,
    "data-full": b.full || undefined,
    "data-icon-only": iconOnly || undefined,
    ...(iconOnly ? { "aria-label": label, title: label } : {}),
  };
  // An icon button (or a bare swatch, with no icon) keeps its label as the accessible name and tooltip.
  const inner = iconOnly ? (
    icon && <IconSvg name={icon} />
  ) : (
    <>
      {icon && <IconSvg name={icon} />}
      {label}
      {href && !icon && <IconSvg name="arrow-up-right" />}
    </>
  );
  if (href) {
    return (
      <a {...common} href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <>
      <button {...common} {...b.buttonProps} data-locked={locked || undefined}>
        {inner}
      </button>
      {b.dialog}
    </>
  );
}

export function Buttons({ props, children }: ComponentProps): ReactNode {
  return (
    <div className="gistui-buttons" data-gistui="Buttons" data-align={str(props.align)}>
      {children}
    </div>
  );
}
