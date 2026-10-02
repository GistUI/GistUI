/**
 * Fields and their Form: the link every form control uses (built-in or your own). A field registers
 * its rules with the Form around it and reads back its current error; the Form validates them with
 * the shared `@gistui/headless` validator and reads values from the native controls' `name`s.
 *
 * Your own component (any framework) uses `formField`: it gets the field's name, label, error,
 * locked state and `bind:$var` value, and joins the Form's validation and submit.
 */

import type { FieldRules } from "@gistui/headless";
import { num, str } from "./dom";
import type { DomContext } from "./types";

/** How a field's value is read from the form: text, a single checkbox (boolean) or a list. */
export type FieldKind = "text" | "bool" | "list";

// A global symbol: a field and its Form find each other even if the package is loaded twice
// (a bundler resolving the main entry and `./ui` to different copies, or two installed versions).
export const FORM = Symbol.for("gistui.form");

export interface FormController {
  register(name: string, rules: FieldRules, kind: FieldKind): () => void;
  error(name: string): string | undefined;
  /** Called whenever errors change. Returns an unsubscribe function. */
  onErrors(cb: () => void): () => void;
  /**
   * Called when the form is reset (a reset button, or "Start over" after a submit), after the native
   * controls went back to their defaults: a field puts its own state back. Returns an unsubscribe.
   */
  onReset?(cb: () => void): () => void;
  /** Saves a draft (a `Button(type:draft)` calls it): empty fields are allowed, the form stays open. */
  saveDraft?(): void;
}

/**
 * A field's link to its Form: registers its rules (again when they or the form change) and reports
 * its current error. The form is looked up on every `sync`, so a field rendered before its Form
 * provided itself links up on the next update. `onChange` runs when the error changes.
 */
export function fieldLink(ctx: DomContext, onChange: () => void, onReset?: () => void): { sync(c: DomContext, name: string | undefined, rules: FieldRules, kind?: FieldKind): void; error(): string | undefined } {
  let form: FormController | undefined;
  let off: (() => void) | null = null;
  let offErrors: (() => void) | null = null;
  let offReset: (() => void) | null = null;
  let key = "";
  let name: string | undefined;
  ctx.onDestroy(() => {
    off?.();
    offErrors?.();
    offReset?.();
  });
  return {
    sync(c, n, rules, kind = "text") {
      const f = c.consume<FormController>(FORM);
      if (f !== form) {
        off?.();
        offErrors?.();
        offReset?.();
        off = null;
        key = "";
        form = f;
        offErrors = f ? f.onErrors(onChange) : null;
        offReset = (onReset && f?.onReset?.(onReset)) || null;
      }
      const k = JSON.stringify([n, rules, kind]);
      if (!form || k === key) return;
      key = k;
      name = n;
      off?.();
      off = n ? form.register(n, rules, kind) : null;
    },
    error: () => (form && name ? form.error(name) : undefined),
  };
}

/** Validation rules from a field's props (see FieldRules in @gistui/headless). */
export function rulesOf(props: Readonly<Record<string, unknown>>): FieldRules {
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

/**
 * A control's subscription to its `bind:$var`: `onChange` runs when the variable changes from
 * elsewhere (`@set`, `@reset`, another control bound to it). `sync(ctx)` follows the latest context,
 * subscribing again only when the variable changed; the component's destruction releases it.
 */
export function bindingLink(ctx: DomContext, onChange: () => void): { sync(c: DomContext): void } {
  let off = () => {};
  let name: string | null | undefined;
  let runtime: unknown;
  ctx.onDestroy(() => off());
  return {
    sync(c) {
      const e = c.node.dyn?.bind;
      const n = e?.k === "state" ? e.name : null;
      if (n === name && c.runtime === runtime) return;
      name = n;
      runtime = c.runtime;
      off();
      off = c.binding().subscribe(onChange);
    },
  };
}

/**
 * A control's value: the bound `$var` with `bind:`, otherwise its own. Its own value follows the
 * program (`fromProps`) until the user changes it: a streamed control is created while its statement
 * is still partial, before `value:` or `checked` has arrived, so a value seeded at creation would
 * miss it. A form reset (`reset()`) hands the value back to the program. `onChange` runs when the
 * bound value changes from elsewhere; after its own `set`, the control draws itself.
 */
export function boundValue<T>(ctx: DomContext, fromProps: (c: DomContext) => T, onChange: () => void): { sync(c: DomContext): void; readonly bound: boolean; get(): unknown; set(value: T): void; reset(): void } {
  let c = ctx;
  let own: { value: T } | null = null;
  const link = bindingLink(ctx, onChange);
  link.sync(ctx);
  return {
    sync(next) {
      c = next;
      link.sync(c);
    },
    get bound() {
      return c.binding().bound;
    },
    get() {
      const b = c.binding();
      return b.bound ? b.value : own ? own.value : fromProps(c);
    },
    set(value) {
      const b = c.binding();
      if (b.bound) b.set(value);
      else own = { value };
    },
    reset() {
      own = null;
    },
  };
}

/** For a control that is not validated (so it has no `fieldLink`): `onReset` runs when its Form is reset. */
export function resetLink(ctx: DomContext, onReset: () => void): { sync(c: DomContext): void } {
  let form: FormController | undefined;
  let off: (() => void) | null = null;
  ctx.onDestroy(() => off?.());
  return {
    sync(c) {
      const f = c.consume<FormController>(FORM);
      if (f === form) return;
      form = f;
      off?.();
      off = f?.onReset?.(onReset) ?? null;
    },
  };
}

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

/**
 * Joins your own field component to the GistUI Form around it: its rules (required, type, lengths,
 * pattern…) come from its props, and the Form validates it on submit, blur or change like a built-in
 * field. Call `sync(ctx)` whenever the component gets a new context; `onChange` runs when the error
 * or the bound value changes, and `state()` is the field's current state. `onReset` (by default
 * `onChange`) runs when the Form is reset, after its native controls went back to their defaults: a
 * component that keeps a value of its own puts it back to its starting value there.
 *
 * The Form reads the value from a native control named `field.name` (an `<input>`, `<select>` or the
 * hidden input most component libraries render), so render one.
 */
export function formField(ctx: DomContext, onChange: () => void, kind: FieldKind = "text", onReset: () => void = onChange): { sync(ctx: DomContext): void; state(): GistField } {
  let c = ctx;
  const link = fieldLink(ctx, onChange, onReset);
  const binding = bindingLink(ctx, onChange);
  const sync = (next: DomContext) => {
    c = next;
    link.sync(c, str(c.props.name), rulesOf(c.props), kind);
    binding.sync(c);
  };
  sync(ctx);
  return {
    sync,
    state() {
      const p = c.props;
      const b = c.binding();
      return {
        name: str(p.name),
        label: str(p.label),
        required: p.required === true,
        error: link.error(),
        locked: c.locked,
        bound: b.bound,
        value: b.value,
        setValue: (v) => c.binding().set(v),
      };
    },
  };
}
