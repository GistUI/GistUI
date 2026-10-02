import { iconPath, isGlyph } from "@gistui/widgets/icons";

const SVG = "http://www.w3.org/2000/svg";

/** An icon by name (see `iconNames`), or an emoji/short glyph shown as text. Unknown names give null. */
export function iconEl(name: string | null | undefined, className?: string): Element | null {
  if (!name) return null;
  const d = iconPath(name);
  const cls = className ? `gistui-icon ${className}` : "gistui-icon";
  if (!d) {
    if (!isGlyph(name)) return null;
    const span = document.createElement("span");
    span.className = cls;
    span.setAttribute("data-glyph", "");
    span.setAttribute("aria-hidden", "true");
    span.textContent = name;
    return span;
  }
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({ class: cls, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}
