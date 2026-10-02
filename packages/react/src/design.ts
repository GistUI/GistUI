/**
 * The design layer, eager part: `classNames` per component type and `useDesign`, which applies a
 * program's `style:{…}`. The mapping itself (`design-core.ts`) is its own chunk, fetched the first
 * time a styled node renders; until then that node keeps its space but stays invisible, so there is
 * never a flash of unstyled layout. Programs without `style` never load it.
 */

import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";
import { lazyModule } from "./hooks";

export type DesignStyle = Readonly<Record<string, unknown>>;

/** `<GistUI classNames>`: extra classes per component type (Tailwind or your own CSS). */
export const ClassNamesContext = createContext<Readonly<Record<string, string>> | undefined>(undefined);

const core = lazyModule(() => import("@gistui/headless/design"));

/** Loads the design mapping now (tests, or apps that always use `style`). */
export const preloadDesign = (): Promise<unknown> => core.load();

/** Maps a `style` object to CSS (loads the mapping first). */
export async function designStyle(input: unknown): Promise<{ style: CSSProperties; attrs: Record<string, string> }> {
  return (await core.load()).designStyle(input);
}

const PENDING: CSSProperties = { visibility: "hidden" };

/**
 * Root-element props for a component: the host's class for its type (`classNames`), the program's
 * `style`, and the component's own base style (merged underneath).
 */
export function useDesign(type: string, props: { readonly [k: string]: unknown }, base?: CSSProperties): { className: string | undefined; style: CSSProperties | undefined; attrs: Record<string, string> } {
  const classes = useContext(ClassNamesContext);
  const wants = props.style !== undefined && props.style !== null;
  const [mod, setMod] = useState(core.current);
  useEffect(() => {
    if (!wants || mod) return;
    let live = true;
    void core.load().then((m) => live && setMod(m));
    return () => {
      live = false;
    };
  }, [wants, mod]);
  if (!wants) return { className: classes?.[type], style: base, attrs: {} };
  if (!mod) return { className: classes?.[type], style: { ...base, ...PENDING }, attrs: { "data-style-pending": "" } };
  const d = mod.designStyle(props.style);
  const has = Object.keys(d.style).length > 0;
  return {
    className: classes?.[type],
    style: has || base ? { ...base, ...d.style } : undefined,
    attrs: { ...d.attrs, ...(has ? { "data-styled": "" } : {}) },
  };
}
