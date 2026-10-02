/**
 * `use:gistui`: renders a GistUI program into any element.
 *
 *   <div use:gistui={{ source: answer, streaming: loading, onAction }}></div>
 */

import { mount, syncOptions, type DomLibrary, type DomRenderer, type GistUIMount, type MountOptions } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";

export interface GistUIOptions extends Omit<MountOptions, "library"> {
  /** The component library (default: GistUI's built-in components). */
  library?: DomLibrary;
  /** Renderers that replace built-in components (see `svelteComponents`). */
  renderers?: Readonly<Record<string, DomRenderer>>;
}

/** The library with these renderers, cached so the same inputs give the same library (no restart). */
const cache = new WeakMap<DomLibrary, WeakMap<object, DomLibrary>>();
export function withRenderers(library: DomLibrary, renderers: Readonly<Record<string, DomRenderer>> | undefined): DomLibrary {
  if (!renderers) return library;
  let byRenderers = cache.get(library);
  if (!byRenderers) cache.set(library, (byRenderers = new WeakMap()));
  let lib = byRenderers.get(renderers);
  if (!lib) byRenderers.set(renderers, (lib = library.extend(renderers)));
  return lib;
}

const toMount = (o: GistUIOptions): MountOptions => {
  const { library, renderers, ...rest } = o;
  return { ...rest, library: withRenderers(library ?? ui, renderers) };
};

export function gistui(node: HTMLElement, options: GistUIOptions): { update(options: GistUIOptions): void; destroy(): void } {
  let last = toMount(options);
  const view: GistUIMount = mount(node, last);
  return {
    // The action gets all of its options every time: only what differs from the last time is
    // applied, and an option that is no longer there is unset.
    update(next) {
      const now = toMount(next);
      syncOptions(view, last, now);
      last = now;
    },
    destroy() {
      view.destroy();
    },
  };
}
