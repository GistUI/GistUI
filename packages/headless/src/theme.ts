/**
 * Code-level theming. Every visual decision in GistUI is a CSS custom property (`--gistui-*`); a theme
 * object sets them from TypeScript, scoped to one <GistUI> instance:
 *
 *   const brand = defineTheme({
 *     primary: "#0f766e", accent: "#0d9488", radius: 14, font: "Geist, sans-serif",
 *     chart: ["#0d9488", "#f59e0b", "#6366f1"],
 *   });
 *   <GistUI library={ui} tokens={brand} darkTokens={{ primary: "#2dd4bf", primaryFg: "#042f2e" }} />
 */

export interface GistUITokens {
  font?: string;
  fontMono?: string;
  /** Base corner radius in px (cards use 1.4×, inputs 1×, chips 0.7×). */
  radius?: number;
  /** Spacing multiplier: 0.75 compact, 1 default, 1.3 spacious. */
  density?: number;
  bg?: string;
  surface?: string;
  surfaceSunk?: string;
  surfaceHover?: string;
  fg?: string;
  fgMuted?: string;
  fgSubtle?: string;
  border?: string;
  borderStrong?: string;
  /** Primary actions: buttons, switches, checkboxes, selected chips. */
  primary?: string;
  primaryHover?: string;
  primaryFg?: string;
  /** Links, focus rings, accent buttons and highlights. */
  accent?: string;
  accentHover?: string;
  accentFg?: string;
  info?: string;
  success?: string;
  warning?: string;
  danger?: string;
  /** Categorical chart colours, in order (up to 8). */
  chart?: readonly string[];
  shadowSm?: string;
  shadowMd?: string;
  /**
   * Effects: all off by default (GistUI is minimal out of the box). Each takes any CSS value;
   * `expressive` below turns them on together.
   */
  /** Backdrop behind a Hero, e.g. a radial gradient. */
  heroGlow?: string;
  /** Fill of Hero headlines: a colour or a gradient. */
  headingFill?: string;
  /** Hero image transform, e.g. "perspective(1400px) rotateY(-5deg)". */
  mediaTilt?: string;
  mediaShadow?: string;
  /** Ring around a featured pricing plan: a colour or a gradient. */
  featuredRing?: string;
  featuredGlow?: string;
  badgeFill?: string;
  /** Sheen over filled buttons (a gradient) and their hover shadow. */
  buttonSheen?: string;
  buttonGlow?: string;
  /** Pattern behind diagrams, e.g. a dot grid. */
  canvasPattern?: string;
  /** What `Box(surface:gradient)` paints. */
  surfaceGradient?: string;
  /** Card shadow on hover (off by default: plain cards are not clickable). */
  cardHover?: string;
  /** How far clickable tiles, media and plans lift on hover, e.g. "-3px" (default) or "0". */
  lift?: string;
  /** Entrance animation name for blocks: "none" turns entrances off. */
  enterAnimation?: string;
  /** Any other `--gistui-*` variable, by its full name. */
  [cssVar: `--${string}`]: string | number | undefined;
}

/** Identity helper for typing a theme object. */
export function defineTheme(tokens: GistUITokens): GistUITokens {
  return tokens;
}

/**
 * The expressive look: accent glows, gradient headlines and rings, button sheen, tilted hero image,
 * dotted diagram canvas. Spread it into a theme: `defineTheme({ ...expressive, accent: "#7c3aed" })`.
 */
export const expressive: GistUITokens = {
  heroGlow:
    "radial-gradient(38% 55% at 18% 35%, color-mix(in srgb, var(--gistui-accent) 20%, transparent), transparent 70%), radial-gradient(32% 48% at 82% 25%, color-mix(in srgb, var(--gistui-chart-2) 16%, transparent), transparent 70%)",
  headingFill: "linear-gradient(120deg, var(--gistui-fg) 30%, color-mix(in srgb, var(--gistui-accent) 80%, var(--gistui-fg)) 100%)",
  mediaTilt: "perspective(1400px) rotateY(-5deg) rotateX(2deg)",
  mediaShadow: "var(--gistui-shadow-lg), 0 40px 80px -40px color-mix(in srgb, var(--gistui-accent) 55%, transparent)",
  featuredRing: "linear-gradient(140deg, var(--gistui-accent), color-mix(in srgb, var(--gistui-accent) 35%, var(--gistui-chart-2)) 60%, var(--gistui-accent))",
  featuredGlow: "0 24px 60px -28px color-mix(in srgb, var(--gistui-accent) 65%, transparent)",
  badgeFill: "linear-gradient(90deg, var(--gistui-accent), color-mix(in srgb, var(--gistui-accent) 45%, var(--gistui-chart-2)))",
  buttonSheen: "linear-gradient(180deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0) 55%)",
  buttonGlow: "0 8px 20px -10px color-mix(in srgb, var(--gistui-primary) 75%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.14)",
  canvasPattern: "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--gistui-fg) 9%, transparent) 1px, transparent 0) 0 0 / 16px 16px",
  cardHover: "var(--gistui-ring), var(--gistui-shadow-md)",
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Values go into a <style> block: drop anything that could close the declaration or the block. */
/**
 * Keeps a token value inside its declaration (no `;`, braces, angle brackets or backslashes).
 * It is not a sanitizer: tokens come from the host's own code. Never pass text from a model, a
 * user or a URL as `tokens` or `darkTokens`; a value can still load a URL (`url(…)`) or cover the page.
 */
const clean = (v: string | number) => String(v).replace(/[;{}<>\\]/g, "").trim();

/** Turns a token object into `--gistui-*` declarations. */
export function tokenDeclarations(tokens: GistUITokens | undefined): string {
  if (!tokens) return "";
  const out: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith("--")) {
      if (/^--[\w-]+$/.test(key)) out.push(`${key}:${clean(value as string | number)}`);
      continue;
    }
    if (key === "chart" && Array.isArray(value)) {
      value.slice(0, 8).forEach((c, i) => out.push(`--gistui-chart-${i + 1}:${clean(c)}`));
      continue;
    }
    if (key === "radius" && typeof value === "number") {
      out.push(`--gistui-rounding:${Math.max(0, value) / 10}`);
      continue;
    }
    if (typeof value === "string" || typeof value === "number") out.push(`--gistui-${kebab(key)}:${clean(value)}`);
  }
  return out.join(";");
}

/** Scoped CSS for one instance: light tokens, then dark tokens for dark and system-dark. */
export function themeCss(scope: string, tokens?: GistUITokens, darkTokens?: GistUITokens): string {
  const sel = `.gistui[data-gistui-scope="${scope}"]`;
  const light = tokenDeclarations(tokens);
  const dark = tokenDeclarations(darkTokens);
  let css = light ? `${sel}{${light}}` : "";
  if (dark) {
    css += `${sel}[data-gistui-theme="dark"]{${dark}}`;
    css += `@media (prefers-color-scheme: dark){${sel}[data-gistui-theme="system"]{${dark}}}`;
  }
  return css;
}
