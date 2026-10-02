/**
 * DatePicker (single date, date range, optional time and presets) and TimePicker on Zag's date-picker
 * and select machines (vanilla): the same markup, keyboard handling and ARIA as `@gistui/react`.
 *
 *   DatePicker("due", "Due date")
 *   DatePicker("trip", "Trip dates", range, presets, min:"2026-10-01")
 *   DatePicker("at", "Starts", time)          → "2026-10-01T14:30"
 *   TimePicker("slot", "Time", step:15, min:"09:00", max:"18:00")
 *
 * Values are ISO strings ("2026-10-01"); a range is two, carried as two form values under one name.
 * Calendar cells are reused in place, so the focused day keeps its element while you move around.
 */

import { getLocalTimeZone, parseDate, today, type DateValue } from "@internationalized/date";
import * as datepicker from "@zag-js/date-picker";
import * as select from "@zag-js/select";
import { normalizeProps, VanillaMachine } from "@zag-js/vanilla";
import { h, num, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { boundValue, errorLine, fieldLink } from "./form";
import { flag, mark } from "./attrs";
import { iconEl } from "./icon";
import { keep } from "./keep";
import { propsChanged, zagId, zagParts, type ZagParts } from "./zag";

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

function label12(t: string): string {
  const [hh, m] = t.split(":").map(Number);
  return `${((hh! + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${hh! < 12 ? "AM" : "PM"}`;
}
function timesOf(step: number, min = "00:00", max = "23:59"): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += Math.max(5, step)) {
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (t >= min && t <= max) out.push(t);
  }
  return out;
}

const PRESETS: { label: string; value: datepicker.PresetTriggerValue }[] = [
  { label: "Last 7 days", value: "last7Days" },
  { label: "Last 30 days", value: "last30Days" },
  { label: "Last 90 days", value: "last90Days" },
  { label: "This month", value: "thisMonth" },
  { label: "Last month", value: "lastMonth" },
  { label: "This quarter", value: "thisQuarter" },
  { label: "This year", value: "thisYear" },
];

type Parts = ZagParts;
type Props = Record<string, unknown>;

/** Rows of cells (td > div), reused by position: `fill(cell, trigger, item)` sets each one. */
function grid<T>(parts: Parts, body: HTMLElement, rows: readonly (readonly T[])[], rowProps: Props, cell: (item: T) => Props, trigger: (item: T) => Props, text: (item: T) => string, cls: string): void {
  const trs: Node[] = [];
  rows.forEach((row, i) => {
    let tr = body.children[i] as HTMLTableRowElement | undefined;
    if (!tr) tr = h("tr");
    parts.spread(tr, rowProps);
    const tds: Node[] = [];
    row.forEach((item, j) => {
      let td = tr!.children[j] as HTMLTableCellElement | undefined;
      if (!td) td = h("td", null, h("div", { class: cls }));
      const div = td.firstElementChild as HTMLElement;
      parts.spread(td, cell(item));
      parts.spread(div, trigger(item));
      setAttrs(div, { class: cls });
      setText(div, text(item));
      tds.push(td);
    });
    syncChildren(tr, tds);
    trs.push(tr);
  });
  syncChildren(body, trs);
}

/** One month's day table, kept between redraws. */
function monthTable(parts: Parts) {
  const headRow = h("tr");
  const head = h("thead", null, headRow);
  const body = h("tbody");
  const table = h("table", { class: "gistui-dp__table" }, head, body);
  return {
    el: table,
    draw(api: datepicker.Api, weeks: DateValue[][], offset?: datepicker.DateValueOffset) {
      const range = offset?.visibleRange ?? api.visibleRange;
      parts.spread(table, api.getTableProps({ view: "day", id: offset ? `o${range.start.toString()}` : undefined }));
      setAttrs(table, { class: "gistui-dp__table" });
      parts.spread(head, api.getTableHeadProps({ view: "day" }));
      parts.spread(headRow, api.getTableRowProps({ view: "day" }));
      syncChildren(
        headRow,
        api.weekDays.map((d, i) => {
          const th = (headRow.children[i] as HTMLElement | undefined) ?? h("th", { scope: "col" });
          setAttrs(th, { "aria-label": d.long });
          setText(th, d.narrow);
          return th;
        }),
      );
      parts.spread(body, api.getTableBodyProps({ view: "day" }));
      grid(
        parts,
        body,
        weeks,
        api.getTableRowProps({ view: "day" }),
        (day) => api.getDayTableCellProps({ value: day, visibleRange: range }),
        (day) => api.getDayTableCellTriggerProps({ value: day, visibleRange: range }),
        (day) => String(day.day),
        "gistui-dp__day",
      );
    },
  };
}

/** A view's header: previous, title, next. */
function navBar(title: HTMLElement) {
  const prev = h("button", { class: "gistui-dp__navbtn" }, iconEl("chevron-left"));
  const next = h("button", { class: "gistui-dp__navbtn" }, iconEl("chevron-right"));
  return { el: h("div", { class: "gistui-dp__nav" }, prev, title, next), prev, next, title };
}

export const DatePicker: DomRenderer = (ctx) => {
  let c = ctx;
  const id = zagId("datepicker");
  const range0 = ctx.props.range === true;
  const isRange = () => c.props.range === true;
  const withTime = () => c.props.time === true && !isRange();
  // The bound `$var`, or the picker's own value (the program's `value:` until the user picks a date).
  // When the bound variable changes elsewhere (`@set`, another control) the machine reads it again.
  const value = boundValue<string | string[] | null>(
    ctx,
    (x) => (Array.isArray(x.props.value) ? x.props.value.map(String) : (str(x.props.value) ?? null)),
    () => propsChanged(machine, machineProps),
  );
  const current = (): unknown => value.get();
  // Either way the machine reads its value again and the subscription below draws.
  const set = (v: string | string[] | null) => {
    value.set(v);
    if (!value.bound) propsChanged(machine, machineProps);
  };
  // The time shown and submitted is the value's own; a time picked before any date is kept for it.
  let picked: string | undefined;
  const timeNow = (): string | undefined => timeOf(current()) ?? picked ?? (withTime() ? "09:00" : undefined);
  const machineProps = () => {
    const range = isRange();
    const wt = withTime();
    return {
      id,
      locale: "en-US",
      timeZone: getLocalTimeZone(),
      selectionMode: (range ? "range" : "single") as "range" | "single",
      numOfMonths: range ? 2 : 1,
      fixedWeeks: true,
      closeOnSelect: !wt,
      disabled: c.locked,
      min: toDate(c.props.min),
      max: toDate(c.props.max),
      value: dates(current()),
      positioning: { placement: "bottom-start" as const, strategy: "fixed" as const, gutter: 6 },
      onValueChange: (d: { value: DateValue[] }) => {
        const iso = d.value.map((x) => x.toString());
        if (isRange()) set(iso.length ? iso : null);
        else set(iso[0] ? (withTime() ? `${iso[0]}T${timeNow() ?? "09:00"}` : iso[0]) : null);
      },
    };
  };
  const machine: VanillaMachine<any> = new VanillaMachine(datepicker.machine, machineProps);
  machine.start();
  const parts = zagParts();

  const root = h("div", { class: "gistui-field gistui-dp", "data-gistui": "DatePicker" });
  const label = h("label", { class: "gistui-field__label" });
  const input0 = h("input", { class: "gistui-dp__input" });
  const input1 = h("input", { class: "gistui-dp__input", placeholder: "End" });
  const to = h("span", { class: "gistui-dp__to", "aria-hidden": "true" }, iconEl("arrow-right"));
  const timeChip = h("span", { class: "gistui-dp__time-chip" });
  const trigger = h("button", { class: "gistui-dp__trigger" }, iconEl("calendar"));
  const control = h("div", { class: "gistui-dp__control" });
  const hint = h("span", { class: "gistui-field__hint" });
  const presets = h("div", { class: "gistui-dp__presets" });
  // Day view
  const dayTitle = h("button", { class: "gistui-dp__title" });
  const dayNav = navBar(dayTitle);
  const month0 = monthTable(parts);
  const month1 = monthTable(parts);
  const months = h("div", { class: "gistui-dp__months" });
  const dayView = h("div", null, dayNav.el, months);
  // Month view
  const monthTitle = h("button", { class: "gistui-dp__title" });
  const monthNav = navBar(monthTitle);
  const monthBody = h("tbody");
  const monthGrid = h("table", { class: "gistui-dp__grid" }, monthBody);
  const monthView = h("div", null, monthNav.el, monthGrid);
  // Year view
  const yearTitle = h("span", { class: "gistui-dp__title" });
  const yearNav = navBar(yearTitle);
  const yearBody = h("tbody");
  const yearGrid = h("table", { class: "gistui-dp__grid" }, yearBody);
  const yearView = h("div", null, yearNav.el, yearGrid);
  const todayBtn = h("button", { type: "button", class: "gistui-dp__link" }, "Today");
  const clearBtn = h("button", { class: "gistui-dp__link" }, "Clear");
  const foot = h("div", { class: "gistui-dp__foot" });
  const mainPane = h("div", { class: "gistui-dp__main" }, dayView, monthView, yearView, foot);
  const times = h("div", { class: "gistui-dp__times", role: "listbox", "aria-label": "Time" });
  const timeOfButton = new WeakMap<Element, string>();
  times.addEventListener("keydown", (e) => {
    const to = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : null;
    if (to === null) return;
    e.preventDefault();
    const options = Array.from(times.querySelectorAll<HTMLElement>('[role="option"]'));
    const at = options.indexOf(document.activeElement as HTMLElement);
    options[Math.max(0, Math.min(options.length - 1, (at < 0 ? 0 : at) + to))]?.focus();
  });
  const content = h("div", { class: "gistui-popover gistui-dp__content" });
  const positioner = h("div", null, content);
  todayBtn.addEventListener("click", () => {
    const api = datepicker.connect(machine.service, normalizeProps);
    const t = today(getLocalTimeZone());
    api.setValue(isRange() ? [t, t] : [t]);
  });
  const link = fieldLink(
    ctx,
    () => draw(),
    // A form reset: back to the program's value (a bound variable is the program's to reset).
    () => {
      value.reset();
      picked = undefined;
      propsChanged(machine, machineProps);
    },
  );
  const formInputs: HTMLInputElement[] = [];
  let timesKey = "";
  let wasOpen = false;
  let lastValue: string | null = null;

  const draw = () => {
    const api = datepicker.connect(machine.service, normalizeProps);
    const p = c.props;
    const range = isRange();
    const wt = withTime();
    const name = str(p.name);
    link.sync(c, name, { label: str(p.label), required: p.required === true || undefined, message: str(p.error), minLength: range ? 2 : undefined }, range ? "list" : "text");
    const error = link.error();
    const errorId = `${id}-error`;
    const time = timeNow();
    const iso = dates(current()).map((d) => d.toString());
    const formValues = range ? iso : iso[0] ? [wt ? `${iso[0]}T${time ?? "09:00"}` : iso[0]] : [];

    // `data-field`: the named (hidden) inputs only exist once a date is picked, so a Form finds the
    // field by this (a step's fields, and whose error to re-check when the value changes).
    parts.spread(root, api.getRootProps());
    setAttrs(root, { class: "gistui-field gistui-dp", "data-size": str(p.size), "data-invalid": mark(error), "data-field": name });
    parts.spread(label, api.getLabelProps());
    setAttrs(label, { class: "gistui-field__label", "data-required": flag(p.required === true) });
    setText(label, str(p.label) ?? "");
    parts.spread(control, api.getControlProps());
    setAttrs(control, { class: "gistui-dp__control" });
    parts.spread(input0, api.getInputProps({ index: 0 }));
    setAttrs(input0, { class: "gistui-dp__input", placeholder: range ? "Start" : "Pick a date", "aria-invalid": flag(error), "aria-describedby": error ? errorId : undefined, value: input0.value || undefined });
    if (range) {
      parts.spread(input1, api.getInputProps({ index: 1 }));
      setAttrs(input1, { class: "gistui-dp__input", placeholder: "End", value: input1.value || undefined });
    }
    setText(timeChip, wt && time ? label12(time) : "");
    parts.spread(trigger, api.getTriggerProps());
    setAttrs(trigger, { class: "gistui-dp__trigger" });
    syncChildren(control, [input0, ...(range ? [to, input1] : []), ...(wt && time ? [timeChip] : []), trigger]);
    const hiddens = name
      ? formValues.map((v, i) => {
          const hidden = (formInputs[i] ??= h("input", { type: "hidden" }));
          setAttrs(hidden, { name, value: v });
          return hidden;
        })
      : [];
    setText(hint, str(p.hint) ?? "");
    const tail = error ? [errorLine(errorId, error)] : str(p.hint) ? [hint] : [];

    // Popover
    parts.spread(positioner, api.getPositionerProps());
    parts.spread(content, api.getContentProps());
    setAttrs(content, { class: "gistui-popover gistui-dp__content", "data-range": flag(range) });
    const withPresets = range && p.presets === true;
    if (withPresets && !presets.firstChild) {
      for (const pr of PRESETS) presets.append(h("button", { class: "gistui-dp__preset" }, pr.label));
    }
    if (withPresets) PRESETS.forEach((pr, i) => parts.spread(presets.children[i]!, api.getPresetTriggerProps({ value: pr.value })));
    for (const b of Array.from(presets.children)) setAttrs(b, { class: "gistui-dp__preset" });

    // Day view: one month, or two side by side for a range.
    const next = range ? api.getOffset({ months: 1 }) : undefined;
    parts.spread(dayView, api.getViewProps({ view: "day" }));
    setAttrs(dayView, { hidden: api.view !== "day" });
    parts.spread(dayNav.el, api.getViewControlProps({ view: "day" }));
    setAttrs(dayNav.el, { class: "gistui-dp__nav" });
    parts.spread(dayNav.prev, api.getPrevTriggerProps());
    parts.spread(dayNav.next, api.getNextTriggerProps());
    parts.spread(dayTitle, api.getViewTriggerProps());
    for (const b of [dayNav.prev, dayNav.next]) setAttrs(b, { class: "gistui-dp__navbtn" });
    setAttrs(dayTitle, { class: "gistui-dp__title" });
    setText(dayTitle, `${api.visibleRangeText.start}${range && next ? ` – ${next.visibleRangeText.start}` : ""}`);
    month0.draw(api, api.weeks);
    if (next) month1.draw(api, next.weeks, next);
    syncChildren(months, [month0.el, ...(next ? [month1.el] : [])]);

    // Month view
    parts.spread(monthView, api.getViewProps({ view: "month" }));
    setAttrs(monthView, { hidden: api.view !== "month" });
    parts.spread(monthNav.el, api.getViewControlProps({ view: "month" }));
    setAttrs(monthNav.el, { class: "gistui-dp__nav" });
    parts.spread(monthNav.prev, api.getPrevTriggerProps({ view: "month" }));
    parts.spread(monthNav.next, api.getNextTriggerProps({ view: "month" }));
    parts.spread(monthTitle, api.getViewTriggerProps({ view: "month" }));
    for (const b of [monthNav.prev, monthNav.next]) setAttrs(b, { class: "gistui-dp__navbtn" });
    setAttrs(monthTitle, { class: "gistui-dp__title" });
    setText(monthTitle, String(api.visibleRange.start.year));
    parts.spread(monthGrid, api.getTableProps({ view: "month", columns: 3 }));
    setAttrs(monthGrid, { class: "gistui-dp__grid" });
    parts.spread(monthBody, api.getTableBodyProps({ view: "month" }));
    grid(
      parts,
      monthBody,
      api.getMonthsGrid({ columns: 3, format: "short" }),
      api.getTableRowProps({ view: "month" }),
      (m) => api.getMonthTableCellProps({ ...m, columns: 3 }),
      (m) => api.getMonthTableCellTriggerProps({ ...m, columns: 3 }),
      (m) => m.label,
      "gistui-dp__cell",
    );

    // Year view
    parts.spread(yearView, api.getViewProps({ view: "year" }));
    setAttrs(yearView, { hidden: api.view !== "year" });
    parts.spread(yearNav.el, api.getViewControlProps({ view: "year" }));
    setAttrs(yearNav.el, { class: "gistui-dp__nav" });
    parts.spread(yearNav.prev, api.getPrevTriggerProps({ view: "year" }));
    parts.spread(yearNav.next, api.getNextTriggerProps({ view: "year" }));
    for (const b of [yearNav.prev, yearNav.next]) setAttrs(b, { class: "gistui-dp__navbtn" });
    const decade = api.getDecade();
    setText(yearTitle, `${decade.start} – ${decade.end}`);
    parts.spread(yearGrid, api.getTableProps({ view: "year", columns: 4 }));
    setAttrs(yearGrid, { class: "gistui-dp__grid" });
    parts.spread(yearBody, api.getTableBodyProps({ view: "year" }));
    grid(
      parts,
      yearBody,
      api.getYearsGrid({ columns: 4 }),
      api.getTableRowProps({ view: "year" }),
      (y) => api.getYearTableCellProps({ ...y, columns: 4 }),
      (y) => api.getYearTableCellTriggerProps({ ...y, columns: 4 }),
      (y) => y.label,
      "gistui-dp__cell",
    );

    parts.spread(clearBtn, api.getClearTriggerProps());
    setAttrs(clearBtn, { class: "gistui-dp__link" });
    syncChildren(foot, [todayBtn, ...(iso.length ? [clearBtn] : [])]);

    // Time list (DatePicker with time).
    if (wt) {
      const step = num(p.step) ?? 30;
      if (String(step) !== timesKey) {
        timesKey = String(step);
        syncChildren(
          times,
          timesOf(step).map((t) => {
            const b = h("button", { type: "button", role: "option", class: "gistui-dp__time" });
            b.textContent = label12(t);
            timeOfButton.set(b, t);
            b.addEventListener("click", () => {
              picked = t;
              const first = dates(current())[0];
              if (first) set(`${first.toString()}T${t}`);
              else draw();
            });
            return b;
          }),
        );
      }
      // One tab stop (the selected time, else the first); the arrow keys, Home and End move between times.
      const all = Array.from(times.children);
      const stop = all.find((b) => timeOfButton.get(b) === time) ?? all[0];
      for (const b of all) {
        const sel = timeOfButton.get(b) === time;
        setAttrs(b, { tabindex: b === stop ? 0 : -1, "aria-selected": sel ? "true" : "false", "data-selected": flag(sel) });
      }
      // Each time the picker opens, the selected time is in view.
      if (api.open && !wasOpen) {
        const sel = times.querySelector<HTMLElement>("[data-selected]");
        if (sel) times.scrollTop = sel.offsetTop - times.clientHeight / 2 + sel.offsetHeight / 2;
      }
    }
    wasOpen = api.open;
    syncChildren(content, [...(withPresets ? [presets] : []), mainPane, ...(wt ? [times] : [])]);
    syncChildren(root, [label, control, ...hiddens, ...tail, positioner]);

    // The value changes without a native input event: announce it, so the form can re-validate.
    const key = formValues.join("\u0000");
    if (lastValue !== null && key !== lastValue) root.dispatchEvent(new Event("change", { bubbles: true }));
    lastValue = key;
  };
  const off = machine.subscribe(() => draw());
  draw();
  return {
    el: root,
    update(n: DomContext) {
      c = n;
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

export const TimePicker: DomRenderer = (ctx) => {
  let c = ctx;
  const id = zagId("timepicker");
  const items = () => timesOf(Math.max(5, num(c.props.step) ?? 30), str(c.props.min) ?? "00:00", str(c.props.max) ?? "23:59");
  let key = "";
  let collection = select.collection<string>({ items: [], itemToString: label12, itemToValue: (x) => x });
  // The bound `$var`, or the picker's own time (the program's `value:` until the user picks one).
  const value = boundValue<string | null>(ctx, (x) => str(x.props.value) ?? null, () => propsChanged(machine, machineProps));
  const machineProps = () => {
    const list = items();
    const k = list.join(",");
    if (k !== key) {
      key = k;
      collection = select.collection<string>({ items: list, itemToString: label12, itemToValue: (x) => x });
    }
    const now = value.get();
    return {
      id,
      collection,
      name: str(c.props.name),
      disabled: c.locked,
      positioning: { sameWidth: true, gutter: 6, strategy: "fixed" as const },
      value: now ? [String(now)] : [],
      onValueChange: (d: { value: string[] }) => {
        value.set(d.value[0] ?? null);
        if (!value.bound) propsChanged(machine, machineProps);
      },
    };
  };
  const machine: VanillaMachine<any> = new VanillaMachine(select.machine, machineProps);
  machine.start();
  const parts = zagParts();
  const root = h("div", { class: "gistui-field gistui-select", "data-gistui": "TimePicker" });
  const label = h("label", { class: "gistui-field__label" });
  const valueText = h("span");
  const indicator = h("span", { "aria-hidden": "true" }, iconEl("clock"));
  const trigger = h("button", { type: "button" }, valueText, indicator);
  const control = h("div", null, trigger);
  const hidden = h("select");
  const content = h("ul", { class: "gistui-popover gistui-tp__list" });
  const positioner = h("div", null, content);
  const hint = h("span", { class: "gistui-field__hint" });
  const link = fieldLink(
    ctx,
    () => draw(),
    // A form reset: back to the program's time (a bound variable is the program's to reset).
    () => {
      value.reset();
      propsChanged(machine, machineProps);
    },
  );
  // Times keep their elements (by value): opening the list or moving over it patches attributes.
  const rows = keep<{ li: HTMLLIElement; text: HTMLSpanElement; check: HTMLSpanElement }>();
  let hiddenKey: string | null = null;
  let lastValue: string | null = null;

  const draw = () => {
    const api = select.connect(machine.service, normalizeProps);
    const p = c.props;
    link.sync(c, str(p.name), { label: str(p.label), required: p.required === true || undefined, message: str(p.error) });
    const error = link.error();
    parts.spread(root, api.getRootProps());
    const errorId = `${id}-error`;
    setAttrs(root, { class: "gistui-field gistui-select", "data-size": str(p.size), "data-invalid": mark(error) });
    parts.spread(label, api.getLabelProps());
    setAttrs(label, { class: "gistui-field__label", "data-required": flag(p.required === true) });
    setText(label, str(p.label) ?? "");
    parts.spread(control, api.getControlProps());
    parts.spread(trigger, api.getTriggerProps());
    setAttrs(trigger, { "aria-invalid": flag(error), "aria-describedby": error ? errorId : undefined });
    parts.spread(valueText, api.getValueTextProps());
    setText(valueText, api.valueAsString || str(p.placeholder) || "Pick a time");
    parts.spread(indicator, api.getIndicatorProps());
    setAttrs(indicator, { "aria-hidden": "true" });
    const list = items();
    parts.spread(hidden, api.getHiddenSelectProps());
    if (key !== hiddenKey) {
      hiddenKey = key;
      syncChildren(hidden, [h("option", { value: "" }), ...list.map((t) => h("option", { value: t }, t))]);
    }
    for (const o of Array.from(hidden.options)) {
      const on = api.value.includes(o.value);
      if (o.selected !== on) o.selected = on;
    }
    parts.spread(positioner, api.getPositionerProps());
    parts.spread(content, api.getContentProps());
    setAttrs(content, { class: "gistui-popover gistui-tp__list" });
    syncChildren(
      content,
      list.map((item) => {
        const row = rows.get(item, () => {
          const text = h("span", null, label12(item));
          const check = h("span", { class: "gistui-option__check" }, iconEl("check"));
          return { li: h("li", { class: "gistui-option" }, text, check), text, check };
        });
        parts.spread(row.li, api.getItemProps({ item }));
        setAttrs(row.li, { class: "gistui-option" });
        parts.spread(row.text, api.getItemTextProps({ item }));
        parts.spread(row.check, api.getItemIndicatorProps({ item }));
        setAttrs(row.check, { class: "gistui-option__check", "aria-hidden": "true" });
        return row.li;
      }),
    );
    rows.prune((row) => parts.forget(row.li, row.text, row.check));
    setText(hint, str(p.hint) ?? "");
    const tail = error ? [errorLine(errorId, error)] : str(p.hint) ? [hint] : [];
    syncChildren(root, [label, control, hidden, ...tail, positioner]);
    const value = api.value.join(",");
    if (lastValue !== null && value !== lastValue) hidden.dispatchEvent(new Event("change", { bubbles: true }));
    lastValue = value;
  };
  const off = machine.subscribe(() => draw());
  draw();
  return {
    el: root,
    update(n: DomContext) {
      c = n;
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
