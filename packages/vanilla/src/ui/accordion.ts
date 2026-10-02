/** Accordion and its Items on Zag's accordion machine (vanilla), as in `@gistui/react`. */

import * as accordion from "@zag-js/accordion";
import { normalizeProps, VanillaMachine } from "@zag-js/vanilla";
import { h, setAttrs, setText, str, syncChildren } from "../dom";
import type { DomContext, DomRenderer } from "../types";
import { iconEl } from "./icon";
import { propsChanged, zagId, zagParts } from "./zag";

const ACCORDION = Symbol("gistui.accordion");
interface AccordionHandle {
  api(): accordion.Api;
  subscribe(cb: () => void): () => void;
}

export const Accordion: DomRenderer = (ctx) => {
  let c = ctx;
  let value: string[] = [];
  // Items flagged `open` open once, when they first arrive; after that the user decides.
  const seen = new Set<string>();
  const machineProps = () => ({
    id: zagIdOnce,
    value,
    multiple: Boolean(c.props.multiple),
    collapsible: true,
    onValueChange: (d: { value: string[] }) => {
      value = d.value;
      propsChanged(machine, machineProps);
      notify();
    },
  });
  const zagIdOnce = zagId("accordion");
  const machine: VanillaMachine<any> = new VanillaMachine(accordion.machine, machineProps);
  machine.start();
  const listeners = new Set<() => void>();
  // A controlled value changed through props: the vanilla machine does not notify for that, so the
  // Items are told here.
  const notify = () => {
    for (const cb of [...listeners]) cb();
  };
  const handle: AccordionHandle = {
    api: () => accordion.connect(machine.service, normalizeProps),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  ctx.provide(ACCORDION, handle);
  const parts = zagParts();
  const el = h("div", { class: "gistui-accordion", "data-gistui": "Accordion" });
  const off = machine.subscribe(() => {
    parts.spread(el, handle.api().getRootProps());
    setAttrs(el, { class: "gistui-accordion" });
    for (const cb of [...listeners]) cb();
  });
  const apply = (next: DomContext) => {
    c = next;
    c.provide(ACCORDION, handle);
    c.watch(c.childList.map((e) => e.id));
    const opened = c.childList.filter((e) => !seen.has(e.id) && e.node?.props.open === true).map((e) => e.id);
    for (const e of c.childList) if (e.node) seen.add(e.id);
    if (opened.length) {
      value = c.props.multiple ? [...value, ...opened] : [opened[0]!];
      propsChanged(machine, machineProps);
      queueMicrotask(notify);
    }
    parts.spread(el, handle.api().getRootProps());
    setAttrs(el, { class: "gistui-accordion" });
    c.place(el);
  };
  apply(ctx);
  return {
    el,
    update(next) {
      apply(next);
      return true;
    },
    destroy() {
      off();
      parts.clear();
      machine.stop();
    },
  };
};

export const Item: DomRenderer = (ctx) => {
  let c = ctx;
  const handle = ctx.consume<AccordionHandle>(ACCORDION);
  const body = h("div");
  const title = h("span");
  if (!handle) {
    // An Item outside an Accordion still works, as a native disclosure.
    const summary = h("summary", null, title);
    const el = h("details", { class: "gistui-accordion" }, summary, body);
    const apply = (next: DomContext) => {
      c = next;
      setText(title, str(c.props.title) ?? "");
      el.open = c.props.open === true || el.open;
      c.place(body);
    };
    apply(ctx);
    return {
      el,
      update(next) {
        if (next.consume(ACCORDION)) return false;
        apply(next);
        return true;
      },
    };
  }
  const parts = zagParts();
  const indicator = h("span", { "aria-hidden": "true" }, iconEl("chevron-down"));
  const trigger = h("button", null, title, indicator);
  const content = h("div", { class: "gistui-collapse" }, h("div", null, body));
  const el = h("div", null, trigger, content);
  const draw = () => {
    const api = handle.api();
    const value = c.node.id;
    const open = api.value.includes(value);
    parts.spread(el, api.getItemProps({ value }));
    parts.spread(trigger, api.getItemTriggerProps({ value }));
    parts.spread(indicator, api.getItemIndicatorProps({ value }));
    // Zag hides closed content; here it stays mounted (inert) so its height can animate.
    const { hidden: _hidden, ...props } = api.getItemContentProps({ value }) as Record<string, unknown>;
    parts.spread(content, props);
    setAttrs(content, { class: "gistui-collapse", "data-state": open ? "open" : "closed", inert: !open || undefined, hidden: undefined });
    setText(title, str(c.props.title) ?? "");
    c.place(body);
  };
  const off = handle.subscribe(draw);
  draw();
  return {
    el,
    update(next) {
      c = next;
      draw();
      return true;
    },
    destroy() {
      off();
      parts.clear();
    },
  };
};
