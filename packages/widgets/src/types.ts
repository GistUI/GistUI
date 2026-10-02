/**
 * Framework-free widgets: each one renders into a DOM element it owns, and every framework package
 * mounts it with a few lines (create on mount, `update` on prop changes, `destroy` on unmount).
 */

import type { TableData } from "@gistui/core";

export interface Widget<P> {
  /** Applies new props. Cheap when nothing relevant changed. */
  update(props: P): void;
  destroy(): void;
}

// ─── Chart ────────────────────────────────────────────────────────────────

export type ChartType = "bar" | "hbar" | "line" | "area" | "pie" | "donut" | "scatter";

/** A point selection (`select:point`, the default) or a brushed range (`select:range`). */
export type ChartSelection =
  | { kind: "point"; x: string | number; series: string; value: number | null; row: number }
  | { kind: "range"; from: string | number; to: string | number };

export interface ChartProps {
  /** A pipe table, or an array of objects (e.g. a query result). */
  data: TableData | readonly Record<string, unknown>[] | null | undefined;
  type?: ChartType;
  /** Stack series (bar, hbar, area). */
  stacked?: boolean;
  /** Column used as x / category. Defaults to the first column. */
  x?: string;
  /** Y-axis label. */
  y?: string;
  /** Height in px. Defaults to 240 (pie/donut: 220; a horizontal bar chart with many rows grows to fit its labels, up to 640). */
  height?: number;
  /** Show the legend. Defaults to true when there is more than one series (always for pie/donut). */
  legend?: boolean;
  /** Drag to zoom on line, area and scatter; double-click resets. */
  zoom?: boolean;
  select?: "point" | "range";
  /** Current selection, highlighted by the chart (controlled). */
  selected?: ChartSelection | null;
  /** Called on click / Enter (point) or brush end (range); `null` when a selection is cleared. */
  onSelect?: ((sel: ChartSelection | null) => void) | undefined;
  /** False while the chart is locked (streaming, §6.4): no selection, hover still works. */
  interactive?: boolean;
  /** True while the data table still streams: no animation; the axes are allowed to change. */
  partial?: boolean;
  /** Accessible name. */
  label?: string;
}

// ─── Markdown ─────────────────────────────────────────────────────────────

export interface MarkdownProps {
  content: string;
  /** True while the text is still streaming: the last block may be incomplete. */
  streaming?: boolean;
  /** URL allowlist for links and images. Defaults to http(s), mailto and relative URLs. */
  isSafeUrl?: (url: string, kind: "link" | "image") => boolean;
}
