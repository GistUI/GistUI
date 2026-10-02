/**
 * The design layer for DOM components: the host's `classNames` for a component type, the program's
 * `style:{…}` (mapped by `@gistui/headless/design`, fetched the first time a styled node renders;
 * until then the node keeps its space but stays invisible) and a component's own base style.
 */

import { setAttrs, setStyle } from "./dom";
import { lazyModule } from "./lazy";

type DesignModule = typeof import("@gistui/headless/design");
/**
 * The mapping, in its own chunk. A failed import is retried, and tried again by the next styled node
 * that renders: it is not remembered. (Exported for tests, which make a load fail.)
 */
export const design = lazyModule<DesignModule>(() => import("@gistui/headless/design"));
/** The last load failed: styled nodes show unstyled (never hidden for good) until one succeeds. */
let failed = false;

/** Loads the design mapping now (tests, or apps that always use `style`). */
export function preloadDesign(): Promise<DesignModule> {
  return design.load();
}

const CLASSES = new WeakMap<Element, string>();
const ATTRS = new WeakMap<Element, string[]>();
/** Elements already waiting for the current load (one `onLoaded` each, however often they render). */
const WAITING = new WeakSet<Element>();

export function applyDesign(
  el: HTMLElement,
  type: string,
  props: Readonly<Record<string, unknown>>,
  classNames: Readonly<Record<string, string>> | undefined,
  base: Readonly<Record<string, string | number>> | undefined,
  onLoaded: () => void,
): void {
  // The host's extra classes for this type (replaced, never duplicated, on updates).
  const cls = classNames?.[type];
  const prevCls = CLASSES.get(el);
  if (prevCls !== cls) {
    if (prevCls) el.classList.remove(...prevCls.split(/\s+/).filter(Boolean));
    if (cls) el.classList.add(...cls.split(/\s+/).filter(Boolean));
    if (cls) CLASSES.set(el, cls);
    else CLASSES.delete(el);
  }
  const wants = props.style !== undefined && props.style !== null;
  const mod = design.current;
  let style: Record<string, string | number> = { ...base };
  let attrs: Record<string, string> = {};
  if (wants && !mod) {
    // Hidden while the mapping loads. If it cannot be loaded the node shows unstyled instead, and
    // each later render of a styled node asks again.
    const hidden = !failed;
    if (hidden) {
      style.visibility = "hidden";
      attrs["data-style-pending"] = "";
    }
    if (!WAITING.has(el)) {
      WAITING.add(el);
      design.load().then(
        () => {
          failed = false;
          WAITING.delete(el);
          onLoaded();
        },
        () => {
          failed = true;
          WAITING.delete(el);
          if (hidden) onLoaded();
        },
      );
    }
  } else if (wants && mod) {
    const d = mod.designStyle(props.style);
    style = { ...base, ...d.style };
    attrs = { ...d.attrs, ...(Object.keys(d.style).length ? { "data-styled": "" } : {}) };
  }
  setStyle(el, style);
  const prev = ATTRS.get(el) ?? [];
  for (const k of prev) if (!(k in attrs)) el.removeAttribute(k);
  setAttrs(el, attrs);
  ATTRS.set(el, Object.keys(attrs));
}
