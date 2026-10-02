/**
 * Forms: validation, validation timing, step forms and submit.
 *
 *   Form("signup", …fields, validate:submit|blur|change, success:"Thanks!", submit:"Create account")
 *   Form("signup", Step("Account", …), Step("Profile", …))   → a step form (a wizard)
 *
 * - Fields register their rules (required, type, lengths, pattern, match, protocols…); the shared
 *   `@gistui/headless` validator checks them.
 * - `validate:submit` (the default) checks on submit, then re-checks a field as it changes;
 *   `blur` checks each field when it loses focus; `change` checks as you type.
 * - Submit: the first invalid field gets focus; a valid form emits
 *   `{ type: "submit", form, values }`, shows `success:` and closes the dialog it sits in.
 * - Step forms validate the current step before moving on.
 * - Every form can submit: when the program has no submit button, one is added (`submit:` labels it).
 * - `draft:"Save draft"` adds a partial submit: empty fields are allowed (formats are still checked)
 *   and `{ type: "submit", partial: true }` is sent; the form stays open. `Button(type:draft)` does the same.
 * - The submit action carries `message`, a readable summary a chat host can forward to the model.
 * - It also carries `formId` (stable: `id:` or a fingerprint of the fields), a unique `submissionId`,
 *   typed `values`, and `fields` + `schema` (JSON Schema) describing every field.
 */

import { validateValue, type FieldRules, type FieldValue } from "@gistui/headless";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FormContext, useEmit, useEngine, type FieldKind, type FormContextValue } from "../context";
// The form description (JSON Schema, field metadata) is built at submit time: its own chunk.
// (Exported for tests, which make it fail to load.)
export const schemaModule = lazyModule(() => import("@gistui/headless/form-schema"));
export const preloadFormSchema = (): Promise<unknown> => schemaModule.load();
import { lazyModule, str, useLazyModule, useNodes } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { OverlayCtx } from "./overlay";

export type { FieldKind };

/** How many times the Form around a field was reset (0 outside a Form). */
export function useFormResets(): number {
  return useContext(FormContext)?.resets ?? 0;
}

/**
 * A field's own (unbound) value. It follows the prop until the user changes it: a streamed node
 * mounts while it is still partial, before `value:` or `checked` has arrived, so state seeded at
 * mount would miss it. A form reset hands the value back to the prop.
 */
export function useOwnValue<T>(fromProps: T): [T, (next: T | ((cur: T) => T)) => void] {
  const resets = useFormResets();
  const [own, setOwn] = useState<{ value: T; resets: number } | null>(null);
  const seed = useRef(fromProps);
  seed.current = fromProps;
  const set = useCallback(
    (next: T | ((cur: T) => T)) =>
      setOwn((cur) => ({ value: typeof next === "function" ? (next as (cur: T) => T)(cur && cur.resets === resets ? cur.value : seed.current) : next, resets })),
    [resets],
  );
  return [own && own.resets === resets ? own.value : fromProps, set];
}

/** Registers a field's rules and returns its current error (or undefined). */
export function useField(name: string | undefined, rules: FieldRules, kind: FieldKind = "text"): string | undefined {
  const ctx = useContext(FormContext);
  const key = JSON.stringify(rules);
  useEffect(() => {
    if (!ctx || !name) return;
    return ctx.register(name, rules, kind);
    // `key` stands for the rules object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.register, name, key, kind]);
  return name ? ctx?.errors[name] : undefined;
}

/** "Emails: a@b.com, c@d.com · Role: Editor" — for chat hosts that forward a submit to the model. */
function summarize(form: string, values: Record<string, unknown>, labels: ReadonlyMap<string, string | undefined>, partial: boolean): string {
  const lines = Object.entries(values)
    .filter(([, v]) => v !== "" && v !== false && !(Array.isArray(v) && v.length === 0) && v != null)
    .map(([k, v]) => `- ${labels.get(k) || k}: ${Array.isArray(v) ? v.join(", ") : v === true ? "yes" : v}`);
  return `${partial ? "Saved a draft of" : "Submitted"} "${form}"${lines.length ? `:\n${lines.join("\n")}` : ""}`;
}

const isEmpty = (v: FieldValue) => v == null || v === false || v === "" || (Array.isArray(v) && v.length === 0);

/** Reads every named control of a form, shaped by each field's kind. */
function readValues(form: HTMLFormElement, kinds: ReadonlyMap<string, FieldKind>): Record<string, FieldValue> {
  const data = new FormData(form);
  const out: Record<string, FieldValue> = {};
  const names = new Set<string>([...kinds.keys(), ...Array.from(data.keys())]);
  for (const name of names) {
    const all = data.getAll(name).filter((v): v is string => typeof v === "string");
    const kind = kinds.get(name) ?? (all.length > 1 ? "list" : "text");
    out[name] = kind === "list" ? all.filter((v) => v !== "") : kind === "bool" ? all.length > 0 && all[0] !== "false" : (all[0] ?? "");
  }
  return out;
}

const REQUIRED_BOOL = "This must be checked to continue";

const uuid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export function Form({ node, props, children, childIds, renderNode }: ComponentProps): ReactNode {
  const emit = useEmit();
  const { runtime } = useEngine();
  const overlay = useContext(OverlayCtx);
  const form = useRef<HTMLFormElement>(null);
  const rules = useRef(new Map<string, { rules: FieldRules; kind: FieldKind }>());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorsRef = useRef<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0);
  const [resets, setResets] = useState(0);
  const mode = str(props.validate) ?? "submit";
  const kids = useNodes(childIds);
  const stepIds = childIds.filter((_, i) => kids[i]?.type === "Step");
  const wizard = stepIds.length > 0;
  const last = step >= stepIds.length - 1;

  const register = useCallback((name: string, r: FieldRules, kind: FieldKind) => {
    rules.current.set(name, { rules: r, kind });
    return () => {
      if (rules.current.get(name)?.rules === r) rules.current.delete(name);
    };
  }, []);

  /** Validates the named fields; returns the names that failed. */
  const check = useCallback((names: readonly string[], partial = false): string[] => {
    const el = form.current;
    if (!el) return [];
    const kinds = new Map([...rules.current].map(([n, v]) => [n, v.kind]));
    const values = readValues(el, kinds);
    const failed: string[] = [];
    const next = { ...errorsRef.current };
    for (const n of names) {
      const reg = rules.current.get(n);
      if (!reg) continue;
      // A draft allows empty fields; what is filled in must still be valid.
      if (partial && isEmpty(values[n])) {
        delete next[n];
        continue;
      }
      let msg = validateValue(reg.rules, values[n], values);
      // A checkbox can only fail by being unchecked, so its `error:` is the message for that.
      if (msg && reg.kind === "bool") msg = reg.rules.message ?? REQUIRED_BOOL;
      if (msg) {
        next[n] = msg;
        failed.push(n);
      } else delete next[n];
    }
    // Nothing changed: keep the object, so no field re-renders (a field that announces its value
    // from an effect would otherwise be re-checked forever).
    const prev = errorsRef.current;
    const keys = Object.keys(next);
    if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return failed;
    errorsRef.current = next;
    setErrors(next);
    return failed;
  }, []);

  // A step's fields: named controls, plus the fields that only render named inputs once they have
  // a value (tags, combobox, date picker) and mark themselves with `data-field`.
  const namesIn = (root: Element | null) =>
    root ? [...new Set(Array.from(root.querySelectorAll<HTMLInputElement>("[name], [data-field]")).map((e) => e.name || e.dataset.field || "").filter((n) => rules.current.has(n)))] : [];

  const focusFirst = (failed: readonly string[]) => {
    requestAnimationFrame(() => {
      const el = form.current?.querySelector<HTMLElement>(`[aria-invalid="true"], [data-invalid] [data-part="trigger"], [data-invalid] input:not([type="hidden"])`);
      el?.focus?.();
      if (!el && failed[0]) form.current?.querySelector<HTMLElement>(`[name="${CSS.escape(failed[0])}"]`)?.focus?.();
    });
  };

  // Native listeners: React only reports `change` for real form controls, but custom fields (tags,
  // combobox) announce changes with a bubbling native event from a wrapper element.
  const live = useRef({ mode, submitted });
  live.current = { mode, submitted };
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const handler = (blur: boolean) => (e: Event) => {
      const t = e.target as HTMLInputElement;
      const name = t.name || t.dataset?.field || t.closest<HTMLElement>("[data-field]")?.dataset.field || "";
      if (!name || !rules.current.has(name)) return;
      const { mode: m, submitted: s } = live.current;
      if (!(m === "change" || (m === "blur" && blur) || (s && (errorsRef.current[name] !== undefined || blur)))) return;
      // After the event: re-rendering during it would reset controlled inputs before React reads them.
      setTimeout(() => check([name]), 0);
    };
    const onInput = handler(false);
    const onBlur = handler(true);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onInput);
    el.addEventListener("focusout", onBlur);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onInput);
      el.removeEventListener("focusout", onBlur);
    };
    // `done`: after "Start over" the <form> is a new element.
  }, [check, done]);

  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  // Guarantee a way to submit: when no submit button has rendered (yet), the form adds one.
  const [ownSubmit, setOwnSubmit] = useState(true);
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const scan = () => setOwnSubmit(Boolean(el.querySelector('button[type="submit"]:not([data-auto]):not([data-draft])')));
    scan();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });
    return () => mo.disconnect();
  }, [done]);

  const formName = str(props.name) ?? node.id;
  const { value: fs } = useLazyModule(schemaModule);
  const formId = useMemo(() => (fs ? fs.describeForm(node, (id) => runtime.view(id)).formId : undefined), [fs, node, runtime]);
  const kindsOf = () => new Map([...rules.current].map(([n, v]) => [n, v.kind]));
  const emitSubmit = (mod: typeof schemaModule.current, raw: Record<string, FieldValue>, partial: boolean) => {
    if (!mod) {
      // The description chunk could not be loaded: the values still reach the host, as read.
      const labels = new Map([...rules.current].map(([n, v]) => [n, v.rules.label]));
      emit({
        type: "submit",
        nodeId: node.id,
        form: formName,
        formId: str(props.id) ?? formName,
        submissionId: uuid(),
        submittedAt: new Date().toISOString(),
        partial,
        step: wizard ? { index: step, count: stepIds.length } : undefined,
        values: raw,
        fields: [],
        schema: {},
        message: summarize(formName, raw, labels, partial),
      });
      return;
    }
    const { describeForm, newSubmissionId, toData } = mod;
    // Described at submit time, so fields that streamed in or changed are included.
    const { fields, schema, formId: id, steps } = describeForm(node, (nid) => runtime.view(nid));
    const values = toData(fields, raw);
    const labels = new Map(fields.map((f) => [f.name, f.label]));
    emit({
      type: "submit",
      nodeId: node.id,
      form: formName,
      formId: id,
      submissionId: newSubmissionId(),
      submittedAt: new Date().toISOString(),
      partial,
      step: wizard ? { index: step, count: stepIds.length, title: steps?.[step] } : undefined,
      values,
      fields,
      schema,
      message: summarize(formName, values, labels, partial),
    });
  };
  /**
   * Emits the submit, then calls `then` (success, status). The description chunk is normally there
   * already; if not, the submit waits for it, and goes out without a schema when it cannot load.
   */
  const waiting = useRef(false);
  const send = (raw: Record<string, FieldValue>, partial: boolean, then: () => void) => {
    if (schemaModule.current) {
      emitSubmit(schemaModule.current, raw, partial);
      return then();
    }
    if (waiting.current) return;
    waiting.current = true;
    void schemaModule
      .load()
      .then(
        (m) => m,
        () => null,
      )
      .then((m) => {
        waiting.current = false;
        emitSubmit(m, raw, partial);
        then();
      });
  };

  // A draft: empty fields are allowed, what is filled in is checked; the form stays open.
  const saveDraft = () => {
    const el = form.current;
    if (!el) return;
    const failed = check([...rules.current.keys()], true);
    if (failed.length) return focusFirst(failed);
    send(readValues(el, kindsOf()), true, () => setStatus(`Draft saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`));
  };
  const draftNow = useRef(saveDraft);
  draftNow.current = saveDraft;
  const draftAction = useCallback(() => draftNow.current(), []);

  const onSubmit = (e: React.FormEvent) => {
    // A Form inside a Dialog opened from this one renders elsewhere (a portal), but React bubbles
    // its events through here: they are not this form's.
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const el = form.current;
    if (!el) return;
    if (wizard && !last) {
      const failed = check(namesIn(el.querySelector(`[data-step="${step}"]`)));
      setSubmitted(true);
      if (failed.length) return focusFirst(failed);
      setStep((s) => s + 1);
      return;
    }
    const failed = check([...rules.current.keys()]);
    setSubmitted(true);
    if (failed.length) {
      if (wizard) {
        // Back to the first step with an error (an empty tag, combobox or date field has no named control).
        const s = Array.from(el.querySelectorAll("[data-step]")).findIndex((st) => failed.some((n) => st.querySelector(`[name="${CSS.escape(n)}"], [data-field="${CSS.escape(n)}"]`)));
        if (s >= 0) setStep(s);
      }
      return focusFirst(failed);
    }
    send(readValues(el, kindsOf()), false, () => {
      if (overlay) overlay.close();
      else if (str(props.success)) setDone(true);
      else setStatus("Submitted");
    });
  };

  const ctx = useMemo<FormContextValue>(() => ({ register, errors, resets, saveDraft: draftAction }), [register, errors, resets, draftAction]);
  const success = str(props.success);
  const draft = str(props.draft);
  // The form's own submit button: always in step forms; otherwise when asked for (`submit:`) or
  // when the program has none.
  const autoSubmit = wizard || Boolean(str(props.submit)) || !ownSubmit;
  const submitLabel = str(props.submit) ?? "Submit";
  const statusEl = status && (
    <span className="gistui-form__status" role="status">
      <IconSvg name="check" />
      {status}
    </span>
  );
  // Not a submit button: it comes first in the form, so Enter in a field would save a draft.
  const draftBtn = draft && (
    <button type="button" className="gistui-button" data-v="ghost" data-draft="" onClick={saveDraft}>
      {draft}
    </button>
  );

  if (done && success) {
    return (
      <div className="gistui-form__done" data-gistui="Form" role="status">
        <span className="gistui-form__done-icon">
          <IconSvg name="check" />
        </span>
        <p>{success}</p>
        <button
          type="button"
          className="gistui-button"
          data-v="ghost"
          data-size="sm"
          onClick={() => {
            setDone(false);
            setSubmitted(false);
            errorsRef.current = {};
            setErrors({});
            setStep(0);
          }}
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <FormContext.Provider value={ctx}>
      {/* No `name` attribute: a form named e.g. "getElementById" would shadow that property of `document`. */}
      <form
        ref={form}
        className="gistui-form"
        data-gistui="Form"
        data-wizard={wizard || undefined}
        data-form-id={formId}
        data-form-name={str(props.name)}
        noValidate
        onSubmit={onSubmit}
        onReset={(e) => {
          if (e.target !== e.currentTarget) return;
          errorsRef.current = {};
          setErrors({});
          setSubmitted(false);
          setStatus(null);
          // Once the browser has reset the native controls, fields take their props' values again.
          setTimeout(() => setResets((n) => n + 1), 0);
        }}
      >
        {wizard ? (
          <>
            <ol className="gistui-stepper" aria-label="Steps">
              {stepIds.map((id, i) => {
                const k = kids[childIds.indexOf(id)];
                const state = i < step ? "done" : i === step ? "current" : "todo";
                return (
                  <li key={id} className="gistui-stepper__item" data-state={state} aria-current={i === step ? "step" : undefined}>
                    <span className="gistui-stepper__dot">{i < step ? <IconSvg name="check" /> : i + 1}</span>
                    <span className="gistui-stepper__label">{str(k?.props.title) ?? `Step ${i + 1}`}</span>
                  </li>
                );
              })}
            </ol>
            {stepIds.map((id, i) => (
              <div key={id} className="gistui-form__step" data-step={i} hidden={i !== step}>
                {renderNode(id)}
              </div>
            ))}
            <div className="gistui-form__nav">
              {step > 0 && (
                <button type="button" className="gistui-button" data-v="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                  <IconSvg name="arrow-left" />
                  Back
                </button>
              )}
              {statusEl}
              <span className="gistui-spacer" />
              {draftBtn}
              <span className="gistui-form__count">
                Step {step + 1} of {stepIds.length}
              </span>
              <button type="submit" className="gistui-button" data-auto="">
                {last ? submitLabel : "Continue"}
                {!last && <IconSvg name="arrow-right" />}
              </button>
            </div>
          </>
        ) : (
          <>
            {children}
            {(autoSubmit || draft || status) && (
              <div className="gistui-form__nav">
                {statusEl}
                <span className="gistui-spacer" />
                {draftBtn}
                {autoSubmit && (
                  <button type="submit" className="gistui-button" data-auto="">
                    {submitLabel}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </form>
    </FormContext.Provider>

  );
}

/** One step of a step form: a title and any fields. */
export function Step({ props, children }: ComponentProps): ReactNode {
  const hint = str(props.hint);
  return (
    <fieldset className="gistui-step" data-gistui="Step">
      <legend className="gistui-sr-only">{str(props.title)}</legend>
      {hint && <p className="gistui-step__hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** The error line under a field. */
export function FieldError({ id, error }: { id: string; error: string | undefined }): ReactNode {
  if (!error) return null;
  return (
    <span className="gistui-field__error" id={id} role="alert">
      <IconSvg name="alert-circle" />
      {error}
    </span>
  );
}
