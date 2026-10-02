/**
 * Lightbox: full-screen image viewer on a native <dialog> (top layer, focus trap, Esc to close).
 * Previous/next, a counter, captions, a thumbnail strip, arrow keys and swipe. `Gallery` is a grid of
 * thumbnails that opens it; `Image(zoom)` and `Media(zoom)` open it for one picture.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { num, safeUrl, str } from "../hooks";
import type { ComponentProps } from "../library";
import { FadeImg, ratioOf } from "./content";
import { IconSvg } from "./icon";
import { useLightbox } from "./zoom";

export interface LightboxItem {
  src: string;
  caption?: string | undefined;
  alt?: string | undefined;
}

export function Lightbox({ items, start, onClose }: { items: readonly LightboxItem[]; start: number; onClose: () => void }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  const [dir, setDir] = useState<1 | -1>(1);
  const count = items.length;
  const go = useCallback(
    (i: number) => {
      if (!count) return;
      setDir(i > index || (index === count - 1 && i === 0) ? 1 : -1);
      setIndex(((i % count) + count) % count);
    },
    [count, index],
  );
  // What had focus when the viewer was opened (read on the first render: once it is in the
  // document, its Close button has taken focus).
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  // A layout effect: its cleanup runs while the dialog is still in the document, so the dialog can
  // be closed (once unmounted it cannot, and focus is lost) and focus given back to what opened it.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (d?.open) d.close?.();
      if (opener?.isConnected) opener.focus?.();
    };
  }, [opener]);

  // Preload the neighbours so next/previous is instant.
  useEffect(() => {
    for (const j of [index + 1, index - 1]) {
      const it = items[((j % count) + count) % count];
      if (!it || typeof Image === "undefined") continue;
      const img = new window.Image();
      img.referrerPolicy = "no-referrer";
      img.src = it.src;
    }
  }, [index, items, count]);
  const thumbs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thumbs.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);
  const touch = useRef<number | null>(null);
  const item = items[index];
  if (!item) return null;
  return (
    <dialog
      ref={dialog}
      className="gistui-lightbox"
      aria-label={item.caption ?? "Image viewer"}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).classList.contains("gistui-lightbox__stage")) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const s = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (s !== null && end !== undefined && Math.abs(end - s) > 40) go(index + (end < s ? 1 : -1));
      }}
    >
      <div className="gistui-lightbox__top">
        <span className="gistui-lightbox__count">{count > 1 ? `${index + 1} / ${count}` : ""}</span>
        <button type="button" className="gistui-lightbox__btn" aria-label="Close" onClick={onClose} autoFocus>
          <IconSvg name="x" />
        </button>
      </div>
      <div className="gistui-lightbox__stage">
        <figure key={index} className="gistui-lightbox__figure" style={{ "--gistui-dir": dir } as CSSProperties}>
          <img src={item.src} alt={item.alt ?? item.caption ?? ""} referrerPolicy="no-referrer" />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </figure>
        {count > 1 && (
          <>
            <button type="button" className="gistui-lightbox__btn gistui-lightbox__nav" data-side="start" aria-label="Previous image" onClick={() => go(index - 1)}>
              <IconSvg name="chevron-left" />
            </button>
            <button type="button" className="gistui-lightbox__btn gistui-lightbox__nav" data-side="end" aria-label="Next image" onClick={() => go(index + 1)}>
              <IconSvg name="chevron-right" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="gistui-lightbox__thumbs" ref={thumbs}>
          {items.map((it, i) => (
            <button key={`${i}:${it.src}`} type="button" className="gistui-lightbox__thumb" aria-current={i === index} aria-label={`Image ${i + 1}`} onClick={() => go(i)}>
              <img src={it.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </dialog>
  );
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** A grid (or strip) of thumbnails; a click opens the lightbox at that image. */
export function Gallery({ props }: ComponentProps): ReactNode {
  const captions = strings(props.captions);
  const items: LightboxItem[] = strings(props.images)
    .map((s, i) => ({ src: safeUrl(s) ?? "", caption: captions[i] }))
    .filter((it) => it.src);
  // The viewer is in this chunk already: rendered directly, not through the lazy stand-in.
  const { open, element } = useLightbox(items, Lightbox);

  const cols = num(props.cols);
  const ratio = ratioOf(props.ratio) ?? "1 / 1";
  const style = {
    ...(cols ? { "--gistui-cols": Math.max(1, Math.min(6, Math.round(cols))) } : {}),
    "--gistui-ratio": ratio,
  } as CSSProperties;
  const v = str(props.v) ?? "grid";
  return (
    <div className="gistui-gallery" data-gistui="Gallery" data-v={v} style={style}>
      {items.map((it, i) => (
        <button key={`${i}:${it.src}`} type="button" className="gistui-gallery__item" onClick={() => open(i)} aria-label={it.caption ? `Open ${it.caption}` : `Open image ${i + 1}`}>
          <FadeImg src={it.src} alt={it.caption ?? ""} />
          <span className="gistui-gallery__zoom" aria-hidden>
            <IconSvg name="search" />
          </span>
          {it.caption && v !== "strip" && <span className="gistui-gallery__caption">{it.caption}</span>}
        </button>
      ))}
      {element}
    </div>
  );
}
