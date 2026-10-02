import * as combobox from "@zag-js/combobox";
import { normalizeProps, useMachine } from "@zag-js/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocked } from "../context";
import { str, useBinding } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { FieldError, useField, useFormResets, useOwnValue } from "./form";
import { initialChoice } from "./select";

export function ComboboxImpl({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  // An option listed twice shows once: a value is a key, and can be chosen only once.
  const options = useMemo(() => (Array.isArray(props.options) ? [...new Set(props.options.map(String))] : []), [props.options]);
  // What was typed filters the list. A form reset forgets it in the same render that brings the
  // initial choice back, so the list (and the input's text, which Zag reads from it) has that option.
  const resets = useFormResets();
  const [typed, setTyped] = useState({ text: "", resets });
  const query = typed.resets === resets ? typed.text : "";
  const setQuery = (text: string) => setTyped({ text, resets });
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const collection = useMemo(() => combobox.collection({ items: shown, itemToString: (x) => x, itemToValue: (x) => x }), [shown]);
  const multiple = props.multiple === true;
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  // Unbound: the program's `value:` until the user picks, and again after a form reset (the hidden
  // inputs are rendered from it, so the browser cannot reset them).
  const [own, setOwn] = useOwnValue<string[]>(initialChoice(props, options));
  const service = useMachine(combobox.machine, {
    id: uid,
    collection,
    name: str(props.name),
    multiple,
    ...(b.bound
      ? {
          value: Array.isArray(b.value) ? b.value.map(String) : b.value == null || b.value === "" ? [] : [String(b.value)],
          onValueChange: (d: { value: string[] }) => b.set(multiple ? d.value : (d.value[0] ?? null)),
        }
      : { value: own, onValueChange: (d: { value: string[] }) => setOwn(d.value) }),
    disabled: locked,
    openOnClick: true,
    inputBehavior: "autohighlight",
    selectionBehavior: multiple ? "clear" : "replace",
    // Inside the themed tree (no portal), so it inherits the theme; `fixed` escapes clipping.
    positioning: { sameWidth: true, gutter: 6, strategy: "fixed" },
    onInputValueChange: (d) => setQuery(d.inputValue),
    onOpenChange: (d) => {
      if (!d.open) setQuery("");
    },
  });
  const api = combobox.connect(service, normalizeProps);
  const control = useRef<HTMLDivElement>(null);
  const valueKey = api.value.join("\u0000");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    control.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [valueKey]);
  const hint = str(props.hint);
  const name = str(props.name);
  const error = useField(name, { label: str(props.label), required: props.required === true || undefined, message: str(props.error) }, multiple ? "list" : "text");
  return (
    // `data-invalid` after Zag's root props, which carry their own (always unset here).
    <div className="gistui-field gistui-combobox" data-gistui="Combobox" data-size={str(props.size)} {...api.getRootProps()} data-invalid={error ? "" : undefined}>
      <label className="gistui-field__label" {...api.getLabelProps()} data-required={props.required === true || undefined}>
        {str(props.label)}
      </label>
      {multiple && api.value.length > 0 && (
        <div className="gistui-combobox__chips">
          {api.value.map((v) => (
            <span key={v} className="gistui-tag" data-shape="pill" data-tone="accent">
              {v}
              <button type="button" className="gistui-combobox__remove" aria-label={`Remove ${v}`} onClick={() => api.setValue(api.value.filter((x) => x !== v))}>
                <IconSvg name="x" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="gistui-combobox__control" {...api.getControlProps()} ref={control} data-field={str(props.name)}>
        <IconSvg name="search" className="gistui-combobox__search" />
        <input className="gistui-input" data-locked={locked || undefined} {...api.getInputProps()} placeholder={str(props.placeholder) ?? "Search…"} name={undefined} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
        {/* The chosen values, for the form (the visible input holds the search text). */}
        {name && api.value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
        <button type="button" className="gistui-combobox__trigger" {...api.getTriggerProps()}>
          <IconSvg name="chevron-down" />
        </button>
      </div>
      <div {...api.getPositionerProps()}>
        <ul className="gistui-popover" {...api.getContentProps()}>
          {shown.length ? (
            shown.map((item) => (
              <li key={item} className="gistui-option" {...api.getItemProps({ item })}>
                <span {...api.getItemTextProps({ item })}>{item}</span>
                <span className="gistui-option__check" {...api.getItemIndicatorProps({ item })}>
                  <IconSvg name="check" />
                </span>
              </li>
            ))
          ) : (
            <li className="gistui-option" data-empty="">
              No matches
            </li>
          )}
        </ul>
      </div>
      {error ? <FieldError id={errorId} error={error} /> : hint && <span className="gistui-field__hint">{hint}</span>}

    </div>
  );
}
