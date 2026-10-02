import { iconPath, isGlyph } from "@gistui/widgets/icons";
import type { ReactNode } from "react";

/** An icon by name (see `iconNames`), or an emoji/short glyph shown as text. Unknown names render nothing. */
export function IconSvg({ name, className }: { name: string | null | undefined; className?: string }): ReactNode {
  if (!name) return null;
  const d = iconPath(name);
  const cls = className ? `gistui-icon ${className}` : "gistui-icon";
  if (!d) {
    return isGlyph(name) ? (
      <span className={cls} data-glyph="" aria-hidden>
        {name}
      </span>
    ) : null;
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}
