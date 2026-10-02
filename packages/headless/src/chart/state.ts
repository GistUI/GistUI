/** Legend and selection state helpers, shared by every framework's chart binding. */

/** Toggles a series (or pie slice) key in the hidden set. Returns a new set. */
export function toggleHidden(hidden: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** A selected point, identified by series name and row. */
export interface PointRef {
  series: string;
  row: number;
}

/** Point selections are equal when they name the same series and row. */
export function samePoint(a: PointRef | null | undefined, b: PointRef | null | undefined): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return a.series === b.series && a.row === b.row;
}

export interface NavItem {
  /** Series position (0 for pie slices). */
  s: number;
  row: number;
}

/**
 * Keyboard navigation over chart marks. Left/Right move along rows within a series, Up/Down switch to
 * the nearest mark of the neighbouring series in the same row, Home/End jump to the ends.
 * Returns the index into `items` to focus next, or -1 when the key is not a navigation key.
 */
export function navigate(items: readonly NavItem[], current: number, key: string, horizontal = false): number {
  if (!items.length) return -1;
  const cur = items[current] ?? items[0]!;
  const along = horizontal ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  const across = horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (key === "Home") return 0;
  if (key === "End") return items.length - 1;
  const dirAlong = key === along[1] ? 1 : key === along[0] ? -1 : 0;
  if (dirAlong) {
    const same = items.map((it, i) => ({ it, i })).filter(({ it }) => it.s === cur.s).sort((a, b) => a.it.row - b.it.row);
    const at = same.findIndex(({ it }) => it.row === cur.row);
    const next = same[Math.min(same.length - 1, Math.max(0, at + dirAlong))];
    return next ? next.i : current;
  }
  // Up moves to a higher series on vertical charts (visually above in a stack); down to a lower one.
  const dirAcross = key === across[0] ? (horizontal ? -1 : 1) : key === across[1] ? (horizontal ? 1 : -1) : 0;
  if (dirAcross) {
    const others = [...new Set(items.map((it) => it.s))].sort((a, b) => a - b);
    const pos = others.indexOf(cur.s);
    const target = others[pos + dirAcross];
    if (target === undefined) return current;
    let best = -1;
    let bestD = Infinity;
    items.forEach((it, i) => {
      if (it.s !== target) return;
      const d = Math.abs(it.row - cur.row);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? best : current;
  }
  return -1;
}
