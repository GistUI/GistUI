/**
 * Zag.js machines without a framework (`@zag-js/vanilla`): the same state machines, keyboard handling
 * and ARIA as `@gistui/react`'s Zag components. `parts.spread(el, props)` applies a part's attributes
 * and event handlers, replacing whatever it applied to that element last time: an attribute that is
 * no longer in the props (`data-highlighted`, `data-selected`…) is removed, one that did not change
 * is not written again.
 */

import { spreadProps, type VanillaMachine } from "@zag-js/vanilla";

export interface ZagParts {
  spread(el: Element, props: Record<string, unknown>): void;
  /** Drops what was applied to elements that are no longer rendered (an option that went away). */
  forget(...els: (Element | null | undefined)[]): void;
  clear(): void;
  /** How many elements hold attributes and listeners right now. */
  readonly size: number;
}

export function zagParts(): ZagParts {
  const cleanups = new Map<Element, () => void>();
  return {
    spread(el, props) {
      // `spreadProps` compares with what it applied to this element before (it removes the old
      // listeners and the attributes that went away), so the previous cleanup must not run first:
      // that would forget those attributes and leave them on an element that is reused.
      cleanups.set(el, spreadProps(el, props));
    },
    forget(...els) {
      for (const el of els) {
        if (!el) continue;
        cleanups.get(el)?.();
        cleanups.delete(el);
      }
    },
    clear() {
      for (const off of cleanups.values()) off();
      cleanups.clear();
    },
    get size() {
      return cleanups.size;
    },
  };
}

/**
 * Tells a machine that its props changed. The props are a function that reads the component's latest
 * context, so the machine only has to look again; `updateProps` would wrap that function once more on
 * every call, and every prop read would get slower with each update.
 */
export function propsChanged(machine: VanillaMachine<any>, props: () => Record<string, unknown>): void {
  const m = machine as unknown as { userPropsRef?: { current: unknown }; notify?: () => void };
  if (m.userPropsRef && typeof m.notify === "function") {
    m.userPropsRef.current = props;
    m.notify();
  } else machine.updateProps(props);
}

/** A select-like value as a list: a bound `$var` (or `value:`) may be one value, a list or nothing. */
export const listOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : raw == null || raw === "" ? [] : [String(raw)]);

/** Options without repeats: a value is a key and a form value, so it can be offered only once. */
export const uniqueOptions = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.map(String))] : []);

/**
 * The initial choice of a Select or Combobox from `value:`: only options that exist, each once;
 * one of them unless `multiple`.
 */
export function initialChoice(props: Readonly<Record<string, unknown>>): string[] {
  const options = uniqueOptions(props.options);
  const chosen = [...new Set(listOf(props.value))].filter((v) => options.includes(v));
  return props.multiple === true ? chosen : chosen.slice(0, 1);
}

let seq = 0;
export const zagId = (kind: string): string => `gistui-${kind}-${++seq}`;
