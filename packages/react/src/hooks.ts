import type { GistUINode } from "@gistui/core";
import type { Widget } from "@gistui/widgets";
import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { useEngine } from "./context";
import type { ComponentProps } from "./library";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Mounts a framework-free widget (@gistui/widgets) into a div: created once, `update`d on every render
 * (widgets make unchanged props cheap), destroyed on unmount.
 */
export function useWidget<P>(create: (el: HTMLElement, props: P) => Widget<P>, props: P): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<Widget<P> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useIsoLayoutEffect(() => {
    if (!ref.current) return;
    widget.current = create(ref.current, latest.current);
    return () => {
      widget.current?.destroy();
      widget.current = null;
    };
    // `create` is a module-level factory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useIsoLayoutEffect(() => {
    widget.current?.update(props);
  });
  return ref;
}

type Factory<P> = (el: HTMLElement, props: P) => Widget<P>;

/**
 * A lazily imported module (a separate chunk): imported once, then available synchronously.
 * A failed import is retried with a short backoff; if it still fails (offline, or a stale deploy whose
 * chunk no longer exists) the next `load()` tries again, so a later mount can still succeed.
 */
export interface LazyModule<T> {
  load(): Promise<T>;
  current: T | null;
}

export function lazyModule<T>(importer: () => Promise<T>, retries = 2): LazyModule<T> {
  let promise: Promise<T> | null = null;
  const attempt = async (): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await importer();
      } catch (e) {
        if (i >= retries) throw e;
        await new Promise((r) => setTimeout(r, 250 * 2 ** i));
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

/**
 * Components that live in a lazily loaded chunk. `get(name)` is a stand-in that renders a skeleton
 * until the chunk arrives (loading starts when the first one renders, i.e. as soon as a streamed
 * program uses it), then the real component. `load()` preloads the chunk.
 */
export function lazyGroup<M extends Record<string, unknown>>(importer: () => Promise<M>): {
  load: () => Promise<M>;
  get: (name: keyof M & string) => (props: ComponentProps) => ReactNode;
} {
  const mod = lazyModule(importer);
  const cache = new Map<string, (props: ComponentProps) => ReactNode>();
  return {
    load: mod.load,
    get: (name) => {
      let c = cache.get(name);
      if (!c) {
        c = function Lazy(props: ComponentProps): ReactNode {
          const { value, failed } = useLazyModule(mod);
          const Impl = value?.[name] as ((p: ComponentProps) => ReactNode) | undefined;
          if (Impl) return createElement(Impl, props);
          return createElement("div", { className: "gistui-skeleton", "data-expected": name, "data-failed": failed || undefined, "aria-busy": !failed, "aria-label": failed ? `${name} could not load` : "Loading" });
        };
        cache.set(name, c);
      }
      return c;
    },
  };
}

/**
 * Two-way binding (`bind:$var`): the component's value is that state variable, and user changes set
 * it. `bound` is false without a binding, so components keep their own state then.
 */
export function useBinding(node: GistUINode): { bound: boolean; value: unknown; set: (v: unknown) => void } {
  const { runtime } = useEngine();
  const e = node.dyn?.bind;
  const name = e?.k === "state" ? e.name : null;
  const subscribe = useCallback((cb: () => void) => (name ? runtime.subscribeState(name, cb) : () => {}), [runtime, name]);
  const get = () => (name ? runtime.getState(name) : undefined);
  const value = useSyncExternalStore(subscribe, get, get);
  const set = useCallback((v: unknown) => {
    if (name) runtime.setState(name, v);
  }, [runtime, name]);
  return { bound: name !== null, value, set };
}

/** The module once loaded, or `failed` when its chunk could not be loaded. */
export function useLazyModule<T>(mod: LazyModule<T>): { value: T | null; failed: boolean } {
  const [state, setState] = useState<{ value: T | null; failed: boolean }>(() => ({ value: mod.current, failed: false }));
  useEffect(() => {
    if (state.value) return;
    let alive = true;
    mod.load().then(
      (value) => alive && setState({ value, failed: false }),
      () => alive && setState({ value: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [mod, state.value]);
  return state;
}

/**
 * Like `useWidget`, for a widget in its own chunk (charts). Until the chunk arrives `ready` is false,
 * so the caller can show a sized placeholder; `failed` means it could not be loaded at all.
 */
export function useLazyWidget<P>(mod: LazyModule<Factory<P>>, props: P): { ref: RefObject<HTMLDivElement | null>; ready: boolean; failed: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<Widget<P> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { value: create, failed } = useLazyModule(mod);
  useIsoLayoutEffect(() => {
    if (!create || !ref.current || widget.current) return;
    widget.current = create(ref.current, latest.current);
  }, [create]);
  useIsoLayoutEffect(
    () => () => {
      widget.current?.destroy();
      widget.current = null;
    },
    [],
  );
  useIsoLayoutEffect(() => {
    widget.current?.update(props);
  });
  return { ref, ready: create !== null, failed };
}

/** Subscribes to several nodes at once (e.g. Tabs reading its Tab labels). */
export function useNodes(ids: readonly string[]): readonly (GistUINode | undefined)[] {
  const { runtime } = useEngine();
  const subscribe = useCallback(
    (cb: () => void) => {
      const offs = ids.map((id) => runtime.subscribe(id, cb));
      return () => offs.forEach((off) => off());
    },
    [runtime, ids],
  );
  const cache = useRef<readonly (GistUINode | undefined)[]>([]);
  const get = () => {
    const prev = cache.current;
    if (prev.length === ids.length && ids.every((id, i) => runtime.view(id) === prev[i])) return prev;
    return (cache.current = ids.map((id) => runtime.view(id)));
  };
  return useSyncExternalStore(subscribe, get, get);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : undefined);
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** URL allowlist for images and links (§2.5, rule 10): http(s), and relative URLs. */
export { safeUrl } from "@gistui/headless/url";
