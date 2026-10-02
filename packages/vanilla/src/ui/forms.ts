/** Form controls, as in `@gistui/react`: the same markup, classes, data attributes and behaviour. */

import type { NodeRef } from "@gistui/core";
import { safeUrl } from "@gistui/headless/url";
import { h, num, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { rulesOf } from "../field";
import { flag, mark } from "./attrs";
import { bindingLink, boundValue, errorLine, fieldLink, inForm, FORM, type FieldKind, type FormController } from "./form";
import { iconEl } from "./icon";
import { OPENER, OVERLAY, openerState, type OverlayHandle } from "./overlay";

export { rulesOf };

let seq = 0;
const nextId = () => `gistui-f${++seq}`;

export function fieldBox(id: string, control: Node): { el: HTMLDivElement; set(o: { label?: string | undefined; required?: boolean; size?: string | undefined; hint?: string | undefined; error?: string | undefined }): void } {
  const el = h("div", { class: "gistui-field" });
  const label = h("label", { class: "gistui-field__label", for: id });
  const hint = h("span", { class: "gistui-field__hint" });
  return {
    el,
    set(o) {
      setAttrs(el, { "data-size": o.size, "data-invalid": mark(o.error) });
      setAttrs(label, { "data-required": flag(o.required) });
      setText(label, o.label ?? "");
      setText(hint, o.hint ?? "");
      const tail = o.error ? [errorLine(`${id}-error`, o.error)] : o.hint ? [hint] : [];
      syncChildren(el, [...(o.label ? [label] : []), control, ...tail]);
    },
  };
}

const INPUT_TYPES = new Set(["text", "email", "number", "password", "url", "tel", "date"]);

/**
 * Wires a text control: bound (`bind:$var`) or with its own value; reports changes to the binding.
 * The subscription to the variable is released when the control is destroyed.
 */
function bindText(ctx: DomContext, input: HTMLInputElement | HTMLTextAreaElement, toValue: (raw: string) => unknown) {
  let c = ctx;
  const put = () => {
    const b = c.binding();
    if (!b.bound) return;
    // What is being typed already stands for this value ("2." and "2.0" are the number 2): it stays,
    // or a bound number could never be typed past its decimal point.
    if (document.activeElement === input && Object.is(toValue(input.value), b.value)) return;
    const s = b.value == null ? "" : String(b.value);
    if (input.value !== s) input.value = s;
  };
  const binding = bindingLink(ctx, put);
  input.addEventListener("input", () => {
    const b = c.binding();
    if (b.bound) b.set(toValue(input.value));
  });
  return (next: DomContext, initial: string | undefined) => {
    c = next;
    binding.sync(c);
    if (c.binding().bound) put();
    // Uncontrolled: the program's value is the starting value (until the user types).
    else if (!input.dataset.touched && initial !== undefined && input.value !== initial) input.value = initial;
  };
}

/** A form reset: the control is untouched again, so it shows the program's value (or the bound one). */
const untouched = (input: HTMLInputElement | HTMLTextAreaElement, redraw: () => void) => () => {
  delete input.dataset.touched;
  redraw();
};

export const Input: DomRenderer = (ctx) => {
  const id = nextId();
  const input = h("input", { id, class: "gistui-input", "data-gistui": "Input" });
  input.addEventListener("input", () => (input.dataset.touched = "1"));
  const reveal = h("button", { type: "button", class: "gistui-input-reveal" });
  let revealed = false;
  const wrap = h("div", { class: "gistui-input-wrap" }, input);
  const box = fieldBox(id, wrap);
  let c = ctx;
  const link = fieldLink(ctx, () => apply(c), untouched(input, () => apply(c)));
  const bind = bindText(ctx, input, (raw) => (str(c.props.type) === "number" ? (raw === "" || !Number.isFinite(Number(raw)) ? raw || null : Number(raw)) : raw));
  reveal.addEventListener("click", () => {
    revealed = !revealed;
    apply(c);
  });
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const type = str(p.type) ?? "text";
    const required = p.required === true;
    link.sync(c, str(p.name), rulesOf(p));
    const error = link.error();
    const protocols = Array.isArray(p.protocols) ? p.protocols.map(String) : undefined;
    const placeholder = str(p.placeholder) ?? (type === "url" ? `${protocols?.[0] ?? "https"}://` : type === "email" ? "name@example.com" : undefined);
    setAttrs(input, {
      name: str(p.name),
      type: type === "password" && revealed ? "text" : INPUT_TYPES.has(type) ? type : "text",
      inputmode: type === "email" ? "email" : type === "url" ? "url" : type === "tel" ? "tel" : type === "number" ? "decimal" : undefined,
      // Generated UI must not collect saved credentials: a password field never asks for autofill.
      autocomplete: type === "email" ? "email" : type === "tel" ? "tel" : type === "url" ? "url" : type === "password" ? "new-password" : undefined,
      placeholder,
      min: num(p.min),
      max: num(p.max),
      minlength: num(p.minLength),
      maxlength: num(p.maxLength),
      required,
      disabled: c.locked,
      "data-locked": flag(c.locked),
      "aria-invalid": error ? "true" : undefined,
      "aria-describedby": error ? `${id}-error` : undefined,
    });
    setAttrs(wrap, { "data-type": type });
    if (type === "password") {
      setAttrs(reveal, { "aria-label": revealed ? "Hide password" : "Show password" });
      syncChildren(reveal, [iconEl(revealed ? "x" : "eye")!]);
      syncChildren(wrap, [input, reveal]);
    } else syncChildren(wrap, [input]);
    bind(c, str(p.value) ?? (typeof p.value === "number" ? String(p.value) : undefined));
    box.set({ label: str(p.label), required, size: str(p.size), hint: str(p.hint), error });
  };
  apply(ctx);
  return {
    el: box.el,
    update(next) {
      apply(next);
      return true;
    },
  };
};

export const TextArea: DomRenderer = (ctx) => {
  const id = nextId();
  const area = h("textarea", { id, class: "gistui-textarea", "data-gistui": "TextArea" });
  area.addEventListener("input", () => (area.dataset.touched = "1"));
  const box = fieldBox(id, area);
  let c = ctx;
  const link = fieldLink(ctx, () => apply(c), untouched(area, () => apply(c)));
  const bind = bindText(ctx, area, (raw) => raw);
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const required = p.required === true;
    link.sync(c, str(p.name), rulesOf(p));
    const error = link.error();
    setAttrs(area, {
      name: str(p.name),
      rows: num(p.rows) ?? 4,
      placeholder: str(p.placeholder),
      minlength: num(p.minLength),
      maxlength: num(p.maxLength),
      required,
      disabled: c.locked,
      "data-locked": flag(c.locked),
      "aria-invalid": error ? "true" : undefined,
      "aria-describedby": error ? `${id}-error` : undefined,
    });
    bind(c, str(p.value));
    box.set({ label: str(p.label), required, size: str(p.size), hint: str(p.hint), error });
  };
  apply(ctx);
  return {
    el: box.el,
    update(next) {
      apply(next);
      return true;
    },
  };
};

/** A native <select>: the fallback for Select (and a plain dropdown before the Zag one loads). */
export const NativeSelect: DomRenderer = (ctx) => {
  const id = nextId();
  const select = h("select", { id, class: "gistui-input", "data-gistui": "Select" });
  const box = fieldBox(id, select);
  let c = ctx;
  const link = fieldLink(ctx, () => apply(c), () => apply(c));
  const put = () => {
    const b = c.binding();
    if (!b.bound) return;
    const v = b.value;
    if (select.multiple) for (const o of Array.from(select.options)) o.selected = Array.isArray(v) && v.map(String).includes(o.value);
    else select.value = v == null ? "" : String(v);
  };
  const binding = bindingLink(ctx, put);
  let optionsKey: string | null = null;
  select.addEventListener("change", () => {
    const b = c.binding();
    if (b.bound) b.set(select.multiple ? Array.from(select.selectedOptions, (o) => o.value) : select.value);
  });
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const multiple = p.multiple === true;
    link.sync(c, str(p.name), { ...rulesOf(p), type: undefined }, multiple ? "list" : "text");
    const error = link.error();
    setAttrs(select, { name: str(p.name), multiple, required: p.required === true, disabled: c.locked });
    const options = Array.isArray(p.options) ? p.options.map(String) : [];
    const placeholder = str(p.placeholder) || "Select…";
    // The options are rebuilt only when they changed (an open native list keeps its place).
    const key = JSON.stringify([multiple, placeholder, options]);
    if (key !== optionsKey) {
      optionsKey = key;
      const opts: Node[] = multiple ? [] : [h("option", { value: "", disabled: true }, placeholder)];
      for (const o of options) opts.push(h("option", null, o));
      const keep = select.value;
      syncChildren(select, opts);
      select.value = keep;
    }
    binding.sync(c);
    put();
    box.set({ label: str(p.label), required: p.required === true, size: str(p.size), hint: str(p.hint), error });
  };
  apply(ctx);
  return {
    el: box.el,
    update(next) {
      apply(next);
      return true;
    },
  };
};

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
function toggle(kind: "checkbox" | "switch", ctx: DomContext) {
  const id = nextId();
  const input = h("input", { type: "checkbox", id, class: "gistui-sr-only", ...(kind === "switch" ? { role: "switch" } : {}) });
  const control = h("span", { "data-scope": kind, "data-part": "control", "aria-hidden": "true" });
  const label = h("span", { "data-scope": kind, "data-part": "label" });
  const root = h("label", { class: kind === "checkbox" ? "gistui-checkbox" : "gistui-switch", "data-gistui": kind === "checkbox" ? "Checkbox" : "Switch", "data-scope": kind, "data-part": "root", for: id }, control, label, input);
  let c = ctx;
  const value = boundValue<boolean>(ctx, (x) => x.props.checked === true, () => paint());
  const checked = () => Boolean(value.get());
  let painted = false;
  const paint = () => {
    const state = checked() ? "checked" : "unchecked";
    // The attribute is the starting state (as React writes it): what a native form reset goes back to.
    if (!painted) setAttrs(input, { checked: checked() });
    painted = true;
    input.checked = checked();
    // The root, the control and a switch's thumb carry the state (not the checkbox's tick).
    for (const e of [root, control, ...Array.from(control.querySelectorAll('[data-part="thumb"]'))]) setAttrs(e, { "data-state": state });
  };
  input.addEventListener("change", () => {
    value.set(input.checked);
    paint();
  });
  input.addEventListener("focus", () => setAttrs(control, { "data-focus-visible": flag(keyboardFocus(input)) }));
  input.addEventListener("blur", () => setAttrs(control, { "data-focus-visible": undefined }));
  return {
    id,
    input,
    control,
    root,
    apply(next: DomContext) {
      c = next;
      setText(label, str(c.props.label) ?? "");
      setAttrs(root, { "data-locked": flag(c.locked), "data-disabled": flag(c.locked) });
      setAttrs(input, { name: str(c.props.name), disabled: c.locked });
      value.sync(c);
      paint();
    },
    /** A form reset: back to the program's `checked` (a bound variable is the program's to reset). */
    reset() {
      value.reset();
      paint();
    },
  };
}

const CHECK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const Checkbox: DomRenderer = (ctx) => {
  const t = toggle("checkbox", ctx);
  t.control.innerHTML = CHECK;
  const el = h("div", { class: "gistui-field" }, t.root);
  let c = ctx;
  const link = fieldLink(ctx, () => apply(c), () => t.reset());
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    link.sync(c, str(p.name), { label: str(p.label), required: p.required === true || undefined, message: str(p.error) }, "bool" as FieldKind);
    const error = link.error();
    t.apply(c);
    setAttrs(t.input, { required: p.required === true, "aria-invalid": error ? "true" : undefined, "aria-describedby": error ? `${t.id}-error` : undefined });
    setAttrs(el, { "data-invalid": mark(error) });
    syncChildren(el, [t.root, ...(error ? [errorLine(`${t.id}-error`, error)] : [])]);
  };
  apply(ctx);
  return {
    el,
    update(next) {
      apply(next);
      return true;
    },
  };
};

export const Switch: DomRenderer = (ctx) => {
  const t = toggle("switch", ctx);
  t.control.append(h("span", { "data-scope": "switch", "data-part": "thumb" }));
  // Registered as a boolean, so the Form reads it as true/false (unregistered, "on" would be read
  // as text and submitted as false).
  const link = fieldLink(ctx, () => {}, () => t.reset());
  const apply = (c: DomContext) => {
    link.sync(c, str(c.props.name), { label: str(c.props.label) }, "bool" as FieldKind);
    t.apply(c);
  };
  apply(ctx);
  return {
    el: t.root,
    update(next) {
      apply(next);
      return true;
    },
  };
};

/**
 * A Button: `do:` runs steps; `opens:` opens a Dialog; `close` closes the dialog it is in; `href`
 * makes it a link. Inside a Form a primary button submits. Elsewhere, a button with none of these
 * sends its label as a message (parity with OpenUI).
 */
export const Button: DomRenderer = (ctx) => {
  let c = ctx;
  const opener = openerState();
  const href0 = safeUrl(ctx.props.href);
  // The element is the button itself, also when it opens a dialog: its parent's styles target it
  // directly (`.gistui-buttons > .gistui-button`, `.gistui-row:has(> .gistui-button)`).
  const btn: HTMLAnchorElement | HTMLButtonElement = href0 ? h("a", { target: "_blank", rel: "noopener noreferrer" }) : h("button");
  btn.className = "gistui-button";
  setAttrs(btn, { "data-gistui": "Button" });
  // The Dialog it opens (`opens:`) is rendered but placed nowhere by the button: while it is open,
  // the dialog puts itself at the GistUI root, finding it (and its section's presets) from here.
  opener.anchor = () => btn;
  // A link is a plain link (as in React): it runs no steps, sends nothing and closes nothing.
  if (!href0) {
    btn.addEventListener("click", () => {
      const p = c.props;
      const steps = c.node.dyn?.do;
      const opens = p.opens && typeof p.opens === "object";
      if (p.close === true) c.consume<OverlayHandle>(OVERLAY)?.close();
      if (str(p.type) === "draft") c.consume<FormController>(FORM)?.saveDraft?.();
      if (opens) return opener.setOpen(true);
      if (steps) return c.run(steps);
      const type = (btn as HTMLButtonElement).type;
      if (type !== "button" || inForm(c) || p.close === true) return;
      c.emit({ type: "send", message: str(p.label) ?? "", nodeId: c.node.id });
    });
  }
  let content: string | null = null;
  const apply = (next: DomContext) => {
    c = next;
    const p = c.props;
    const label = str(p.label) ?? "";
    const icon = str(p.icon);
    const href = safeUrl(p.href);
    const iconOnly = p.iconOnly === true;
    const v = str(p.v) ?? "primary";
    setAttrs(btn, {
      "data-v": v,
      "data-size": str(p.size),
      "data-full": flag(p.full === true),
      "data-icon-only": flag(iconOnly),
      // An icon button (or a bare swatch) keeps its label as the accessible name and tooltip.
      "aria-label": iconOnly ? label : undefined,
      title: iconOnly ? label : undefined,
    });
    c.design(btn);
    // Icon and label are built again only when they changed.
    const shown = JSON.stringify([label, icon, iconOnly, Boolean(href)]);
    if (shown !== content) {
      content = shown;
      const iconNode = icon ? iconEl(icon) : null;
      syncChildren(btn, iconOnly ? (iconNode ? [iconNode] : []) : [...(iconNode ? [iconNode] : []), document.createTextNode(label), ...(href && !icon ? [iconEl("arrow-up-right")!] : [])]);
    }
    if (btn instanceof HTMLAnchorElement) {
      setAttrs(btn, { href });
      return;
    }
    const steps = c.node.dyn?.do;
    const opens = p.opens && typeof p.opens === "object" ? (p.opens as NodeRef) : undefined;
    const form = inForm(c);
    const explicit = str(p.type);
    const draft = explicit === "draft" && form;
    // A draft button is not a submit button: Enter in a field must submit the form, not save a draft.
    const type = explicit === "submit" || explicit === "reset" ? explicit : !explicit && form && !steps && !opens && p.close !== true && (v === "primary" || v === "accent") ? "submit" : "button";
    setAttrs(btn, {
      type,
      "data-draft": draft ? "" : undefined,
      disabled: c.locked || p.disabled === true,
      "data-locked": flag(c.locked),
      "aria-haspopup": opens ? "dialog" : undefined,
    });
    if (opens) {
      c.provide(OPENER, opener);
      c.renderNode(opens, "opens");
    }
  };
  apply(ctx);
  return {
    el: btn,
    update(next) {
      if (Boolean(safeUrl(next.props.href)) !== (btn instanceof HTMLAnchorElement)) return false;
      apply(next);
      return true;
    },
  };
};

export const Buttons: DomRenderer = (ctx) => {
  const el = h("div", { class: "gistui-buttons", "data-gistui": "Buttons" });
  const apply = (c: DomContext) => {
    setAttrs(el, { "data-align": str(c.props.align) });
    c.place(el);
  };
  apply(ctx);
  return {
    el,
    update(c) {
      apply(c);
      return true;
    },
  };
};
