import { normalizeProps, useMachine } from "@zag-js/react";
import * as select from "@zag-js/select";
import { useId, useMemo, type ReactNode } from "react";
import { useLocked } from "../context";
import { str, useBinding } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { FieldError, useField, useOwnValue } from "./form";

const listOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : raw == null || raw === "" ? [] : [String(raw)]);

/**
 * The initial choice of a Select or Combobox from `value:`: only options that exist, each once;
 * one of them unless `multiple`.
 */
export function initialChoice(props: Record<string, unknown>, options: readonly string[]): string[] {
  const chosen = [...new Set(listOf(props.value))].filter((v) => options.includes(v));
  return props.multiple === true ? chosen : chosen.slice(0, 1);
}

export function SelectImpl({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  // An option listed twice shows once: a value is a key, and can be chosen only once.
  const options = Array.isArray(props.options) ? [...new Set(props.options.map(String))] : [];
  const collection = useMemo(() => select.collection({ items: options, itemToString: (x) => x, itemToValue: (x) => x }), [options.join("\u0000")]);
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  // Unbound: the program's `value:` until the user picks, and again after a form reset.
  const [own, setOwn] = useOwnValue<string[]>(initialChoice(props, options));
  const service = useMachine(select.machine, {
    id: uid,
    collection,
    name: str(props.name),
    multiple: props.multiple === true,
    ...(b.bound
      ? {
          value: listOf(b.value),
          onValueChange: (d: { value: string[] }) => b.set(props.multiple === true ? d.value : (d.value[0] ?? null)),
        }
      : { value: own, onValueChange: (d: { value: string[] }) => setOwn(d.value) }),
    disabled: locked,
    // Rendered inside the themed tree (no portal) so it inherits theme tokens; `fixed` escapes clipping.
    positioning: { sameWidth: true, gutter: 6, strategy: "fixed" },
  });
  const api = select.connect(service, normalizeProps);
  const error = useField(str(props.name), { label: str(props.label), required: props.required === true || undefined, message: str(props.error) }, props.multiple === true ? "list" : "text");
  return (
    // `data-invalid` after Zag's root props, which carry their own (always unset here).
    <div className="gistui-field gistui-select" data-gistui="Select" data-size={str(props.size)} {...api.getRootProps()} data-invalid={error ? "" : undefined}>
      <label className="gistui-field__label" {...api.getLabelProps()} data-required={props.required === true || undefined}>
        {str(props.label)}
      </label>
      <div {...api.getControlProps()}>
        <button type="button" data-locked={locked || undefined} {...api.getTriggerProps()} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
          <span {...api.getValueTextProps()}>{api.valueAsString || str(props.placeholder) || "Select…"}</span>
          <span {...api.getIndicatorProps()} aria-hidden>
            <IconSvg name="chevron-down" />
          </span>
        </button>
      </div>
      {/* The hidden native select carries the value into the form (FormData, validation, submit). */}
      <select {...api.getHiddenSelectProps()}>
        {!props.multiple && <option value="" />}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error ? <FieldError id={errorId} error={error} /> : str(props.hint) && <span className="gistui-field__hint">{str(props.hint)}</span>}

      <div {...api.getPositionerProps()}>
        <ul className="gistui-popover" {...api.getContentProps()}>
          {options.map((item) => (
            <li key={item} className="gistui-option" {...api.getItemProps({ item })}>
              <span {...api.getItemTextProps({ item })}>{item}</span>
              <span className="gistui-option__check" {...api.getItemIndicatorProps({ item })} aria-hidden>
                <IconSvg name="check" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
