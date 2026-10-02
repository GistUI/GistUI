/**
 * Choices: RadioGroup (pick one), CheckboxGroup (pick many), TagInput (free tags) and Combobox
 * (searchable select). Groups share one option layout: list, cards (with icon or image, hint and a
 * corner indicator), segmented bar (radio) or chips (checkbox); sm/md/lg sizes; `cols` for card grids.
 */

import { normalizeProps, useMachine } from "@zag-js/react";
import * as radio from "@zag-js/radio-group";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useLocked } from "../context";
import { isEmail, isUrl } from "@gistui/headless";
import { lazyModule, num, safeUrl, str, useBinding, useLazyModule } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { FieldError, useField, useFormResets, useOwnValue } from "./form";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
/** Without repeats: a value is a React key and a form value, so it can appear only once. */
const unique = (xs: string[]): string[] => (new Set(xs).size === xs.length ? xs : [...new Set(xs)]);

interface OptionMeta {
  hint?: string | undefined;
  icon?: string | undefined;
  image?: string | undefined;
}

function metaOf(props: Record<string, unknown>, i: number): OptionMeta {
  return { hint: strings(props.hints)[i], icon: strings(props.icons)[i], image: safeUrl(strings(props.images)[i]) };
}

function colsStyle(props: Record<string, unknown>): CSSProperties | undefined {
  const cols = num(props.cols);
  return cols ? ({ "--gistui-choice-cols": Math.max(1, Math.min(6, Math.round(cols))) } as CSSProperties) : undefined;
}

/** Title, hint and optional media of one option (shared by both groups). */
function OptionBody({ title, meta, card }: { title: string; meta: OptionMeta; card: boolean }): ReactNode {
  return (
    <>
      {card && meta.image && (
        <span className="gistui-choice__media">
          <img src={meta.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        </span>
      )}
      {card && !meta.image && meta.icon && (
        <span className="gistui-choice__icon">
          <IconSvg name={meta.icon} />
        </span>
      )}
      <span className="gistui-choice__text">
        <span className="gistui-choice__title">
          {!card && meta.icon && <IconSvg name={meta.icon} />}
          {title}
        </span>
        {meta.hint && <span className="gistui-choice__hint">{meta.hint}</span>}
      </span>
    </>
  );
}

function GroupShell({ props, kind, children, labelProps, error, errorId }: {
  props: Record<string, unknown>;
  kind: "RadioGroup" | "CheckboxGroup";
  children: ReactNode;
  labelProps?: Record<string, unknown>;
  error?: string | undefined;
  /** The error line's id: the group points at it with `aria-describedby`. */
  errorId: string;
}): ReactNode {
  const label = str(props.label);
  const hint = str(props.hint);
  return (
    <div className="gistui-field" data-gistui={kind} data-size={str(props.size)} data-invalid={error ? "" : undefined}>
      {label && (
        <span className="gistui-field__label" {...labelProps} data-required={props.required === true || undefined}>
          {label}
        </span>
      )}
      {children}
      {error ? <FieldError id={errorId} error={error} /> : hint && <span className="gistui-field__hint">{hint}</span>}
    </div>
  );
}

export function RadioGroup({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const options = strings(props.options);
  const v = str(props.v) ?? "list";
  const card = v === "cards";
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  const [own, setOwn] = useOwnValue<string | null>(str(props.value) ?? null);
  const service = useMachine(radio.machine, {
    id: uid,
    name: str(props.name),
    ...(b.bound
      ? { value: b.value == null || b.value === "" ? null : String(b.value), onValueChange: (d: { value: string | null }) => b.set(d.value) }
      : { value: own, onValueChange: (d: { value: string | null }) => setOwn(d.value) }),
    disabled: locked,
    orientation: v === "segmented" || str(props.dir) === "row" ? "horizontal" : "vertical",
  });
  const api = radio.connect(service, normalizeProps);
  const rootProps = api.getRootProps();
  const error = useField(str(props.name), { label: str(props.label), required: props.required === true || undefined, message: str(props.error) });
  return (
    <GroupShell props={props} kind="RadioGroup" labelProps={api.getLabelProps()} error={error} errorId={errorId}>
      <div
        {...rootProps}
        className="gistui-choice"
        data-type="radio"
        data-v={v}
        data-dir={str(props.dir)}
        data-locked={locked || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={colsStyle(props)}
      >
        {v === "segmented" && <div className="gistui-radio__thumb" {...api.getIndicatorProps()} />}
        {options.map((opt, i) =>
          // An option listed twice shows once (its first position keeps its hint, icon and image).
          options.indexOf(opt) !== i ? null : (
            <label key={opt} className="gistui-choice__item" {...api.getItemProps({ value: opt })}>
              {v !== "segmented" && <span className="gistui-choice__control" data-type="radio" {...api.getItemControlProps({ value: opt })} />}
              <span className="gistui-choice__body" {...api.getItemTextProps({ value: opt })}>
                <OptionBody title={opt} meta={v === "segmented" ? { icon: metaOf(props, i).icon } : metaOf(props, i)} card={card} />
              </span>
              <input {...api.getItemHiddenInputProps({ value: opt })} />
            </label>
          ),
        )}
      </div>
    </GroupShell>
  );
}

/** Pick many. Native checkboxes underneath, so forms submit and keyboards work as usual. */
export function CheckboxGroup({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const options = strings(props.options);
  const v = str(props.v) ?? "list";
  const card = v === "cards";
  const max = num(props.max);
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  const labelId = `${uid}-label`;
  const [own, setOwn] = useOwnValue<ReadonlySet<string>>(new Set(strings(props.value)));
  const picked: ReadonlySet<string> = b.bound ? new Set(strings(b.value)) : own;
  const setPicked = (f: (cur: ReadonlySet<string>) => ReadonlySet<string>) => (b.bound ? b.set([...f(picked)]) : setOwn(f));
  const toggle = (opt: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(opt)) next.delete(opt);
      else if (!max || next.size < max) next.add(opt);
      return next;
    });
  const name = str(props.name);
  const error = useField(name, { label: str(props.label), required: props.required === true || undefined, minLength: num(props.min), maxLength: max, message: str(props.error) }, "list");
  return (
    <GroupShell props={props} kind="CheckboxGroup" labelProps={{ id: labelId }} error={error} errorId={errorId}>
      <div
        className="gistui-choice"
        data-type="checkbox"
        data-v={v}
        data-dir={str(props.dir)}
        data-locked={locked || undefined}
        role="group"
        aria-labelledby={str(props.label) ? labelId : undefined}
        aria-describedby={error ? errorId : undefined}
        style={colsStyle(props)}
      >
        {options.map((opt, i) => {
          if (options.indexOf(opt) !== i) return null;
          const on = picked.has(opt);
          const full = Boolean(max && !on && picked.size >= max);
          return (
            <label key={opt} className="gistui-choice__item" data-state={on ? "checked" : "unchecked"} data-disabled={locked || full || undefined}>
              <input
                type="checkbox"
                className="gistui-sr-only"
                name={name}
                value={opt}
                checked={on}
                disabled={locked || full}
                aria-invalid={error ? true : undefined}
                onChange={() => toggle(opt)}
              />
              {v !== "chips" && (
                <span className="gistui-choice__control" data-type="checkbox" data-state={on ? "checked" : "unchecked"} aria-hidden>
                  <svg viewBox="0 0 12 12">
                    <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {v === "chips" && on && <IconSvg name="check" />}
              <span className="gistui-choice__body">
                <OptionBody title={opt} meta={v === "chips" ? { icon: metaOf(props, i).icon } : metaOf(props, i)} card={card} />
              </span>
            </label>
          );
        })}
      </div>
    </GroupShell>
  );
}

/** Free-form tags: Enter or comma adds, Backspace on an empty field removes the last, suggestions below. */
export function TagInput({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const id = useId();
  const b = useBinding(node);
  const [own, setOwn] = useOwnValue<string[]>(strings(props.value));
  const tags = unique(b.bound ? strings(b.value) : own);
  const setTags = (f: (cur: string[]) => string[]) => (b.bound ? b.set(f(tags)) : setOwn(f));
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // Tags change without a native input event: announce it, so the form can re-validate. Keyed on
  // the tags themselves (the array is new on every render), and not while the value is streaming in.
  const tagsKey = tags.join("\u0000");
  useEffect(() => {
    if (first.current || node.partial) {
      first.current = false;
      return;
    }
    box.current?.dispatchEvent(new Event("change", { bubbles: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey]);
  const max = num(props.max);
  const suggestions = unique(strings(props.options)).filter((o) => !tags.includes(o) && o.toLowerCase().includes(text.trim().toLowerCase()));
  const kind = str(props.type);
  const [bad, setBad] = useState<string | null>(null);
  // A form reset also clears what was typed but not yet added.
  const resets = useFormResets();
  useEffect(() => {
    setText("");
    setBad(null);
  }, [resets]);
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t || tags.includes(t)) return setText("");
    if (max && tags.length >= max) return setBad(`You can add up to ${max}`);
    // Typed tags (emails, URLs) are checked before they become a chip.
    if (kind === "email" && !isEmail(t)) return setBad(`"${t}" is not a valid email address`);
    if (kind === "url" && !isUrl(t)) return setBad(`"${t}" is not a valid URL (http:// or https://)`);
    setBad(null);
    setTags((xs) => [...xs, t]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && tags.length) {
      setTags((xs) => xs.slice(0, -1));
    }
  };
  const label = str(props.label);
  const hint = str(props.hint);
  const name = str(props.name);
  const error = useField(name, { label, required: props.required === true || undefined, minLength: num(props.min), maxLength: max, message: str(props.error), requiredMessage: `Add at least one ${kind === "email" ? "email address" : kind === "url" ? "URL" : "item"}` }, "list");
  return (
    <div className="gistui-field" data-gistui="TagInput" data-size={str(props.size)} data-invalid={error || bad ? "" : undefined}>
      {label && (
        <label className="gistui-field__label" htmlFor={id} data-required={props.required === true || undefined}>
          {label}
        </label>
      )}
      <div ref={box} className="gistui-taginput" data-field={name} data-locked={locked || undefined} onClick={() => input.current?.focus()}>
        {tags.map((t) => (
          <span key={t} className="gistui-tag" data-shape="pill" data-tone="accent">
            {t}
            <button type="button" className="gistui-combobox__remove" aria-label={`Remove ${t}`} disabled={locked} onClick={() => setTags((xs) => xs.filter((x) => x !== t))}>
              <IconSvg name="x" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          className="gistui-taginput__input"
          value={text}
          disabled={locked}
          placeholder={tags.length ? "" : (str(props.placeholder) ?? "Type and press Enter")}
          onChange={(e) => {
            setBad(null);
            if (e.target.value.endsWith(",")) add(e.target.value);
            else setText(e.target.value);
          }}
          inputMode={kind === "email" ? "email" : kind === "url" ? "url" : undefined}
          aria-invalid={bad || error ? true : undefined}
          aria-describedby={bad || error ? `${id}-error` : undefined}
          onKeyDown={onKey}

          onBlur={() => text && add(text)}
        />
        {name && tags.map((t) => <input key={t} type="hidden" name={name} value={t} />)}
      </div>
      {suggestions.length > 0 && (
        <div className="gistui-taginput__suggest" aria-label="Suggestions">
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} type="button" className="gistui-chip" disabled={locked} onClick={() => add(s)}>
              <IconSvg name="plus" />
              {s}
            </button>
          ))}
        </div>
      )}
      {bad || error ? <FieldError id={`${id}-error`} error={bad ?? error} /> : hint && <span className="gistui-field__hint">{hint}</span>}
    </div>
  );
}

const comboboxModule = lazyModule(() => import("./combobox").then((m) => m.ComboboxImpl));
export const preloadCombobox = (): Promise<unknown> => comboboxModule.load();

/** Searchable select. A look-alike input shows while the chunk loads. */
export function Combobox(p: ComponentProps): ReactNode {
  const { value: Impl } = useLazyModule(comboboxModule);
  if (Impl) return <Impl {...p} />;
  const { props } = p;
  return (
    <div className="gistui-field gistui-combobox" data-gistui="Combobox" data-size={str(props.size)}>
      <span className="gistui-field__label">{str(props.label)}</span>
      <div className="gistui-combobox__control">
        <IconSvg name="search" className="gistui-combobox__search" />
        <input className="gistui-input" placeholder={str(props.placeholder) ?? "Search…"} disabled />
      </div>
    </div>
  );
}
