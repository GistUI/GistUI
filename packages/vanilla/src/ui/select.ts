/** Select on Zag's select machine (vanilla): the same markup, behaviour and ARIA as `@gistui/react`. */

import * as select from "@zag-js/select";
import { normalizeProps, VanillaMachine } from "@zag-js/vanilla";
import { h, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag, mark } from "./attrs";
import { boundValue, errorLine, fieldLink } from "./form";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { initialChoice, listOf, propsChanged, uniqueOptions, zagId, zagParts } from "./zag";

export const Select: DomRenderer = (ctx) => {
  let c = ctx;
  const id = zagId("select");
  // An option listed twice shows once: a value is a key, and can be chosen only once.
  const options = () => uniqueOptions(c.props.options);
  // The bound `$var`, or the select's own choice: the program's `value:` (options that exist) until
  // the user picks, and again after a form reset.
  const value = boundValue<string[]>(ctx, (x) => initialChoice(x.props), () => propsChanged(machine, machineProps));
  let collectionKey = "";
  let collection = select.collection<string>({ items: [], itemToString: (x) => x, itemToValue: (x) => x });
  const machineProps = () => {
    const key = options().join("\u0000");
    if (key !== collectionKey) {
      collectionKey = key;
      collection = select.collection<string>({ items: options(), itemToString: (x) => x, itemToValue: (x) => x });
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
      // Inside the themed tree (no portal) so it inherits theme tokens; `fixed` escapes clipping.
      positioning: { sameWidth: true, gutter: 6, strategy: "fixed" as const },
    };
  };
  const machine = new VanillaMachine(select.machine, machineProps);
  machine.start();

  const parts = zagParts();
  const root = h("div", { class: "gistui-field gistui-select", "data-gistui": "Select" });
  const label = h("label", { class: "gistui-field__label" });
  const control = h("div");
  const valueText = h("span");
  const indicator = h("span", { "aria-hidden": "true" }, iconEl("chevron-down"));
  const trigger = h("button", { type: "button" }, valueText, indicator);
  control.append(trigger);
  const hidden = h("select");
  const positioner = h("div");
  const content = h("ul", { class: "gistui-popover" });
  positioner.append(content);
  const hint = h("span", { class: "gistui-field__hint" });
  const link = fieldLink(
    ctx,
    () => draw(),
    // A form reset: back to the program's `value:` (a bound variable is the program's to reset).
    () => {
      value.reset();
      propsChanged(machine, machineProps);
    },
  );
  // Options keep their elements (by value): opening the list or moving over it patches attributes.
  interface Option {
    li: HTMLLIElement;
    text: HTMLSpanElement;
    check: HTMLSpanElement;
  }
  const rows = keep<Option>();
  let hiddenKey: string | null = null;

  const draw = () => {
    const api = select.connect(machine.service, normalizeProps);
    const p = c.props;
    link.sync(c, str(p.name), { label: str(p.label), required: p.required === true || undefined, message: str(p.error) }, p.multiple === true ? "list" : "text");
    const error = link.error();
    const errorId = `${id}-error`;
    parts.spread(root, api.getRootProps());
    setAttrs(root, { "data-size": str(p.size), "data-invalid": mark(error) });
    parts.spread(label, api.getLabelProps());
    setAttrs(label, { "data-required": flag(p.required === true) });
    setText(label, str(p.label) ?? "");
    parts.spread(control, api.getControlProps());
    parts.spread(trigger, api.getTriggerProps());
    setAttrs(trigger, { "data-locked": flag(c.locked), "aria-invalid": flag(error), "aria-describedby": error ? errorId : undefined });
    parts.spread(valueText, api.getValueTextProps());
    setText(valueText, api.valueAsString || str(p.placeholder) || "Select…");
    parts.spread(indicator, api.getIndicatorProps());
    // The hidden native select carries the value into the form (FormData, validation, submit).
    const hiddenProps = api.getHiddenSelectProps();
    parts.spread(hidden, hiddenProps);
    const items = options();
    const key = `${p.multiple === true}\u0000${items.join("\u0000")}`;
    if (key !== hiddenKey) {
      hiddenKey = key;
      syncChildren(hidden, [...(p.multiple === true ? [] : [h("option", { value: "" })]), ...items.map((o) => h("option", { value: o }, o))]);
    }
    for (const o of Array.from(hidden.options)) {
      const on = api.value.includes(o.value);
      if (o.selected !== on) o.selected = on;
    }
    parts.spread(positioner, api.getPositionerProps());
    parts.spread(content, api.getContentProps());
    syncChildren(
      content,
      items.map((item) => {
        const row = rows.get(item, () => {
          const text = h("span", null, item);
          const check = h("span", { class: "gistui-option__check", "aria-hidden": "true" }, iconEl("check"));
          return { li: h("li", { class: "gistui-option" }, text, check), text, check };
        });
        parts.spread(row.li, api.getItemProps({ item }));
        parts.spread(row.text, api.getItemTextProps({ item }));
        parts.spread(row.check, api.getItemIndicatorProps({ item }));
        return row.li;
      }),
    );
    rows.prune((row) => parts.forget(row.li, row.text, row.check));
    setText(hint, str(p.hint) ?? "");
    const tail = error ? [errorLine(errorId, error)] : str(p.hint) ? [hint] : [];
    syncChildren(root, [label, control, hidden, ...tail, positioner]);
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
