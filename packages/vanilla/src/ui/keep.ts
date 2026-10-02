/**
 * Elements kept between draws. A component that shows a list (options, tabs, thumbnails) asks for
 * each entry by key: the first draw creates it, later draws get the same one back and patch it. So an
 * element that has the focus, a loaded picture or a playing video is never replaced by a redraw.
 */

export interface Kept<V> {
  /** The entry for `key`, created on first use. A key repeated within one draw gets its own entry. */
  get(key: string, create: () => V): V;
  /** Ends a draw: drops the entries this draw did not ask for (`drop` releases what they hold). */
  prune(drop?: (value: V) => void): void;
}

export function keep<V>(): Kept<V> {
  const all = new Map<string, V>();
  const used = new Set<string>();
  return {
    get(key, create) {
      let k = key;
      for (let n = 1; used.has(k); n++) k = `${key}\u0000${n}`;
      used.add(k);
      let v = all.get(k);
      if (v === undefined) all.set(k, (v = create()));
      return v;
    },
    prune(drop) {
      for (const [k, v] of [...all]) {
        if (used.has(k)) continue;
        all.delete(k);
        drop?.(v);
      }
      used.clear();
    },
  };
}
