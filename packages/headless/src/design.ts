/**
 * The design layer's mapping (a lazily loaded chunk): `style:{…}` on components, and `Frame` (a free-form box). Figma-like properties,
 * mapped to CSS through a whitelist: a program can shape any layout and look, but can never inject
 * CSS, run script, or load anything but http(s) images.
 *
 *   Frame(Text("New", style:{size:12, weight:600, color:"accent", upper, tracking:0.08}),
 *         style:{layout:"row", gap:8, pad:[6, 12], fill:"accent/12", radius:"full"})
 *
 * Values:
 * - lengths: numbers are px; also "50%", "12rem", "fill" (grow), "hug" (fit content), "auto";
 *   never negative, never viewport units, at most 2000px / 200rem (a box stays in its container)
 * - spacing (gap, pad): numbers or none|xs|sm|md|lg|xl; pad also takes [y, x] or [top, right, bottom, left]
 * - colours: theme names (fg, muted, subtle, bg, surface, sunk, border, primary, accent, success,
 *   warning, danger, info, chart-1…chart-8, white, black, transparent), with "/NN" for NN % opacity,
 *   or #hex, rgb(), hsl(), oklch()
 * - fill: a colour, or linear(135deg, accent, chart-2) / radial(circle at 30% 20%, accent/30, transparent)
 */

import { safeUrl } from "./url";

/** CSS properties in camelCase (`backgroundColor`), as both DOM `style` and React `style` take them. */
export type StyleObject = Record<string, string | number>;

export type DesignStyle = Readonly<Record<string, unknown>>;


const COLORS: Record<string, string> = {
  fg: "--gistui-fg",
  muted: "--gistui-fg-muted",
  subtle: "--gistui-fg-subtle",
  bg: "--gistui-bg",
  surface: "--gistui-surface",
  sunk: "--gistui-surface-sunk",
  hover: "--gistui-surface-hover",
  border: "--gistui-border",
  "border-strong": "--gistui-border-strong",
  primary: "--gistui-primary",
  "primary-fg": "--gistui-primary-fg",
  accent: "--gistui-accent",
  "accent-fg": "--gistui-accent-fg",
  "accent-soft": "--gistui-accent-soft",
  success: "--gistui-success",
  warning: "--gistui-warning",
  danger: "--gistui-danger",
  info: "--gistui-info",
  neutral: "--gistui-neutral",
};
for (let i = 1; i <= 8; i++) COLORS[`chart-${i}`] = `--gistui-chart-${i}`;

const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
// Only digits, spaces, "." "," "%" "/" "+" "-" and letters (units like deg, "none"): no ( ) ; : < > or quotes.
const FUNC = /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\([\d\s.,%/+a-z-]*\)$/i;

/** A colour value, or undefined when it is not a safe colour. */
export function color(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "white" || s === "black" || s === "transparent" || s === "currentColor") return s;
  if (HEX.test(s) || (FUNC.test(s) && !/url|expression|var/i.test(s))) return s;
  const m = /^([a-z]+(?:-[a-z0-9]+)?)(?:\/(\d{1,3}))?$/.exec(s);
  const token = m ? COLORS[m[1]!] : undefined;
  if (!token) return undefined;
  if (!m![2]) return `var(${token})`;
  const pct = Math.max(0, Math.min(100, Number(m![2])));
  return `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ANGLE = /^(?:-?\d{1,3}(?:\.\d+)?deg|to (?:left|right|top|bottom)(?: (?:left|right|top|bottom))?)$/;
const RADIAL_SHAPE = /^(?:circle|ellipse)?(?: ?(?:closest|farthest)-(?:side|corner))?(?: ?at (?:-?\d{1,3}%|left|right|top|bottom|center)(?: (?:-?\d{1,3}%|left|right|top|bottom|center))?)?$/;
// A colour (a colour function may have spaces after its commas: `rgb(255, 0, 0)`), then an optional position.
const STOP = /^((?:rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\)|\S+)(?: (\d{1,3})%)?$/i;

/** `linear(135deg, accent, chart-2 80%)` → a CSS gradient built from validated parts. */
export function gradient(v: string): string | undefined {
  const m = /^(linear|radial|conic)\((.*)\)$/.exec(v.trim());
  if (!m) return undefined;
  const parts = splitTop(m[2]!);
  const out: string[] = [];
  parts.forEach((p, i) => {
    if (i === 0 && m[1] === "linear" && ANGLE.test(p)) return void out.push(p);
    if (i === 0 && m[1] === "radial" && p && RADIAL_SHAPE.test(p) && !color(p)) return void out.push(p);
    if (i === 0 && m[1] === "conic" && /^from -?\d{1,3}deg$/.test(p)) return void out.push(p);
    const s = STOP.exec(p);
    const c = s ? color(s[1]) : undefined;
    if (c) out.push(s![2] ? `${c} ${s![2]}%` : c);
  });
  const stops = out.filter((x) => !ANGLE.test(x) && !/^(?:circle|ellipse|at|from)/.test(x)).length;
  return stops >= 2 ? `${m[1]}-gradient(${out.join(", ")})` : undefined;
}

const SPACE: Record<string, string> = { none: "0", xs: "var(--gistui-space-xs)", sm: "var(--gistui-space-sm)", md: "var(--gistui-space-md)", lg: "var(--gistui-space-lg)", xl: "var(--gistui-space-xl)" };
const RADIUS: Record<string, string> = { none: "0", xs: "var(--gistui-radius-xs)", sm: "var(--gistui-radius-sm)", md: "var(--gistui-radius-md)", lg: "var(--gistui-radius-lg)", xl: "var(--gistui-radius-xl)", full: "9999px" };
const SHADOW: Record<string, string> = { none: "none", xs: "var(--gistui-shadow-xs)", sm: "var(--gistui-ring), var(--gistui-shadow-sm)", md: "var(--gistui-ring), var(--gistui-shadow-md)", lg: "var(--gistui-ring), var(--gistui-shadow-lg)", ring: "var(--gistui-ring)" };
const TEXT: Record<string, string> = { xs: "var(--gistui-text-xs)", sm: "var(--gistui-text-sm)", md: "var(--gistui-text-md)", lg: "var(--gistui-text-lg)", xl: "var(--gistui-text-xl)", "2xl": "var(--gistui-text-2xl)", "3xl": "var(--gistui-text-3xl)", "4xl": "clamp(2rem, 1.4rem + 3cqi, 3.2rem)" };
const WEIGHT: Record<string, number> = { thin: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 };
const FONT: Record<string, string> = {
  sans: "var(--gistui-font)",
  mono: "var(--gistui-font-mono)",
  serif: 'ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif',
  display: "var(--gistui-font-display, var(--gistui-font))",
  rounded: 'ui-rounded, "SF Pro Rounded", var(--gistui-font)',
};
const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Largest value per unit. A program sizes and places things inside its own container: lengths are
 * never negative (an offset cannot pull a box out of its parent), never relative to the viewport
 * (`vw`, `vh` are not units here), and never larger than this.
 */
const MAX_LENGTH: Readonly<Record<string, number>> = { px: 2000, rem: 200, em: 200, ch: 200, "%": 200, cqi: 200 };

/** px number, percentage or unit length, "fill"/"hug"/"auto". */
function length(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return `${clamp(v, 0, MAX_LENGTH.px!)}px`;
  if (typeof v !== "string") return undefined;
  if (v === "auto") return "auto";
  if (v === "hug") return "fit-content";
  if (v === "fill") return "100%";
  const m = /^(-?\d{1,4}(?:\.\d+)?)(px|%|rem|em|ch|cqi)$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  const c = clamp(n, 0, MAX_LENGTH[m[2]!]!);
  return c === n ? v : `${c}${m[2]}`;
}
const space = (v: unknown): string | undefined => (typeof v === "string" && v in SPACE ? SPACE[v] : length(v));
function pad(v: unknown): string | undefined {
  if (Array.isArray(v) && (v.length === 2 || v.length === 4)) {
    const parts = v.map(space);
    return parts.every(Boolean) ? parts.join(" ") : undefined;
  }
  return space(v);
}

/**
 * Maps a `style` object to CSS and data attributes (for the motion and overlay rules). Unknown keys
 * and unsafe values are dropped.
 */
export function designStyle(input: unknown): { style: StyleObject; attrs: Record<string, string> } {
  const style: StyleObject = {};
  const attrs: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return { style, attrs };
  const s = input as Record<string, unknown>;
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") style[k] = v as string | number;
  };

  // Layout (auto layout)
  const layout = s.layout;
  if (layout === "row" || layout === "column") {
    set("display", "flex");
    set("flexDirection", layout);
  } else if (layout === "grid") {
    set("display", "grid");
    const cols = s.cols;
    if (typeof cols === "number") set("gridTemplateColumns", `repeat(${clamp(Math.round(cols), 1, 12)}, minmax(0, 1fr))`);
    else if (typeof cols === "string" && /^(?:(?:\d{1,2}(?:\.\d+)?fr|\d{1,4}px|auto|min-content|max-content)\s*){1,12}$/.test(cols)) set("gridTemplateColumns", cols);
    else set("gridTemplateColumns", "repeat(auto-fill, minmax(min(100%, 220px), 1fr))");
  } else if (layout === "overlay") {
    set("display", "grid");
    attrs["data-overlay"] = "";
  }
  set("gap", space(s.gap));
  set("padding", pad(s.pad));
  if (typeof s.align === "string") set("alignItems", ALIGN[s.align]);
  if (typeof s.justify === "string") set("justifyContent", JUSTIFY[s.justify]);
  if (s.wrap === true) set("flexWrap", "wrap");
  if (num(s.span)) set("gridColumn", `span ${clamp(Math.round(s.span as number), 1, 12)}`);
  if (num(s.grow) !== undefined) set("flexGrow", clamp(s.grow as number, 0, 10));
  if (s.w === "fill") set("flex", "1 1 0");
  if (num(s.order) !== undefined) set("order", clamp(Math.round(s.order as number), -20, 20));

  // Size
  set("width", length(s.w));
  set("height", length(s.h));
  set("minWidth", length(s.minW));
  set("maxWidth", length(s.maxW));
  set("minHeight", length(s.minH));
  set("maxHeight", length(s.maxH));
  if (typeof s.aspect === "string" && /^\d{1,4}(?:\.\d+)? ?\/ ?\d{1,4}(?:\.\d+)?$/.test(s.aspect)) set("aspectRatio", s.aspect);

  // Position (inside the nearest positioned parent; never fixed to the page, never outside the parent:
  // offsets are lengths, so they are ≥ 0 and capped like every other length)
  if (s.pos === "absolute" || s.pos === "relative" || s.pos === "sticky") set("position", s.pos);
  set("left", length(s.x));
  set("top", length(s.y));
  set("right", length(s.right));
  set("bottom", length(s.bottom));
  if (s.inset !== undefined) set("inset", length(s.inset));
  if (num(s.z) !== undefined) set("zIndex", clamp(Math.round(s.z as number), 0, 10));

  // Fill, stroke, corners, depth
  const fill = typeof s.fill === "string" ? (color(s.fill) ?? gradient(s.fill)) : undefined;
  const image = safeUrl(s.image);
  const layers: string[] = [];
  if (fill?.includes("gradient(")) layers.push(fill);
  if (image) layers.push(`url("${image.replace(/["\\\n]/g, "")}") center / cover no-repeat`);
  if (layers.length) set("background", layers.join(", "));
  if (fill && !fill.includes("gradient(")) set(layers.length ? "backgroundColor" : "background", fill);
  const stroke = color(s.stroke);
  if (stroke) set("border", `${clamp(num(s.strokeW) ?? 1, 0, 12)}px ${s.strokeStyle === "dashed" || s.strokeStyle === "dotted" ? s.strokeStyle : "solid"} ${stroke}`);
  if (typeof s.radius === "string") set("borderRadius", RADIUS[s.radius]);
  else if (num(s.radius) !== undefined) set("borderRadius", `${clamp(s.radius as number, 0, 999)}px`);
  if (typeof s.shadow === "string") set("boxShadow", SHADOW[s.shadow]);
  if (num(s.opacity) !== undefined) set("opacity", clamp(s.opacity as number, 0, 1));
  if (s.clip === true) set("overflow", "hidden");
  const filters: string[] = [];
  if (num(s.blur)) filters.push(`blur(${clamp(s.blur as number, 0, 40)}px)`);
  if (filters.length) set("filter", filters.join(" "));
  if (num(s.backdrop)) set("backdropFilter", `blur(${clamp(s.backdrop as number, 0, 40)}px)`);
  const transforms: string[] = [];
  if (num(s.rotate)) transforms.push(`rotate(${clamp(s.rotate as number, -360, 360)}deg)`);
  if (num(s.scale)) transforms.push(`scale(${clamp(s.scale as number, 0.1, 4)})`);
  if (transforms.length) set("transform", transforms.join(" "));

  // Type
  if (typeof s.font === "string") set("fontFamily", FONT[s.font]);
  if (typeof s.size === "string") set("fontSize", TEXT[s.size]);
  else if (num(s.size)) set("fontSize", `${clamp(s.size as number, 8, 160)}px`);
  if (typeof s.weight === "string") set("fontWeight", WEIGHT[s.weight]);
  else if (num(s.weight)) set("fontWeight", clamp(Math.round((s.weight as number) / 100) * 100, 100, 900));
  set("color", color(s.color));
  if (s.textAlign === "left" || s.textAlign === "center" || s.textAlign === "right") set("textAlign", s.textAlign);
  if (num(s.leading)) set("lineHeight", clamp(s.leading as number, 0.8, 3));
  if (typeof s.tracking === "number") set("letterSpacing", `${clamp(s.tracking, -0.1, 0.4)}em`);
  if (s.italic === true) set("fontStyle", "italic");
  if (s.upper === true) set("textTransform", "uppercase");
  if (s.underline === true) set("textDecoration", "underline");
  if (num(s.truncate)) {
    const lines = clamp(Math.round(s.truncate as number), 1, 12);
    set("overflow", "hidden");
    if (lines === 1) {
      set("whiteSpace", "nowrap");
      set("textOverflow", "ellipsis");
    } else {
      set("display", "-webkit-box");
      set("WebkitLineClamp", lines);
      set("WebkitBoxOrient", "vertical");
    }
  }

  // Motion
  if (s.enter === "fade" || s.enter === "rise" || s.enter === "scale" || s.enter === "none") attrs["data-enter"] = s.enter;
  if (s.hover === "lift" || s.hover === "glow" || s.hover === "scale" || s.hover === "dim") attrs["data-hover"] = s.hover;
  if (num(s.delay)) set("animationDelay", `${clamp(s.delay as number, 0, 3000)}ms`);

  return { style, attrs };
}
