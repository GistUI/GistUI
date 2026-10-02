/** Accordion and its Items (a lazily loaded chunk: most answers do not use one). */

import * as accordion from "@zag-js/accordion";
import { normalizeProps, useMachine } from "@zag-js/react";
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { cx, str, useNodes } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";

// ─── Accordion ──────────────────────────────────────────────────────────

const AccordionApi = createContext<accordion.Api | null>(null);

export function Accordion({ props, childIds, children }: ComponentProps): ReactNode {
  const kids = useNodes(childIds);
  const [value, setValue] = useState<string[]>([]);
  // Items flagged `open` open once, when they have arrived in full (a streaming Item mounts before
  // its `open` flag does); after that the user decides.
  const [seen] = useState(() => new Set<string>());
  useEffect(() => {
    const complete = childIds.filter((id, i) => !seen.has(id) && kids[i] && !kids[i]!.partial);
    const opened = complete.filter((id) => kids[childIds.indexOf(id)]!.props.open === true);
    complete.forEach((id) => seen.add(id));

    if (opened.length) setValue((v) => (props.multiple ? [...v, ...opened] : [opened[0]!]));
  }, [childIds, kids, seen, props.multiple]);
  const service = useMachine(accordion.machine, {
    id: useId(),
    value,
    multiple: Boolean(props.multiple),
    collapsible: true,
    onValueChange: (d) => setValue(d.value),
  });
  const api = accordion.connect(service, normalizeProps);
  return (
    <div className="gistui-accordion" data-gistui="Accordion" {...api.getRootProps()}>
      <AccordionApi.Provider value={api}>{children}</AccordionApi.Provider>
    </div>
  );
}

export function Item({ node, props, children }: ComponentProps): ReactNode {
  const api = useContext(AccordionApi);
  const title = str(props.title);
  if (!api) {
    // An Item outside an Accordion still works, as a native disclosure.
    return (
      <details className={cx("gistui-accordion")} open={props.open === true}>
        <summary>{title}</summary>
        {children}
      </details>
    );
  }
  const value = node.id;
  const open = api.value.includes(value);
  // Zag hides closed content; here it stays mounted (inert) so its height can animate.
  const { hidden: _hidden, ...content } = api.getItemContentProps({ value }) as Record<string, unknown>;
  return (
    <div {...api.getItemProps({ value })}>
      <button {...api.getItemTriggerProps({ value })}>
        <span>{title}</span>
        <span {...api.getItemIndicatorProps({ value })} aria-hidden>
          <IconSvg name="chevron-down" />
        </span>
      </button>
      <div {...content} className="gistui-collapse" data-state={open ? "open" : "closed"} inert={!open || undefined}>
        <div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
