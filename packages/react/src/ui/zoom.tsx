/**
 * `useLightbox` for Image(zoom) and Media(zoom): the viewer itself is a lazily loaded chunk, fetched
 * when a picture is first opened (or hovered, so it is usually there before the click).
 */

import { createElement, useState, type ReactNode } from "react";
import { lazyModule, useLazyModule } from "../hooks";
import type { LightboxItem } from "./lightbox";

const viewer = lazyModule(() => import("./lightbox").then((m) => m.Lightbox));

/** Starts loading the viewer (call on hover or focus). */
export const preloadLightbox = (): Promise<unknown> => viewer.load();

/** The full-screen viewer; its chunk loads on first render. */
export function Lightbox(props: { items: readonly LightboxItem[]; start: number; onClose: () => void }): ReactNode {
  const { value: Lightbox } = useLazyModule(viewer);
  return Lightbox ? createElement(Lightbox, props) : null;
}

type Viewer = (props: { items: readonly LightboxItem[]; start: number; onClose: () => void }) => ReactNode;

/**
 * Opens a lightbox; returns the element to render and an `open(index)` function. `View` is the
 * viewer to render: the lazy stand-in by default, or the real one where it is already loaded (Gallery).
 */
export function useLightbox(items: readonly LightboxItem[], View: Viewer = Lightbox): { open: (i: number) => void; element: ReactNode } {
  const [at, setAt] = useState<number | null>(null);
  const element = at === null ? null : createElement(View, { items, start: at, onClose: () => setAt(null) });

  return {
    open: (i) => {
      void viewer.load();
      setAt(i);
    },
    element,
  };
}
