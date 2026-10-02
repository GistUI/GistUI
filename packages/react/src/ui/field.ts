/**
 * Your own field component (a shadcn/ui `<Input>`, a Radix `<Select>`, MUI…) as a real GistUI form
 * field: the Form around it validates it (required, type, lengths, pattern… from its props) on submit,
 * blur or change, and `bind:$var` works. Render a native control with `name` (Radix and most libraries
 * render a hidden one when you pass `name`), show `error`, and disable it while `locked`.
 *
 *   function MyInput(p: ComponentProps) {
 *     const field = useGistField(p);
 *     return (
 *       <div>
 *         <Label>{field.label}</Label>
 *         <Input name={field.name} disabled={field.locked} aria-invalid={!!field.error} />
 *         {field.error && <p>{field.error}</p>}
 *       </div>
 *     );
 *   }
 *
 * `kind` says how the value is read: "text" (default), "bool" (one checkbox) or "list".
 */

import { useLocked } from "../context";
import { str, useBinding } from "../hooks";
import type { ComponentProps } from "../library";
import { useField, type FieldKind } from "./form";
import { rulesOf } from "./forms";

/** What a form field needs, for your own component. */
export interface GistField {
  /** The form value's name (`Input("email", …)` → "email"). Render a native control with it. */
  readonly name: string | undefined;
  readonly label: string | undefined;
  readonly required: boolean;
  /** The current validation message, to show under the field; undefined when valid. */
  readonly error: string | undefined;
  /** True while the program is still streaming: disable the control. */
  readonly locked: boolean;
  /** `bind:$var`: whether the field is bound, the bound value, and how to change it. */
  readonly bound: boolean;
  readonly value: unknown;
  setValue(value: unknown): void;
}

export function useGistField({ node, props }: Pick<ComponentProps, "node" | "props">, kind: FieldKind = "text"): GistField {
  const name = str(props.name);
  const error = useField(name, rulesOf(props), kind);
  const locked = useLocked(node);
  const b = useBinding(node);
  return { name, label: str(props.label), required: props.required === true, error, locked, bound: b.bound, value: b.value, setValue: b.set };
}
