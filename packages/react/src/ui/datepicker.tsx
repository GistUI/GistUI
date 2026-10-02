/**
 * DatePicker (single date, date range, optional time and presets) and TimePicker: custom, keyboard
 * accessible popovers (Zag's date-picker and select machines) styled by GistUI, never the browser's
 * native pickers. A lazily loaded chunk.
 *
 *   DatePicker("due", "Due date")
 *   DatePicker("trip", "Trip dates", range, presets, min:"2026-10-01")
 *   DatePicker("at", "Starts", time)          → "2026-10-01T14:30"
 *   TimePicker("slot", "Time", step:15, min:"09:00", max:"18:00")
 *
 * Values are ISO strings ("2026-10-01"); a range is two, carried as two form values under one name.
 */

import { parseDate, today, getLocalTimeZone, type DateValue } from "@internationalized/date";
import * as datepicker from "@zag-js/date-picker";
import { normalizeProps, useMachine } from "@zag-js/react";
import * as select from "@zag-js/select";
import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useLocked } from "../context";
import { num, str, useBinding } from "../hooks";
import type { ComponentProps } from "../library";
import { FieldError, useField, useOwnValue } from "./form";
import { IconSvg } from "./icon";

const toDate = (v: unknown): DateValue | undefined => {
  if (typeof v !== "string" || !v) return undefined;
  try {
    return parseDate(v.slice(0, 10));
  } catch {
    return undefined;
  }
};
const dates = (v: unknown): DateValue[] => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(toDate).filter((d): d is DateValue => Boolean(d));
const timeOf = (v: unknown): string | undefined => (typeof v === "string" && /T(\d{2}:\d{2})/.test(v) ? /T(\d{2}:\d{2})/.exec(v)![1] : undefined);

const PRESETS: { label: string; value: datepicker.PresetTriggerValue }[] = [
  { label: "Last 7 days", value: "last7Days" },
  { label: "Last 30 days", value: "last30Days" },
  { label: "Last 90 days", value: "last90Days" },
  { label: "This month", value: "thisMonth" },
  { label: "Last month", value: "lastMonth" },
  { label: "This quarter", value: "thisQuarter" },
  { label: "This year", value: "thisYear" },
];

function Month({ api, weeks, offset }: { api: datepicker.Api; weeks: DateValue[][]; offset?: datepicker.DateValueOffset }): ReactNode {
  const range = offset?.visibleRange ?? api.visibleRange;
  return (
    <table className="gistui-dp__table" {...api.getTableProps({ view: "day", id: offset ? `o${range.start.toString()}` : undefined })}>
      <thead {...api.getTableHeadProps({ view: "day" })}>
        <tr {...api.getTableRowProps({ view: "day" })}>
          {api.weekDays.map((d, i) => (
            <th key={i} scope="col" aria-label={d.long}>
              {d.narrow}
            </th>
          ))}
        </tr>
      </thead>
      <tbody {...api.getTableBodyProps({ view: "day" })}>
        {weeks.map((week, i) => (
          <tr key={i} {...api.getTableRowProps({ view: "day" })}>
            {week.map((day, j) => (
              <td key={j} {...api.getDayTableCellProps({ value: day, visibleRange: range })}>
                <div className="gistui-dp__day" {...api.getDayTableCellTriggerProps({ value: day, visibleRange: range })}>
                  {day.day}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimeList({ value, onChange, step = 30, open }: { value: string | undefined; onChange: (t: string) => void; step?: number; open: boolean }): ReactNode {
  const times = useMemo(() => {
    const out: string[] = [];
    for (let m = 0; m < 24 * 60; m += Math.max(5, step)) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    return out;
  }, [step]);
  const list = useRef<HTMLDivElement>(null);
  // Each time the picker opens, the selected time is in view.
  useEffect(() => {
    const el = list.current;
    const sel = el?.querySelector<HTMLElement>("[data-selected]");
    if (el && sel && open) el.scrollTop = sel.offsetTop - el.clientHeight / 2 + sel.offsetHeight / 2;
  }, [open]);
  // One tab stop (the selected time, else the first); the arrow keys, Home and End move between times.
  const stop = value !== undefined && times.includes(value) ? value : times[0];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : null;
    if (to === null) return;
    e.preventDefault();
    const options = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const at = options.indexOf(document.activeElement as HTMLElement);
    options[Math.max(0, Math.min(options.length - 1, (at < 0 ? 0 : at) + to))]?.focus();
  };
  return (
    <div className="gistui-dp__times" ref={list} role="listbox" aria-label="Time" onKeyDown={onKey}>
      {times.map((t) => (
        <button key={t} type="button" role="option" tabIndex={t === stop ? 0 : -1} aria-selected={t === value} data-selected={t === value || undefined} className="gistui-dp__time" onClick={() => onChange(t)}>
          {label12(t)}
        </button>
      ))}
    </div>
  );
}

function label12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
}

export function DatePicker({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const range = props.range === true;
  const withTime = props.time === true && !range;
  const name = str(props.name);
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  const [own, setOwn] = useOwnValue<string | string[] | null>(Array.isArray(props.value) ? props.value.map(String) : (str(props.value) ?? null));
  const current = b.bound ? (b.value as string | string[] | null) : own;
  const set = (v: string | string[] | null) => (b.bound ? b.set(v) : setOwn(v));
  // The time shown and submitted is the value's own (a bound value set from elsewhere brings its
  // time with it); a time picked before any date is kept for the date that follows.
  const [picked, setTime] = useOwnValue<string | undefined>(undefined);
  const time = timeOf(current) ?? picked ?? (withTime ? "09:00" : undefined);
  const error = useField(name, { label: str(props.label), required: props.required === true || undefined, message: str(props.error), minLength: range ? 2 : undefined }, range ? "list" : "text");
  const value = dates(current);
  const service = useMachine(datepicker.machine, {
    id: uid,
    locale: "en-US",
    timeZone: getLocalTimeZone(),
    selectionMode: range ? "range" : "single",
    numOfMonths: range ? 2 : 1,
    fixedWeeks: true,
    closeOnSelect: !withTime,
    disabled: locked,
    min: toDate(props.min),
    max: toDate(props.max),
    value,
    positioning: { placement: "bottom-start", strategy: "fixed", gutter: 6 },
    onValueChange: (d) => {
      const iso = d.value.map((x) => x.toString());
      if (range) set(iso.length ? iso : null);
      else set(iso[0] ? (withTime ? `${iso[0]}T${time ?? "09:00"}` : iso[0]) : null);
    },
  });
  const api = datepicker.connect(service, normalizeProps);
  const next = range ? api.getOffset({ months: 1 }) : undefined;
  const iso = value.map((d) => d.toString());
  const formValues = range ? iso : iso[0] ? [withTime ? `${iso[0]}T${time ?? "09:00"}` : iso[0]] : [];
  const pickTime = (t: string) => {
    setTime(t);
    if (iso[0]) set(`${iso[0]}T${t}`);
  };
  // The value changes without a native input event: announce it, so the form can re-validate.
  const root = useRef<HTMLDivElement>(null);
  const valueKey = formValues.join("\u0000");
  const first = useRef(true);
  useEffect(() => {
    if (first.current || node.partial) {
      first.current = false;
      return;
    }
    root.current?.dispatchEvent(new Event("change", { bubbles: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);
  return (
    // `data-field`: the named (hidden) inputs only exist once a date is picked, so a Form finds the field by this.
    <div className="gistui-field gistui-dp" data-gistui="DatePicker" data-size={str(props.size)} data-invalid={error ? "" : undefined} {...api.getRootProps()} ref={root} data-field={name}>
      <label className="gistui-field__label" {...api.getLabelProps()} data-required={props.required === true || undefined}>
        {str(props.label)}
      </label>
      <div className="gistui-dp__control" {...api.getControlProps()}>
        <input className="gistui-dp__input" {...api.getInputProps({ index: 0 })} placeholder={range ? "Start" : "Pick a date"} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
        {range && (
          <>
            <span className="gistui-dp__to" aria-hidden>
              <IconSvg name="arrow-right" />
            </span>
            <input className="gistui-dp__input" {...api.getInputProps({ index: 1 })} placeholder="End" />
          </>
        )}
        {withTime && time && <span className="gistui-dp__time-chip">{label12(time)}</span>}
        <button className="gistui-dp__trigger" {...api.getTriggerProps()}>
          <IconSvg name="calendar" />
        </button>
      </div>
      {name && formValues.map((v, i) => <input key={i} type="hidden" name={name} value={v} />)}
      {error ? <FieldError id={errorId} error={error} /> : str(props.hint) && <span className="gistui-field__hint">{str(props.hint)}</span>}
      <div {...api.getPositionerProps()}>
        <div className="gistui-popover gistui-dp__content" data-range={range || undefined} {...api.getContentProps()}>
          {range && props.presets === true && (
            <div className="gistui-dp__presets">
              {PRESETS.map((p) => (
                <button key={p.label} className="gistui-dp__preset" {...api.getPresetTriggerProps({ value: p.value })}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="gistui-dp__main">
            <div hidden={api.view !== "day"} {...api.getViewProps({ view: "day" })}>
              <div className="gistui-dp__nav" {...api.getViewControlProps({ view: "day" })}>
                <button className="gistui-dp__navbtn" {...api.getPrevTriggerProps()}>
                  <IconSvg name="chevron-left" />
                </button>
                <button className="gistui-dp__title" {...api.getViewTriggerProps()}>
                  {api.visibleRangeText.start}
                  {range && next ? ` – ${next.visibleRangeText.start}` : ""}
                </button>
                <button className="gistui-dp__navbtn" {...api.getNextTriggerProps()}>
                  <IconSvg name="chevron-right" />
                </button>
              </div>
              <div className="gistui-dp__months">
                <Month api={api} weeks={api.weeks} />
                {next && <Month api={api} weeks={next.weeks} offset={next} />}
              </div>
            </div>
            <div hidden={api.view !== "month"} {...api.getViewProps({ view: "month" })}>
              <div className="gistui-dp__nav" {...api.getViewControlProps({ view: "month" })}>
                <button className="gistui-dp__navbtn" {...api.getPrevTriggerProps({ view: "month" })}>
                  <IconSvg name="chevron-left" />
                </button>
                <button className="gistui-dp__title" {...api.getViewTriggerProps({ view: "month" })}>
                  {api.visibleRange.start.year}
                </button>
                <button className="gistui-dp__navbtn" {...api.getNextTriggerProps({ view: "month" })}>
                  <IconSvg name="chevron-right" />
                </button>
              </div>
              <table className="gistui-dp__grid" {...api.getTableProps({ view: "month", columns: 3 })}>
                <tbody {...api.getTableBodyProps({ view: "month" })}>
                  {api.getMonthsGrid({ columns: 3, format: "short" }).map((row, i) => (
                    <tr key={i} {...api.getTableRowProps({ view: "month" })}>
                      {row.map((m, j) => (
                        <td key={j} {...api.getMonthTableCellProps({ ...m, columns: 3 })}>
                          <div className="gistui-dp__cell" {...api.getMonthTableCellTriggerProps({ ...m, columns: 3 })}>
                            {m.label}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div hidden={api.view !== "year"} {...api.getViewProps({ view: "year" })}>
              <div className="gistui-dp__nav" {...api.getViewControlProps({ view: "year" })}>
                <button className="gistui-dp__navbtn" {...api.getPrevTriggerProps({ view: "year" })}>
                  <IconSvg name="chevron-left" />
                </button>
                <span className="gistui-dp__title">
                  {api.getDecade().start} – {api.getDecade().end}
                </span>
                <button className="gistui-dp__navbtn" {...api.getNextTriggerProps({ view: "year" })}>
                  <IconSvg name="chevron-right" />
                </button>
              </div>
              <table className="gistui-dp__grid" {...api.getTableProps({ view: "year", columns: 4 })}>
                <tbody {...api.getTableBodyProps({ view: "year" })}>
                  {api.getYearsGrid({ columns: 4 }).map((row, i) => (
                    <tr key={i} {...api.getTableRowProps({ view: "year" })}>
                      {row.map((y, j) => (
                        <td key={j} {...api.getYearTableCellProps({ ...y, columns: 4 })}>
                          <div className="gistui-dp__cell" {...api.getYearTableCellTriggerProps({ ...y, columns: 4 })}>
                            {y.label}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="gistui-dp__foot">
              <button type="button" className="gistui-dp__link" onClick={() => api.setValue(range ? [today(getLocalTimeZone()), today(getLocalTimeZone())] : [today(getLocalTimeZone())])}>
                Today
              </button>
              {value.length > 0 && (
                <button className="gistui-dp__link" {...api.getClearTriggerProps()}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {withTime && <TimeList value={time} onChange={pickTime} step={num(props.step) ?? 30} open={api.open} />}
        </div>
      </div>
    </div>
  );
}

export function TimePicker({ node, props }: ComponentProps): ReactNode {
  const locked = useLocked(node);
  const step = Math.max(5, num(props.step) ?? 30);
  const min = str(props.min) ?? "00:00";
  const max = str(props.max) ?? "23:59";
  const items = useMemo(() => {
    const out: string[] = [];
    for (let m = 0; m < 24 * 60; m += step) {
      const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (t >= min && t <= max) out.push(t);
    }
    return out;
  }, [step, min, max]);
  const collection = useMemo(() => select.collection({ items, itemToString: label12, itemToValue: (x) => x }), [items]);
  const b = useBinding(node);
  const uid = useId();
  const errorId = `${uid}-error`;
  const [own, setOwn] = useOwnValue<string | null>(str(props.value) ?? null);
  const error = useField(str(props.name), { label: str(props.label), required: props.required === true || undefined, message: str(props.error) });
  const service = useMachine(select.machine, {
    id: uid,
    collection,
    name: str(props.name),
    disabled: locked,
    positioning: { sameWidth: true, gutter: 6, strategy: "fixed" },
    ...(b.bound
      ? { value: b.value ? [String(b.value)] : [], onValueChange: (d: { value: string[] }) => b.set(d.value[0] ?? null) }
      : { value: own ? [own] : [], onValueChange: (d: { value: string[] }) => setOwn(d.value[0] ?? null) }),
  });
  const api = select.connect(service, normalizeProps);
  return (
    // `data-invalid` after Zag's root props, which carry their own (always unset here).
    <div className="gistui-field gistui-select" data-gistui="TimePicker" data-size={str(props.size)} {...api.getRootProps()} data-invalid={error ? "" : undefined}>
      <label className="gistui-field__label" {...api.getLabelProps()} data-required={props.required === true || undefined}>
        {str(props.label)}
      </label>
      <div {...api.getControlProps()}>
        <button type="button" {...api.getTriggerProps()} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
          <span {...api.getValueTextProps()}>{api.valueAsString || str(props.placeholder) || "Pick a time"}</span>
          <span {...api.getIndicatorProps()} aria-hidden>
            <IconSvg name="clock" />
          </span>
        </button>
      </div>
      <select {...api.getHiddenSelectProps()}>
        <option value="" />
        {items.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {error ? <FieldError id={errorId} error={error} /> : str(props.hint) && <span className="gistui-field__hint">{str(props.hint)}</span>}

      <div {...api.getPositionerProps()}>
        <ul className="gistui-popover gistui-tp__list" {...api.getContentProps()}>
          {items.map((item) => (
            <li key={item} className="gistui-option" {...api.getItemProps({ item })}>
              <span {...api.getItemTextProps({ item })}>{label12(item)}</span>
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
