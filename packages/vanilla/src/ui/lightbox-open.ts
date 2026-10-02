/**
 * Opening the image viewer from Image(zoom), Media(zoom) and Gallery. The viewer is its own chunk,
 * fetched when a picture is first opened (or hovered, so it is usually there before the click).
 */

export interface LightboxItem {
  src: string;
  caption?: string | undefined;
  alt?: string | undefined;
}

let viewer: Promise<typeof import("./lightbox")> | null = null;
/** Starts loading the viewer (call on hover or focus). */
export const preloadLightbox = (): Promise<unknown> => (viewer ??= import("./lightbox"));

/**
 * Opens the viewer at `start`: as the last child of `anchor` when `inside` (where React renders it:
 * in the Image's figure, in the Gallery), otherwise in the GistUI root around `anchor` (a card that
 * is itself a button cannot hold it). Either way it inherits the theme.
 * Returns a function that closes it: the component that opened it calls that when it is destroyed
 * (`ctx.onDestroy`), so a viewer never outlives its picture, also when it was still loading.
 */
export function openLightbox(items: readonly LightboxItem[], start: number, anchor?: Element, inside = false): () => void {
  let close: (() => void) | null = null;
  let cancelled = false;
  void (viewer ??= import("./lightbox")).then((m) => {
    if (!cancelled) close = m.showLightbox(items, start, (inside && anchor?.isConnected ? anchor : anchor?.closest(".gistui")) ?? document.body);
  });
  return () => {
    cancelled = true;
    close?.();
  };
}

/**
 * For a component that opens the viewer: `open(…)` opens it (closing the one it opened before), and
 * the component's destruction closes it.
 */
export function lightboxOpener(ctx: { onDestroy(fn: () => void): void }): (items: readonly LightboxItem[], start: number, anchor?: Element, inside?: boolean) => void {
  let close = () => {};
  ctx.onDestroy(() => close());
  return (items, start, anchor, inside) => {
    close();
    close = openLightbox(items, start, anchor, inside);
  };
}
