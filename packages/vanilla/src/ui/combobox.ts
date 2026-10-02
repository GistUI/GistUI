/** Combobox (searchable select) on Zag's combobox machine (vanilla), as in `@gistui/react`. */

import * as combobox from "@zag-js/combobox";
import { normalizeProps, VanillaMachine } from "@zag-js/vanilla";
import { h, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag, mark } from "./attrs";
import { boundValue, errorLine, fieldLink } from "./form";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { initialChoice, listOf, propsChanged, uniqueOptions, zagId, zagParts } from "./zag";

export const Combobox: DomRenderer = (ctx) => {
  let c = ctx;
  const id = zagId("combobox");
  let query = "";
  // An option listed twice shows once: a value is a key, and can be chosen only once.
  const options = () => uniqueOptions(c.props.options);
  // The bound `$var`, or the combobox's own choice: the program's `value:` (options that exist)
  // until the user picks, and again after a form reset.
  const value = boundValue<string[]>(ctx, (x) => initialChoice(x.props), () => propsChanged(machine, machineProps));
  const shown = () => {
    const q = query.trim().toLowerCase();
    return q ? options().filter((o) => o.toLowerCase().includes(q)) : options();
  };
  let key = "";
  let collection = combobox.collection<string>({ items: [], itemToString: (x) => x, itemToValue: (x) => x });
  const machineProps = () => {
    const items = shown();
    const k = items.join("\u0000");
    if (k !== key) {
      key = k;
      collection = combobox.collection<string>({ items, itemToString: (x) => x, itemToValue: (x) => x });
    }
    const multiple = c.props.multiple === true;
    return {
      id,
      collection,
      name: str(c.props.name),
      multiple,
      value: listOf(value.get()),
      onValueChange: (d: { value: string[] }) => {
        if (value.bound) c.binding().set(multiple ? d.value : (d.value[0] ?? null));
        else {
          value.set(d.value);
          propsChanged(machine, machineProps);
        }
      },
      disabled: c.locked,
      openOnClick: true,
      inputBehavior: "autohighlight" as const,
      selectionBehavior: (multiple ? "clear" : "replace") as "clear" | "replace",
      // Inside the themed tree (no portal), so it inherits the theme; `fixed` escapes clipping.
      positioning: { sameWidth: true, gutter: 6, strategy: "fixed" as const },
      onInputValueChange: (d: { inputValue: string }) => {
        query = d.inputValue;
        propsChanged(machine, machineProps);
      },
      onOpenChange: (d: { open: boolean }) => {
        if (!d.open) {
          query = "";
          propsChanged(machine, machineProps);
        }
      },
    };
  };
  const machine: VanillaMachine<any> = new VanillaMachine(combobox.machine, machineProps);
  machine.start();
  const parts = zagParts();
  const root = h("div", { class: "gistui-field gistui-combobox", "data-gistui": "Combobox" });
  const label = h("label", { class: "gistui-field__label" });
  const chips = h("div", { class: "gistui-combobox__chips" });
  const control = h("div", { class: "gistui-combobox__control" });
  const input = h("input", { class: "gistui-input" });
  const trigger = h("button", { type: "button", class: "gistui-combobox__trigger" }, iconEl("chevron-down"));
  const searchIcon = iconEl("search", "gistui-combobox__search");
  const positioner = h("div");
  const content = h("ul", { class: "gistui-popover" });
  positioner.append(content);
  const hint = h("span", { class: "gistui-field__hint" });
  const connect = () => combobox.connect(machine.service, normalizeProps);
  const link = fieldLink(
    ctx,
    () => draw(),
    // A form reset: back to the program's `value:` (a bound variable is the program's to reset).
    // What was typed to filter the list is forgotten with it.
    () => {
      value.reset();
      query = "";
      propsChanged(machine, machineProps);
    },
  );
  // Options, chips and form values keep their elements (by value) and are patched.
  const rows = keep<{ li: HTMLLIElement; text: HTMLSpanElement; check: HTMLSpanElement }>();
  const picked = keep<HTMLSpanElement>();
  const hiddenInputs = keep<HTMLInputElement>();
  const empty = h("li", { class: "gistui-option", "data-empty": "" }, "No matches");
  let lastValue = "";

  const draw = () => {
    const api = connect();
    const p = c.props;
    const multiple = p.multiple === true;
    const name = str(p.name);
    link.sync(c, name, { label: str(p.label), required: p.required === true || undefined, message: str(p.error) }, multiple ? "list" : "text");
    const error = link.error();
    const errorId = `${id}-error`;
    parts.spread(root, api.getRootProps());
    setAttrs(root, { class: "gistui-field gistui-combobox", "data-size": str(p.size), "data-invalid": mark(error) });
    parts.spread(label, api.getLabelProps());
    setAttrs(label, { "data-required": flag(p.required === true) });
    setText(label, str(p.label) ?? "");
    parts.spread(control, api.getControlProps());
    setAttrs(control, { class: "gistui-combobox__control", "data-field": name });
    parts.spread(input, api.getInputProps());
    setAttrs(input, { class: "gistui-input", placeholder: str(p.placeholder) ?? "Search…", "data-locked": flag(c.locked), name: undefined, "aria-invalid": flag(error), "aria-describedby": error ? errorId : undefined, value: input.value });
    parts.spread(trigger, api.getTriggerProps());
    setAttrs(trigger, { class: "gistui-combobox__trigger" });
    // The chosen values, for the form (the visible input holds the search text).
    const hiddens = name
      ? api.value.map((v: string) => {
          const hidden = hiddenInputs.get(v, () => h("input", { type: "hidden" }));
          setAttrs(hidden, { name, value: v });
          return hidden;
        })
      : [];
    hiddenInputs.prune();
    syncChildren(control, [...(searchIcon ? [searchIcon] : []), input, ...hiddens, trigger]);
    syncChildren(
      chips,
      multiple
        ? api.value.map((v: string) =>
            picked.get(v, () => {
              const remove = h("button", { type: "button", class: "gistui-combobox__remove", "aria-label": `Remove ${v}` }, iconEl("x"));
              remove.addEventListener("click", () => {
                const now = connect();
                now.setValue(now.value.filter((x: string) => x !== v));
              });
              return h("span", { class: "gistui-tag", "data-shape": "pill", "data-tone": "accent" }, v, remove);
            }),
          )
        : [],
    );
    picked.prune();
    parts.spread(positioner, api.getPositionerProps());
    parts.spread(content, api.getContentProps());
    setAttrs(content, { class: "gistui-popover" });
    const items = shown();
    syncChildren(
      content,
      items.length
        ? items.map((item) => {
            const row = rows.get(item, () => {
              const text = h("span", null, item);
              const check = h("span", { class: "gistui-option__check" }, iconEl("check"));
              return { li: h("li", { class: "gistui-option" }, text, check), text, check };
            });
            parts.spread(row.li, api.getItemProps({ item }));
            setAttrs(row.li, { class: "gistui-option" });
            parts.spread(row.text, api.getItemTextProps({ item }));
            parts.spread(row.check, api.getItemIndicatorProps({ item }));
            setAttrs(row.check, { class: "gistui-option__check" });
            return row.li;
          })
        : [empty],
    );
    // Options filtered out are let go, with the listeners they held.
    rows.prune((row) => parts.forget(row.li, row.text, row.check));
    setText(hint, str(p.hint) ?? "");
    const tail = error ? [errorLine(errorId, error)] : str(p.hint) ? [hint] : [];
    syncChildren(root, [label, ...(multiple && api.value.length ? [chips] : []), control, positioner, ...tail]);
    const value = api.value.join("\u0000");
    if (value !== lastValue) {
      const first = lastValue === "" && !api.value.length;
      lastValue = value;
      // The value changed without a native input event: announce it, so the form can re-validate.
      if (!first) control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const off = machine.subscribe(() => draw());
  draw();
  return {
    el: root,
    update(next: DomContext) {
      c = next;
      value.sync(c);
      // Publishes to the subscription above, which draws.
      propsChanged(machine, machineProps);
      return true;
    },
    destroy() {
      off();
      parts.clear();
      machine.stop();
    },
  };
};
