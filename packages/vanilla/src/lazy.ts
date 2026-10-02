/**
 * Components in their own chunk: a placeholder shows until the chunk arrives, then the node renders
 * again with the real component. If the chunk cannot be loaded, `fallback` takes over (a native
 * <select> for Select, say) so the screen still works.
 */

import { setAttrs } from "./dom";
import type { DomInstance, DomRenderer } from "./types";

/**
 * A lazily imported module (a separate chunk): imported once, then available synchronously.
 * A failed import is retried with a short backoff; if it still fails (offline, or a stale deploy whose
 * chunk no longer exists) the next `load()` tries again, so a later render can still succeed.
 */
export interface LazyModule<T> {
  load(): Promise<T>;
  current: T | null;
}

export function lazyModule<T>(importer: () => Promise<T>, retries = 2, backoff = 250): LazyModule<T> {
  let promise: Promise<T> | null = null;
  const attempt = async (): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await importer();
      } catch (e) {
        if (i >= retries) throw e;
        await new Promise((r) => setTimeout(r, backoff * 2 ** i));
      }
    }
  };
  const lm: LazyModule<T> = {
    current: null,
    load: () =>
      (promise ??= attempt().then(
        (v) => (lm.current = v),
        (e) => {
          promise = null;
          throw e;
        },
      )),
  };
  return lm;
}

export interface LazyGroup<M> {
  /** A renderer from the module, by export name. */
  get(name: keyof M & string, placeholder?: DomRenderer, fallback?: DomRenderer): DomRenderer;
  /** Starts loading the chunk now. */
  load(): Promise<M>;
}

export function lazyGroup<M extends Record<string, unknown>>(importer: () => Promise<M>, retries?: number, backoff?: number): LazyGroup<M> {
  const mod = lazyModule(importer, retries, backoff);
  /** The last load that ended had failed (after its retries); another one may be running. */
  let failed = false;
  let loading: Promise<M> | null = null;
  // One per placeholder on screen, for as long as it lives: told whenever a load ends, either way.
  // (A list emptied after each load would lose the placeholders that are still waiting.)
  const waiting = new Set<() => void>();
  const load = (): Promise<M> => {
    if (mod.current) return Promise.resolve(mod.current);
    if (loading) return loading;
    const p = (loading = mod.load());
    const done = (ok: boolean) => {
      loading = null;
      failed = !ok;
      for (const wake of [...waiting]) wake();
    };
    p.then(
      () => done(true),
      () => done(false),
    );
    return p;
  };
  return {
    load,
    get(name, placeholder, fallback) {
      return (ctx) => {
        if (mod.current) return (mod.current[name] as DomRenderer)(ctx);
        // Whatever is created while the chunk is missing asks for it (again), so a chunk that failed
        // once is there for what renders later. Updates do not ask: no import per update.
        void load().catch(() => {});
        if (failed && fallback) return fallback(ctx);
        const shown: DomInstance = placeholder ? placeholder(ctx) : { el: document.createElement("div") };
        const mark = () => {
          if (placeholder) return;
          const off = failed && !loading;
          setAttrs(shown.el, { class: "gistui-skeleton", "data-expected": name, "data-failed": off, "aria-busy": off ? undefined : "true", "aria-label": off ? `${name} could not load` : "Loading" });
        };
        mark();
        // Not after it was replaced or destroyed (its parent may have rendered it first).
        let alive = true;
        const wake = () => alive && ctx.refresh();
        waiting.add(wake);
        return {
          el: shown.el,
          update(next) {
            // The chunk is here, or it failed and something can stand in: render again with that.
            if (mod.current || (failed && fallback)) return false;
            mark();
            return shown.update?.(next) ?? true;
          },
          destroy() {
            alive = false;
            waiting.delete(wake);
            shown.destroy?.();
          },
        };
      };
    },
  };
}
