/**
 * Forms, as in `@gistui/react`: validation (the shared `@gistui/headless` validator), timing
 * (`validate:submit|blur|change`), step forms, drafts, a guaranteed submit button, and the submit
 * action with `formId`, `submissionId`, typed `values`, `fields`, JSON Schema and a readable `message`.
 */

import { validateValue, type FieldRules, type FieldValue } from "@gistui/headless";
import { h, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { flag } from "./attrs";
import { iconEl } from "./icon";
import { OVERLAY, type OverlayHandle } from "./overlay";
import { FORM, type FieldKind, type FormController } from "../field";

export { FORM, bindingLink, boundValue, fieldLink, resetLink, type FieldKind, type FormController } from "../field";

type SchemaModule = typeof import("@gistui/headless/form-schema");
let schema: SchemaModule | null = null;
let schemaLoading: Promise<SchemaModule> | null = null;
const loadSchema = () => (schemaLoading ??= import("@gistui/headless/form-schema").then((m) => (schema = m)));
const uuid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
export const preloadFormSchema = (): Promise<unknown> => loadSchema();

/** The error line under a field. */
export function errorLine(id: string, error: string): HTMLElement {
  return h("span", { class: "gistui-field__error", id, role: "alert" }, iconEl("alert-circle"), error);
}

/** True inside a Form (Buttons use it to become submit buttons). */
export const inForm = (ctx: DomContext): boolean => ctx.consume(FORM) !== undefined;

/** "Emails: a@b.com · Role: Editor": for chat hosts that forward a submit to the model. */
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

export const Form: DomRenderer = (ctx) => {
  let c = ctx;
  const rules = new Map<string, { rules: FieldRules; kind: FieldKind }>();
  let errors: Record<string, string> = {};
  const listeners = new Set<() => void>();
  let submitted = false;
  let done = false;
  let step = 0;
  let status: string | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let dead = false;
  // Fields that hold their own value (a toggle, a group, a slider…) put it back on a reset.
  const resets = new Set<() => void>();
  const resetFields = () => {
    for (const cb of [...resets]) cb();
  };

  const controller: FormController = {
    register(name, r, kind) {
      rules.set(name, { rules: r, kind });
      return () => {
        if (rules.get(name)?.rules === r) rules.delete(name);
      };
    },
    error: (name) => errors[name],
    onErrors(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onReset(cb) {
      resets.add(cb);
      return () => resets.delete(cb);
    },
    saveDraft: () => saveDraft(),
  };
  ctx.provide(FORM, controller);

  const form = h("form", { class: "gistui-form", "data-gistui": "Form", novalidate: true });
  const wrap = h("div", { style: "display:contents" }, form);
  const fields = h("div", { style: "display:contents" });
  const nav = h("div", { class: "gistui-form__nav" });
  const stepper = h("ol", { class: "gistui-stepper", "aria-label": "Steps" });
  const stepDivs = new Map<string, HTMLDivElement>();

  const setErrors = (next: Record<string, string>) => {
    errors = next;
    for (const cb of [...listeners]) cb();
  };
  const kinds = () => new Map([...rules].map(([n, v]) => [n, v.kind]));

  /** Validates the named fields; returns the names that failed. */
  const check = (names: readonly string[], partial = false): string[] => {
    const values = readValues(form, kinds());
    const failed: string[] = [];
    const next = { ...errors };
    for (const n of names) {
      const reg = rules.get(n);
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
    // Nothing changed: no field is told (one that announces its value when it draws would otherwise
    // be re-checked forever).
    const keys = Object.keys(next);
    if (keys.length === Object.keys(errors).length && keys.every((k) => errors[k] === next[k])) return failed;
    setErrors(next);
    return failed;
  };
  // A step's fields: named controls, plus the fields that only render named inputs once they have
  // a value (tags, combobox, date picker) and mark themselves with `data-field`.
  const namesIn = (root: Element | null) => (root ? [...new Set(Array.from(root.querySelectorAll<HTMLInputElement>("[name], [data-field]")).map((e) => e.name || e.dataset.field || "").filter((n) => rules.has(n)))] : []);
  const focusFirst = (failed: readonly string[]) => {
    requestAnimationFrame(() => {
      const el = form.querySelector<HTMLElement>(`[aria-invalid="true"], [data-invalid] [data-part="trigger"], [data-invalid] input:not([type="hidden"])`);
      el?.focus?.();
      if (!el && failed[0]) form.querySelector<HTMLElement>(`[name="${CSS.escape(failed[0])}"]`)?.focus?.();
    });
  };
  const setStatus = (s: string | null) => {
    status = s;
    if (statusTimer) clearTimeout(statusTimer);
    if (s) statusTimer = setTimeout(() => setStatus(null), 4000);
    draw();
  };

  // Fields announce changes with bubbling native events (custom fields from a wrapper element).
  const handler = (blur: boolean) => (e: Event) => {
    const t = e.target as HTMLInputElement;
    const name = t.name || t.dataset?.field || t.closest<HTMLElement>("[data-field]")?.dataset.field || "";
    if (!name || !rules.has(name)) return;
    const mode = str(c.props.validate) ?? "submit";
    if (!(mode === "change" || (mode === "blur" && blur) || (submitted && (errors[name] !== undefined || blur)))) return;
    const timer = setTimeout(() => {
      live.delete(timer);
      check([name]);
    }, 0);
    live.add(timer);
  };
  // Checks waiting for their event to finish: a reset drops them (they would report the emptied form).
  const live = new Set<ReturnType<typeof setTimeout>>();
  const dropLive = () => {
    for (const t of live) clearTimeout(t);
    live.clear();
  };
  form.addEventListener("input", handler(false));
  form.addEventListener("change", handler(false));
  form.addEventListener("focusout", handler(true));

  const stepEntries = () => c.childList.filter((e) => e.node?.type === "Step");
  const formName = () => str(c.props.name) ?? c.node.id;

  const emitSubmit = (mod: SchemaModule | null, raw: Record<string, FieldValue>, partial: boolean) => {
    const steps = stepEntries();
    const wizard = steps.length > 0;
    if (!mod) {
      // The description chunk could not be loaded: the values still reach the host, as read.
      const labels = new Map([...rules].map(([n, v]) => [n, v.rules.label]));
      c.emit({
        type: "submit",
        nodeId: c.node.id,
        form: formName(),
        formId: str(c.props.id) ?? formName(),
        submissionId: uuid(),
        submittedAt: new Date().toISOString(),
        partial,
        step: wizard ? { index: step, count: steps.length } : undefined,
        values: raw,
        fields: [],
        schema: {},
        message: summarize(formName(), raw, labels, partial),
      });
      return;
    }
    const { describeForm, newSubmissionId, toData } = mod;
    // Described at submit time, so fields that streamed in or changed are included.
    const { fields: described, schema: json, formId, steps: titles } = describeForm(c.node, (nid) => c.runtime.view(nid));
    const values = toData(described, raw);
    const labels = new Map(described.map((f) => [f.name, f.label]));
    c.emit({
      type: "submit",
      nodeId: c.node.id,
      form: formName(),
      formId,
      submissionId: newSubmissionId(),
      submittedAt: new Date().toISOString(),
      partial,
      step: wizard ? { index: step, count: steps.length, title: titles?.[step] } : undefined,
      values,
      fields: described,
      schema: json,
      message: summarize(formName(), values, labels, partial),
    });
  };
  /**
   * Emits the submit, then calls `then` (success, status). The description chunk is normally there
   * already; if not, the submit waits for it, and goes out without a schema when it cannot load.
   */
  let waiting = false;
  const send = (raw: Record<string, FieldValue>, partial: boolean, then: () => void) => {
    if (schema) {
      emitSubmit(schema, raw, partial);
      return then();
    }
    if (waiting) return;
    waiting = true;
    void loadSchema()
      .then(
        (m) => m,
        () => null,
      )
      .then((m) => {
        waiting = false;
        if (dead) return;
        emitSubmit(m, raw, partial);
        then();
      });
  };

  // A draft: empty fields are allowed, what is filled in is checked; the form stays open.
  const saveDraft = () => {
    const failed = check([...rules.keys()], true);
    if (failed.length) return focusFirst(failed);
    send(readValues(form, kinds()), true, () => setStatus(`Draft saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`));
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const wizard = stepEntries().length > 0;
    const last = step >= stepEntries().length - 1;
    if (wizard && !last) {
      const failed = check(namesIn(form.querySelector(`[data-step="${step}"]`)));
      submitted = true;
      if (failed.length) return focusFirst(failed);
      step++;
      draw();
      return;
    }
    const failed = check([...rules.keys()]);
    submitted = true;
    if (failed.length) {
      if (wizard) {
        // Back to the first step with an error (an empty tag, combobox or date field has no named control).
        const s = Array.from(form.querySelectorAll("[data-step]")).findIndex((st) => failed.some((n) => st.querySelector(`[name="${CSS.escape(n)}"], [data-field="${CSS.escape(n)}"]`)));
        if (s >= 0) step = s;
        draw();
      }
      return focusFirst(failed);
    }
    send(readValues(form, kinds()), false, () => {
      const overlay = c.consume<OverlayHandle>(OVERLAY);
      if (overlay) overlay.close();
      else if (str(c.props.success)) {
        done = true;
        draw();
      } else setStatus("Submitted");
    });
  });
  form.addEventListener("reset", () => {
    dropLive();
    setErrors({});
    submitted = false;
    setStatus(null);
    // The browser puts the native controls back after this event; fields with their own value follow.
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(resetFields, 0);
  });

  const button = (attrs: Record<string, string | boolean | undefined>, ...kids: (Node | string | null)[]) => h("button", { class: "gistui-button", ...attrs }, ...kids);

  // The form's own controls are created once and patched: the button just pressed (Continue, Back,
  // Save draft, Start over) is still there, with the focus, after the draw its click caused.
  const statusText = document.createTextNode("");
  const statusEl = h("span", { class: "gistui-form__status", role: "status" }, iconEl("check"), statusText);
  const spacer = h("span", { class: "gistui-spacer" });
  // Not a submit button: it comes first in the form, so Enter in a field would save a draft.
  const draftBtn = button({ type: "button", "data-v": "ghost", "data-draft": "" });
  draftBtn.addEventListener("click", saveDraft);
  const count = h("span", { class: "gistui-form__count" });
  const submitText = document.createTextNode("");
  const submitArrow = iconEl("arrow-right");
  const submitBtn = button({ type: "submit", "data-auto": "" }, submitText);
  const back = button({ type: "button", "data-v": "ghost" }, iconEl("arrow-left"), "Back");
  back.addEventListener("click", () => {
    step = Math.max(0, step - 1);
    draw();
  });
  const doneText = h("p");
  const again = button({ type: "button", "data-v": "ghost", "data-size": "sm" }, "Start over");
  const doneEl = h("div", { class: "gistui-form__done", "data-gistui": "Form", role: "status" }, h("span", { class: "gistui-form__done-icon" }, iconEl("check")), doneText, again);
  again.addEventListener("click", () => {
    done = false;
    submitted = false;
    setErrors({});
    step = 0;
    // The same form again, as it first was (React mounts a new one): no previous answers.
    form.reset();
    if (resetTimer) clearTimeout(resetTimer);
    resetFields();
    draw();
  });
  let stepperKey = "";

  const draw = () => {
    const p = c.props;
    if (done && str(p.success)) {
      setText(doneText, str(p.success)!);
      syncChildren(wrap, [doneEl]);
      return;
    }
    const steps = stepEntries();
    const wizard = steps.length > 0;
    if (step >= steps.length && wizard) step = steps.length - 1;
    const last = step >= steps.length - 1;
    // No `name` attribute: a form named e.g. "getElementById" would shadow that property of `document`.
    setAttrs(form, { "data-wizard": flag(wizard), "data-form-id": schema ? schema.describeForm(c.node, (id) => c.runtime.view(id)).formId : undefined, "data-form-name": str(p.name) });
    if (!schema) {
      void loadSchema().then(
        () => {
          if (!dead) draw();
        },
        () => {},
      );
    }
    if (status) statusText.data = status;
    const draftLabel = str(p.draft);
    setText(draftBtn, draftLabel ?? "");
    const submitLabel = str(p.submit) ?? "Submit";
    const more = wizard && !last;
    submitText.data = more ? "Continue" : submitLabel;
    syncChildren(submitBtn, more && submitArrow ? [submitText, submitArrow] : [submitText]);
    if (wizard) {
      const titles = steps.map((s, i) => str(s.node?.props.title) ?? `Step ${i + 1}`);
      const key = JSON.stringify([step, titles]);
      if (key !== stepperKey) {
        stepperKey = key;
        syncChildren(
          stepper,
          titles.map((title, i) =>
            h(
              "li",
              { class: "gistui-stepper__item", "data-state": i < step ? "done" : i === step ? "current" : "todo", "aria-current": i === step ? "step" : undefined },
              h("span", { class: "gistui-stepper__dot" }, i < step ? iconEl("check") : String(i + 1)),
              h("span", { class: "gistui-stepper__label" }, title),
            ),
          ),
        );
      }
      const divs = steps.map((s, i) => {
        let d = stepDivs.get(s.id);
        if (!d) stepDivs.set(s.id, (d = h("div", { class: "gistui-form__step" })));
        setAttrs(d, { "data-step": i, hidden: i !== step });
        syncChildren(d, s.nodes);
        return d;
      });
      setText(count, `Step ${step + 1} of ${steps.length}`);
      syncChildren(nav, [...(step > 0 ? [back] : []), ...(status ? [statusEl] : []), spacer, ...(draftLabel ? [draftBtn] : []), count, submitBtn]);
      syncChildren(form, [stepper, ...divs, nav]);
    } else {
      c.place(fields);
      // Guarantee a way to submit: when no submit button has rendered, the form adds one.
      const own = Boolean(fields.querySelector('button[type="submit"]:not([data-auto]):not([data-draft])'));
      const auto = Boolean(str(p.submit)) || !own;
      syncChildren(nav, [...(status ? [statusEl] : []), spacer, ...(draftLabel ? [draftBtn] : []), ...(auto ? [submitBtn] : [])]);
      syncChildren(form, auto || draftLabel || status ? [fields, nav] : [fields]);
    }
    syncChildren(wrap, [form]);
  };
  // Buttons stream in after the form: re-check whether the program brought its own submit button.
  const mo =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() =>
          queueMicrotask(() => {
            if (!dead) draw();
          }),
        )
      : null;
  mo?.observe(fields, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });
  const apply = (next: DomContext) => {
    c = next;
    c.provide(FORM, controller);
    // Steps and their titles are read from the children: draw again when one arrives or changes.
    c.watch(c.childList.map((e) => e.id));
    draw();
  };
  apply(ctx);
  return {
    el: wrap,
    update(next) {
      apply(next);
      return true;
    },
    destroy() {
      dead = true;
      dropLive();
      mo?.disconnect();
      if (statusTimer) clearTimeout(statusTimer);
      if (resetTimer) clearTimeout(resetTimer);
    },
  };
};

/** One step of a step form: a title and any fields. */
export const Step: DomRenderer = (ctx) => {
  const legend = h("legend", { class: "gistui-sr-only" });
  const hint = h("p", { class: "gistui-step__hint" });
  const body = h("div", { style: "display:contents" });
  const el = h("fieldset", { class: "gistui-step", "data-gistui": "Step" });
  const apply = (c: DomContext) => {
    setText(legend, str(c.props.title) ?? "");
    const hText = str(c.props.hint);
    setText(hint, hText ?? "");
    c.place(body);
    syncChildren(el, [legend, ...(hText ? [hint] : []), body]);
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
