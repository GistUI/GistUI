import type { TableData } from "@gistui/core";
import { normalizeTable } from "@gistui/headless";
import type { ChartProps, ChartSelection, ChartType } from "@gistui/widgets";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEmit, useIsStreaming, useLocked } from "../context";
import { useDesign } from "../design";
import { lazyGroup, lazyModule, num, str, useBinding, useLazyWidget } from "../hooks";
import type { ComponentProps } from "../library";
import { IconSvg } from "./icon";
import { trendOf } from "./content";

type Data = TableData | readonly Record<string, unknown>[] | null | undefined;
export const asData = (v: unknown): Data => (Array.isArray(v) || (v && typeof v === "object" && "columns" in v) ? (v as Data) : null);

/** While streaming, a data prop that has not arrived yet shows a sized placeholder, not "No data". */
export function Waiting({ expected }: { expected: string }): ReactNode {
  return <div className="gistui-skeleton" data-expected={expected} aria-busy="true" aria-label="Loading" />;
}

/** A small smooth sparkline with a fading wash. */
function Sparkline({ values, invert = false }: { values: number[]; invert?: boolean }): ReactNode {
  const id = useId();
  if (values.length < 2) return null;
  const w = 120;
  const h = 34;
  // Loops, not `Math.min(...values)`: a program's array can be longer than an argument list may be.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 3 + (1 - (v - lo) / span) * (h - 6)] as const);
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += `C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  // Green when the line moves the good way (down is good for inverted metrics such as churn).
  const up = values.at(-1)! >= values[0]! !== invert;
  const gid = `spark${id.replace(/:/g, "")}`;
  return (
    <svg className="gistui-stat__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ color: up ? "var(--gistui-success)" : "var(--gistui-danger)" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

const NUMBER = /^([^\d-]*?)(-?[\d,]*\.?\d+)(.*)$/s;

/** Animations only where people see them: not with reduced motion, in automation or test DOMs. */
function motionOk(): boolean {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return false;
  if ((navigator as { webdriver?: boolean }).webdriver) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A formatted number that counts up when it first scrolls into view ("$1.2M", "3,941", "18.6%"),
 * and from its old to its new value when live data changes. The text is always the real value for
 * screen readers and copy.
 */
function CountUp({ text }: { text: string | undefined }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Write into React's own text node, so React and the animation never disagree.
    const put = (v: string) => {
      const node = el.firstChild;
      if (node && node.nodeType === 3) node.nodeValue = v;
    };
    // Whatever an earlier animation left there (a half-counted or zero value): the text is the real
    // value again, also when the new one is not a number or nothing animates.
    put(text ?? "");
    const m = text ? NUMBER.exec(text) : null;
    if (!m || !motionOk()) return;
    const [, pre, digits, post] = m as unknown as [string, string, string, string];
    const target = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const decimals = (digits.split(".")[1] ?? "").length;
    const grouped = digits.includes(",");
    const fmt = (n: number) => `${pre}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })}${post}`;
    const from = shown.current ?? 0;
    if (from === target) return;
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const dur = shown.current === null ? 900 : 500;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        put(fmt(from + (target - from) * eased));
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          put(text!);
          shown.current = target;
        }
      };
      raf = requestAnimationFrame(step);
    };
    if (shown.current !== null) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    // First time: when it becomes visible.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    put(fmt(0));
    io.observe(el);
    // No text is written here: by now React has committed the next text, and the old one would replace it.
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text]);
  return (
    <span ref={ref} aria-label={text}>
      {text}
    </span>
  );
}

function StatCard({ label, value, delta, note, icon, spark, invert = false, design }: {
  design?: ReturnType<typeof useDesign>;
  label?: string | undefined;
  value?: string | undefined;
  delta?: string | undefined;
  note?: string | undefined;
  icon?: string | undefined;
  spark?: number[] | undefined;
  invert?: boolean;
}): ReactNode {
  const t = trendOf(delta);
  // Colour says good or bad; the arrow says up or down.
  const tone = t && (t === "up") !== invert ? "up" : t ? "down" : undefined;
  return (
    <div className={design?.className ? `gistui-stat ${design.className}` : "gistui-stat"} data-gistui="Stat" style={design?.style} {...design?.attrs}>
      <span className="gistui-stat__label">
        {icon && <IconSvg name={icon} />}
        {label}
      </span>
      <span className="gistui-stat__value">
        <CountUp text={value} />
      </span>
      {(delta || note) && (
        <span className="gistui-stat__foot">
          {delta && (
            <span className="gistui-stat__delta" data-trend={tone}>
              {t && <IconSvg name={t === "up" ? "trending-up" : "trending-down"} />}
              {delta}
            </span>
          )}
          {note && <span>{note}</span>}
        </span>
      )}
      {spark && <Sparkline values={spark} invert={invert} />}
    </div>
  );
}

const numbers = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(Number).filter((n) => Number.isFinite(n));
  return out.length > 1 ? out : undefined;
};

export function Stat({ props }: ComponentProps): ReactNode {
  const d = useDesign("Stat", props);
  return (
    <StatCard
      design={d}
      label={str(props.label)}
      value={str(props.value)}
      delta={str(props.delta)}
      note={str(props.note)}
      icon={str(props.icon)}
      spark={numbers(props.spark)}
      invert={props.invert === true}
    />
  );
}

/** One Stat per row of a |Label|Value|Delta|Note table (columns by position; raw cell text is shown). */
export function Stats({ props }: ComponentProps): ReactNode {
  const streaming = useIsStreaming();
  const data = asData(props.data);
  if (streaming && !data) return <Waiting expected="Stats" />;
  const t = normalizeTable(data);
  return (
    <div className="gistui-stats" data-gistui="Stats">
      {t.text.map((row, i) => (
        <StatCard key={i} label={row[0]} value={row[1]} delta={row[2] || undefined} note={row[3] || undefined} />
      ))}
    </div>
  );
}

export function Progress({ props }: ComponentProps): ReactNode {
  const max = num(props.max) ?? 100;
  const value = num(props.value) ?? 0;
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const label = str(props.label);
  return (
    <div className="gistui-progress" data-gistui="Progress" data-tone={str(props.tone)}>
      <div className="gistui-progress__head">
        <span>{label}</span>
        <span>{str(props.note) ?? `${Math.round(pct)}%`}</span>
      </div>
      <div className="gistui-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="gistui-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Tables (sorting, search, paging) usually arrive last in a stream: their own chunk. */
export const tables = lazyGroup(() => import("./table"));
/** The chart engine is its own chunk (plan §1: heavy components load lazily). */
// If the chart chunk cannot load, its data is shown as a table.
const FallbackTable = tables.get("Table");

const chartFactory = lazyModule(() => import("@gistui/widgets/chart").then((m) => m.createChart));

/** Starts loading the chart chunk early, e.g. when a stream first mentions `Chart(`. */
export const preloadChart = (): Promise<unknown> => chartFactory.load();

export function Chart(p: ComponentProps): ReactNode {
  const { node, props } = p;
  const emit = useEmit();
  const locked = useLocked(node);
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  // `bind:$pick` holds the selected category (x), e.g. for a drill-down table below the chart.
  const b = useBinding(node);
  const onSelect = useCallback(
    (sel: ChartSelection | null) => {
      setSelected(sel);
      if (b.bound) b.set(sel && "x" in sel ? sel.x : null);
      emit({ type: "select", nodeId: node.id, value: sel });
    },
    [emit, node.id, b],
  );
  const chart: ChartProps = {
    data: asData(props.data),
    type: (str(props.type) as ChartType | undefined) ?? "bar",
    stacked: props.stacked === true,
    zoom: props.zoom === true,
    select: props.select === "range" ? "range" : "point",
    selected,
    onSelect,
    interactive: !locked,
    partial: node.partial,
    ...(str(props.x) ? { x: str(props.x) } : {}),
    ...(str(props.y) ? { y: str(props.y) } : {}),
    // What a screen reader calls the chart: its title, else its axis label.
    ...((str(props.title) ?? str(props.y)) ? { label: str(props.title) ?? str(props.y) } : {}),
    // A program-chosen height stays in a sane range.
    ...(num(props.height) ? { height: Math.max(80, Math.min(1200, Math.round(num(props.height)!))) } : {}),

    ...(props.legend !== undefined ? { legend: props.legend === true } : {}),
  };
  const streaming = useIsStreaming();
  const { ref, ready, failed } = useLazyWidget(chartFactory, chart);
  // If the chart chunk cannot be loaded, the data is still shown, as a table.
  if (failed) return <FallbackTable {...p} props={{ data: props.data }} />;
  const waiting = !ready || (streaming && !chart.data);
  const title = str(props.title);
  const subtitle = str(props.subtitle);
  return (
    <div data-gistui="Chart" className="gistui-stack" data-gap="sm">
      {(title || subtitle) && (
        <header className="gistui-header" data-size="sm">
          {title && <h3 className="gistui-header__title">{title}</h3>}
          {subtitle && <p className="gistui-header__subtitle">{subtitle}</p>}
        </header>
      )}
      {waiting && <div className="gistui-skeleton" data-expected="Chart" style={chart.height ? { height: chart.height } : undefined} />}
      <div ref={ref} hidden={waiting} />
    </div>
  );
}
