/**
 * Choices, as in `@gistui/react`: RadioGroup (Zag radio-group), CheckboxGroup (native checkboxes),
 * TagInput (free tags). Groups share one option layout: list, cards (icon or image, hint, a corner
 * indicator), segmented bar (radio) or chips (checkbox); sm/md/lg sizes; `cols` for card grids.
 *
 * Options, tags and suggestions keep their elements between draws (by value) and are patched, so the
 * focused radio or checkbox is still there after the redraw its own focus or change caused.
 */

import { isEmail, isUrl } from "@gistui/headless";
import { safeUrl } from "@gistui/headless/url";
import * as radio from "@zag-js/radio-group";
import { normalizeProps, VanillaMachine } from "@zag-js/vanilla";
import { h, num, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag, mark } from "./attrs";
import { NO_REFERRER } from "./content";
import { boundValue, errorLine, fieldLink } from "./form";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { propsChanged, zagId, zagParts } from "./zag";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
/** Without repeats: a value is a key and a form value, so it can appear only once. */
const unique = (xs: string[]): string[] => (new Set(xs).size === xs.length ? xs : [...new Set(xs)]);
/** Each option once, with the position it was first listed at (which keeps its hint, icon and image). */
const optionsOf = (p: Readonly<Record<string, unknown>>): [string, number][] => {
  const all = strings(p.options);
  return all.map((opt, i): [string, number] => [opt, i]).filter(([opt, i]) => all.indexOf(opt) === i);
};

interface OptionMeta {
  hint?: string | undefined;
  icon?: string | undefined;
  image?: string | undefined;
}
const metaOf = (p: Readonly<Record<string, unknown>>, i: number): OptionMeta => ({ hint: strings(p.hints)[i], icon: strings(p.icons)[i], image: safeUrl(strings(p.images)[i]) });
const colsStyle = (p: Readonly<Record<string, unknown>>, el: HTMLElement) => {
  const cols = num(p.cols);
  if (cols) el.style.setProperty("--gistui-choice-cols", String(Math.max(1, Math.min(6, Math.round(cols)))));
  else el.style.removeProperty("--gistui-choice-cols");
};

/** Title, hint and optional media of one option (shared by both groups). */
function optionBody(title: string, meta: OptionMeta, card: boolean): Node[] {
  const out: Node[] = [];
  if (card && meta.image) out.push(h("span", { class: "gistui-choice__media" }, h("img", { src: meta.image, alt: "", loading: "lazy", decoding: "async", ...NO_REFERRER })));
  if (card && !meta.image && meta.icon) out.push(h("span", { class: "gistui-choice__icon" }, iconEl(meta.icon)));
  const text = h("span", { class: "gistui-choice__text" }, h("span", { class: "gistui-choice__title" }, !card && meta.icon ? iconEl(meta.icon) : null, title));
  if (meta.hint) text.append(h("span", { class: "gistui-choice__hint" }, meta.hint));
  out.push(text);
  return out;
}

/** The field around a group: label, the group, then an error or a hint. */
function groupShell(kind: "RadioGroup" | "CheckboxGroup") {
  const el = h("div", { class: "gistui-field", "data-gistui": kind });
  const label = h("span", { class: "gistui-field__label" });
  const hint = h("span", { class: "gistui-field__hint" });
  return {
    el,
    label,
    /** `errorId` is the error line's id: the group points at it with `aria-describedby`. */
    set(p: Readonly<Record<string, unknown>>, group: Node, error: string | undefined, errorId: string) {
      setAttrs(el, { "data-size": str(p.size), "data-invalid": mark(error) });
      setAttrs(label, { "data-required": flag(p.required === true) });
      setText(label, str(p.label) ?? "");
      setText(hint, str(p.hint) ?? "");
      const tail = error ? [errorLine(errorId, error)] : str(p.hint) ? [hint] : [];
      syncChildren(el, [...(str(p.label) ? [label] : []), group, ...tail]);
    },
  };
}

export const RadioGroup: DomRenderer = (ctx) => {
  let c = ctx;
  const id = zagId("radio");
  const v = () => str(c.props.v) ?? "list";
  // The machine's value is always given: the bound `$var`, or the group's own (see `boundValue`).
  const machineProps = () => {
    const now = value.get();
    return {
      id,
      name: str(c.props.name),
      value: now == null || now === "" ? null : String(now),
      onValueChange: (d: { value: string | null }) => {
        value.set(d.value);
        if (!value.bound) propsChanged(machine, machineProps);
      },
      disabled: c.locked,
      orientation: (v() === "segmented" || str(c.props.dir) === "row" ? "horizontal" : "vertical") as "horizontal" | "vertical",
    };
  };
  // The bound variable changed elsewhere (`@set`, another control): the machine reads it again.
  const value = boundValue<string | null>(ctx, (x) => str(x.props.value) ?? null, () => propsChanged(machine, machineProps));
  const machine = new VanillaMachine(radio.machine, machineProps);
  // Started once the group is in the page (it is drawn first, as Zag's vanilla examples do): the
  // machine looks its elements up when it starts, to place the segmented thumb on the chosen option.
  let dead = false;
  queueMicrotask(() => {
    if (!dead) machine.start();
  });
  const parts = zagParts();
  const shell = groupShell("RadioGroup");
  const group = h("div", { class: "gistui-choice", "data-type": "radio" });
  const thumb = h("div", { class: "gistui-radio__thumb" });
  interface Option {
    item: HTMLLabelElement;
    control: HTMLSpanElement;
    body: HTMLSpanElement;
    input: HTMLInputElement;
    /** What the body shows (title, hint, icon or image): rebuilt only when it changes. */
    shown: string;
  }
  const options = keep<Option>();
  const link = fieldLink(
    ctx,
    () => draw(),
    // A form reset: back to the program's value (a bound variable is the program's to reset).
    () => {
      value.reset();
      propsChanged(machine, machineProps);
    },
  );
  const draw = () => {
    const api = radio.connect(machine.service, normalizeProps);
    const p = c.props;
    const kind = v();
    const card = kind === "cards";
    const segmented = kind === "segmented";
    link.sync(c, str(p.name), { label: str(p.label), required: p.required === true || undefined, message: str(p.error) });
    const error = link.error();
    const errorId = `${id}-error`;
    parts.spread(shell.label, api.getLabelProps());
    // Zag's own inline style (position) is left out, as in React, where the group's style replaces it.
    const { style: _style, ...rootProps } = api.getRootProps() as Record<string, unknown>;
    parts.spread(group, rootProps);
    setAttrs(group, { class: "gistui-choice", "data-type": "radio", "data-v": kind, "data-dir": str(p.dir), "data-locked": flag(c.locked), "aria-invalid": flag(error), "aria-describedby": error ? errorId : undefined });
    colsStyle(p, group);
    const items: Node[] = [];
    if (segmented) {
      parts.spread(thumb, api.getIndicatorProps());
      items.push(thumb);
    } else parts.forget(thumb);
    // An option listed twice shows once (its first position keeps its hint, icon and image).
    optionsOf(p).forEach(([opt, i]) => {
      const o = options.get(opt, () => ({
        item: h("label", { class: "gistui-choice__item" }),
        control: h("span", { class: "gistui-choice__control", "data-type": "radio" }),
        body: h("span", { class: "gistui-choice__body" }),
        input: h("input"),
        shown: "",
      }));
      parts.spread(o.item, api.getItemProps({ value: opt }));
      if (segmented) parts.forget(o.control);
      else parts.spread(o.control, api.getItemControlProps({ value: opt }));
      const meta = segmented ? { icon: metaOf(p, i).icon } : metaOf(p, i);
      const shown = JSON.stringify([opt, meta, card]);
      if (shown !== o.shown) {
        o.shown = shown;
        syncChildren(o.body, optionBody(opt, meta, card));
      }
      parts.spread(o.body, api.getItemTextProps({ value: opt }));
      parts.spread(o.input, api.getItemHiddenInputProps({ value: opt }));
      // The attribute too (React's `defaultChecked`): what a native form reset goes back to.
      setAttrs(o.input, { checked: o.input.checked });
      syncChildren(o.item, segmented ? [o.body, o.input] : [o.control, o.body, o.input]);
      items.push(o.item);
    });
    options.prune((o) => parts.forget(o.item, o.control, o.body, o.input));
    syncChildren(group, items);
    shell.set(p, group, error, errorId);
  };
  const off = machine.subscribe(() => draw());
  draw();
  return {
    el: shell.el,
    update(next: DomContext) {
      c = next;
      value.sync(c);
      // Publishes to the subscription above, which draws.
      propsChanged(machine, machineProps);
      return true;
    },
    destroy() {
      dead = true;
      off();
      parts.clear();
      machine.stop();
    },
  };
};

const CHECK = '<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let groupSeq = 0;

/** Pick many. Native checkboxes underneath, so forms submit and keyboards work as usual. */
export const CheckboxGroup: DomRenderer = (ctx) => {
  let c = ctx;
  const uid = `gistui-checks-${++groupSeq}`;
  const errorId = `${uid}-error`;
  const labelId = `${uid}-label`;
  const shell = groupShell("CheckboxGroup");
  setAttrs(shell.label, { id: labelId });
  const group = h("div", { class: "gistui-choice", "data-type": "checkbox", role: "group" });
  const value = boundValue<string[]>(ctx, (x) => strings(x.props.value), () => draw());
  const link = fieldLink(
    ctx,
    () => draw(),
    () => {
      value.reset();
      draw();
    },
  );
  interface Option {
    label: HTMLLabelElement;
    input: HTMLInputElement;
    control: HTMLSpanElement;
    tick: Element;
    body: HTMLSpanElement;
    shown: string;
  }
  const options = keep<Option>();
  const picked = (): Set<string> => new Set(strings(value.get()));
  const toggle = (opt: string) => {
    const max = num(c.props.max);
    const next = picked();
    if (next.has(opt)) next.delete(opt);
    else if (!max || next.size < max) next.add(opt);
    value.set([...next]);
    draw();
  };
  const draw = () => {
    const p = c.props;
    const kind = str(p.v) ?? "list";
    const card = kind === "cards";
    const chips = kind === "chips";
    const max = num(p.max);
    const name = str(p.name);
    link.sync(c, name, { label: str(p.label), required: p.required === true || undefined, minLength: num(p.min), maxLength: max, message: str(p.error) }, "list");
    const error = link.error();
    // Named by its label, and pointing at its error line.
    setAttrs(group, { "data-v": kind, "data-dir": str(p.dir), "data-locked": flag(c.locked), "aria-labelledby": str(p.label) ? labelId : undefined, "aria-describedby": error ? errorId : undefined });
    colsStyle(p, group);
    const on = picked();
    const items: Node[] = [];
    // An option listed twice shows once (its first position keeps its hint, icon and image).
    optionsOf(p).forEach(([opt, i]) => {
      const o = options.get(opt, () => {
        const input = h("input", { type: "checkbox", class: "gistui-sr-only" });
        input.addEventListener("change", () => toggle(opt));
        const control = h("span", { class: "gistui-choice__control", "data-type": "checkbox" });
        control.innerHTML = CHECK;
        return { label: h("label", { class: "gistui-choice__item" }, input), input, control, tick: iconEl("check")!, body: h("span", { class: "gistui-choice__body" }), shown: "" };
      });
      const checked = on.has(opt);
      const full = Boolean(max && !checked && on.size >= max);
      const state = checked ? "checked" : "unchecked";
      // The attribute is the starting state (as React writes it): what a native form reset goes back to.
      if (!o.shown) setAttrs(o.input, { checked });
      setAttrs(o.input, { name, value: opt, disabled: c.locked || full, "aria-invalid": flag(error) });
      if (o.input.checked !== checked) o.input.checked = checked;
      setAttrs(o.label, { "data-state": state, "data-disabled": flag(c.locked || full) });
      setAttrs(o.control, { "data-state": state, "aria-hidden": "true" });
      const meta = chips ? { icon: metaOf(p, i).icon } : metaOf(p, i);
      const shown = JSON.stringify([opt, meta, card]);
      if (shown !== o.shown) {
        o.shown = shown;
        syncChildren(o.body, optionBody(opt, meta, card));
      }
      syncChildren(o.label, [o.input, ...(chips ? (checked ? [o.tick] : []) : [o.control]), o.body]);
      items.push(o.label);
    });
    options.prune();
    syncChildren(group, items);
    shell.set(p, group, error, errorId);
  };
  draw();
  return {
    el: shell.el,
    update(next) {
      c = next;
      value.sync(c);
      draw();
      return true;
    },
  };
};

let tagSeq = 0;

/** Free-form tags: Enter or comma adds, Backspace on an empty field removes the last, suggestions below. */
export const TagInput: DomRenderer = (ctx) => {
  let c = ctx;
  const id = `gistui-tags-${++tagSeq}`;
  let bad: string | null = null;
  const el = h("div", { class: "gistui-field", "data-gistui": "TagInput" });
  const label = h("label", { class: "gistui-field__label", for: id });
  const input = h("input", { id, class: "gistui-taginput__input" });
  const box = h("div", { class: "gistui-taginput" });
  const suggest = h("div", { class: "gistui-taginput__suggest", "aria-label": "Suggestions" });
  const hint = h("span", { class: "gistui-field__hint" });
  box.addEventListener("click", () => input.focus());
  const value = boundValue<string[]>(ctx, (x) => strings(x.props.value), () => draw());
  const link = fieldLink(
    ctx,
    () => draw(),
    () => {
      value.reset();
      input.value = "";
      bad = null;
      draw();
    },
  );
  const chips = keep<{ el: HTMLSpanElement; remove: HTMLButtonElement }>();
  const hiddens = keep<HTMLInputElement>();
  const suggestions = keep<HTMLButtonElement>();
  const tags = (): string[] => unique(strings(value.get()));
  const setTags = (next: string[]) => {
    value.set(next);
    draw();
    // Tags change without a native input event: announce it, so the form can re-validate.
    box.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    const cur = tags();
    const max = num(c.props.max);
    const kind = str(c.props.type);
    input.value = "";
    if (!t || cur.includes(t)) return draw();
    if (max && cur.length >= max) bad = `You can add up to ${max}`;
    // Typed tags (emails, URLs) are checked before they become a chip.
    else if (kind === "email" && !isEmail(t)) bad = `"${t}" is not a valid email address`;
    else if (kind === "url" && !isUrl(t)) bad = `"${t}" is not a valid URL (http:// or https://)`;
    else {
      bad = null;
      return setTags([...cur, t]);
    }
    input.value = t;
    draw();
  };
  input.addEventListener("input", () => {
    bad = null;
    if (input.value.endsWith(",")) add(input.value);
    else draw();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input.value);
    } else if (e.key === "Backspace" && !input.value && tags().length) setTags(tags().slice(0, -1));
  });
  input.addEventListener("blur", () => {
    if (input.value) add(input.value);
  });
  const draw = () => {
    const p = c.props;
    const name = str(p.name);
    const kind = str(p.type);
    const max = num(p.max);
    const lbl = str(p.label);
    link.sync(c, name, { label: lbl, required: p.required === true || undefined, minLength: num(p.min), maxLength: max, message: str(p.error), requiredMessage: `Add at least one ${kind === "email" ? "email address" : kind === "url" ? "URL" : "item"}` }, "list");
    const error = bad ?? link.error();
    const cur = tags();
    setAttrs(el, { "data-size": str(p.size), "data-invalid": mark(error) });
    setAttrs(box, { "data-field": name, "data-locked": flag(c.locked) });
    setAttrs(label, { "data-required": flag(p.required === true) });
    setText(label, lbl ?? "");
    setAttrs(input, { value: input.value, disabled: c.locked, placeholder: cur.length ? "" : (str(p.placeholder) ?? "Type and press Enter"), inputmode: kind === "email" ? "email" : kind === "url" ? "url" : undefined, "aria-invalid": flag(error), "aria-describedby": error ? `${id}-error` : undefined });
    const chipEls = cur.map((t) => {
      const chip = chips.get(t, () => {
        const remove = h("button", { type: "button", class: "gistui-combobox__remove", "aria-label": `Remove ${t}` }, iconEl("x"));
        remove.addEventListener("click", (e) => {
          e.stopPropagation();
          setTags(tags().filter((x) => x !== t));
        });
        return { el: h("span", { class: "gistui-tag", "data-shape": "pill", "data-tone": "accent" }, t, remove), remove };
      });
      setAttrs(chip.remove, { disabled: c.locked });
      return chip.el;
    });
    chips.prune();
    const hiddenEls = name ? cur.map((t) => setAttrsOf(hiddens.get(t, () => h("input", { type: "hidden" })), { name, value: t })) : [];
    hiddens.prune();
    syncChildren(box, [...chipEls, input, ...hiddenEls]);
    const q = input.value.trim().toLowerCase();
    const matches = unique(strings(p.options)).filter((o) => !cur.includes(o) && o.toLowerCase().includes(q));
    syncChildren(
      suggest,
      matches.slice(0, 8).map((s) => {
        const b = suggestions.get(s, () => {
          const made = h("button", { type: "button", class: "gistui-chip" }, iconEl("plus"), s);
          made.addEventListener("click", () => add(s));
          return made;
        });
        setAttrs(b, { disabled: c.locked });
        return b;
      }),
    );
    suggestions.prune();
    setText(hint, str(p.hint) ?? "");
    const tail = error ? [errorLine(`${id}-error`, error)] : str(p.hint) ? [hint] : [];
    syncChildren(el, [...(lbl ? [label] : []), box, ...(matches.length ? [suggest] : []), ...tail]);
  };
  draw();
  return {
    el,
    update(next) {
      c = next;
      value.sync(c);
      draw();
      return true;
    },
  };
};

/** `setAttrs`, returning the element (to patch a kept element inside a `map`). */
function setAttrsOf<E extends Element>(el: E, attrs: Parameters<typeof setAttrs>[1]): E {
  setAttrs(el, attrs);
  return el;
}
