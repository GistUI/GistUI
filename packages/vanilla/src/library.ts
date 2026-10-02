/**
 * DOM component libraries: a core `Library` (schemas, for parsing and the prompt) plus a DOM renderer
 * per component. Schemas are the shared catalog's, or plain `PropSpec`s, so the prompt and props are
 * the same in every framework.
 */

import { defineLibrary, type ComponentSpec, type Library } from "@gistui/core";
import type { DomLibrary, DomRenderer } from "./types";

export interface DomComponentDef {
  spec: ComponentSpec;
  render: DomRenderer;
}

export function defineDomComponent(input: ComponentSpec & { render: DomRenderer }): DomComponentDef {
  const { render, ...spec } = input;
  return { spec, render };
}

/** A library from component definitions (and optional named unions of component types). */
export function createDomLibrary(input: { components: readonly DomComponentDef[]; unions?: Readonly<Record<string, readonly string[]>> }): DomLibrary {
  const core = defineLibrary({ components: input.components.map((c) => c.spec), ...(input.unions ? { unions: input.unions } : {}) });
  return libraryOf(core, new Map(input.components.map((c) => [c.spec.name, c.render])));
}

/** A library over existing schemas, with these renderers (components without one render as a plain box). */
export function libraryOf(core: Library, components: ReadonlyMap<string, DomRenderer>): DomLibrary {
  return {
    core,
    components,
    extend(renderers) {
      const next = new Map(components);
      for (const [name, r] of Object.entries(renderers)) next.set(name, r);
      return libraryOf(core, next);
    },
  };
}

/**
 * For framework bindings: a library with the app's own components (`components={{ Card: MyCard }}`).
 * `toRenderer` runs once per component, and a map with the same entries as the last one gives the
 * same library again. So an object written inline, new on every parent render, changes nothing, and
 * one changed entry rebuilds only that component.
 */
export function componentLibrary<C extends object>(toRenderer: (component: C) => DomRenderer): (base: DomLibrary, components: Readonly<Record<string, C>> | null | undefined) => DomLibrary {
  const renderers = new WeakMap<C, DomRenderer>();
  let last: { base: DomLibrary; entries: [string, C][]; library: DomLibrary } | undefined;
  return (base, components) => {
    if (!components) return base;
    const entries = Object.entries(components);
    if (last && last.base === base && last.entries.length === entries.length && entries.every(([name, c], i) => last!.entries[i]![0] === name && last!.entries[i]![1] === c)) return last.library;
    const library = base.extend(
      Object.fromEntries(
        entries.map(([name, c]) => {
          let r = renderers.get(c);
          if (!r) renderers.set(c, (r = toRenderer(c)));
          return [name, r];
        }),
      ),
    );
    last = { base, entries, library };
    return library;
  };
}
