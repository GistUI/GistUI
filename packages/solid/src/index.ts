/**
 * `@gistui/solid`: GistUI for Solid (SolidStart, TanStack Start with Solid).
 *
 *   import { GistUI } from "@gistui/solid";
 *   import "@gistui/styles/styles.css";
 *
 *   <GistUI source={answer()} streaming={loading()} onAction={handle} />
 *
 * The default components are built in. Replace any of them with your own Solid component: it gets
 * `props` (the component's resolved props), `node` and `ctx`, and `<GistChildren />` places its
 * children wherever it renders it. Your components see the context of the component around `<GistUI>`.
 *
 *   <GistUI source={answer()} components={{ Card: MyCard }} />
 */

import type { GistUIError, GistUINode, ToolCall, ToolProvider } from "@gistui/core";
import { componentLibrary, formField, mount, syncOptions, type DomContext as Ctx, type DomLibrary as Library, type DomRenderer, type FieldKind, type GistField, type GistUIAction as Action, type GistUIMount, type MountOptions } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";
import type { GistUITokens } from "@gistui/headless/theme";
import { createComponent, createContext, createEffect, createRoot, createSignal, getOwner, on, onCleanup, onMount, useContext, type Accessor, type Component, type JSX, type Owner } from "solid-js";
import { getNextElement, insert, isServer, ssr, ssrHydrationKey, template } from "solid-js/web";

export { ui };
// Types (DomContext, DomLibrary, GistUIAction, GistField…) come from "@gistui/vanilla".

/** What your own component receives as props. */
export interface GistUIComponentProps {
  /** The component's resolved props (component-valued props are `NodeRef`s). */
  props: Readonly<Record<string, unknown>>;
  node: GistUINode;
  /** The renderer context: actions (`emit`, `run`), bindings, `locked`, `streaming`… */
  ctx: Ctx;
}

const ChildrenContext = createContext<Accessor<Ctx>>();

/**
 * Places the GistUI children of the component it is used in, inside a `display: contents` wrapper
 * (or the element `as` names).
 */
export function GistChildren(props: { as?: keyof HTMLElementTagNameMap }): JSX.Element {
  // Nothing on the server: a program renders in the browser, and so do the components in it.
  if (isServer) return undefined;
  const ctx = useContext(ChildrenContext);
  const el = document.createElement(props.as ?? "div");
  if (!props.as) el.style.display = "contents";
  el.setAttribute("data-gistui-children", "");
  createEffect(() => ctx?.().place(el));
  return el;
}

/**
 * Makes your own field component (a Kobalte or solid-ui input, select…) a real GistUI form field:
 * the Form around it validates it (required, type, lengths, pattern… from its props) on submit,
 * blur or change, and `bind:$var` works. Render a native control (or your library's hidden input)
 * with `name`, show `error`, and disable it while `locked`.
 *
 *   const field = createGistField(props);
 *   <input name={field().name} disabled={field().locked} aria-invalid={!!field().error} />
 *   <Show when={field().error}>{(e) => <p>{e()}</p>}</Show>
 *
 * `kind` says how the value is read: "text" (default), "bool" (one checkbox) or "list".
 */
export function createGistField(p: GistUIComponentProps, kind: FieldKind = "text"): Accessor<GistField> {
  const field = formField(p.ctx, () => setState(field.state()), kind);
  const [state, setState] = createSignal(field.state(), { equals: false });
  // Not deferred: GistUI mounts inside Solid's onMount, so the Form can provide itself (and this
  // field get a new context) before this effect's first run; that run must sync too.
  createEffect(() => {
    field.sync(p.ctx);
    setState(field.state());
  });
  return state;
}

/** A DOM renderer that renders a Solid component, under `owner` so it sees the app's context. */
export function solidRenderer(component: Component<GistUIComponentProps>, owner: Owner | null = null): DomRenderer {
  return (ctx) => {
    const el = document.createElement("div");
    el.style.display = "contents";
    el.setAttribute("data-gistui", ctx.type);
    const [state, setState] = createSignal(ctx, { equals: false });
    const dispose = createRoot((d) => {
      insert(el, () =>
        createComponent(ChildrenContext.Provider, {
          value: state,
          get children() {
            return createComponent(component, {
              get props() {
                return state().props;
              },
              get node() {
                return state().node;
              },
              get ctx() {
                return state();
              },
            });
          },
        }),
      );
      return d;
    }, owner ?? undefined);
    return {
      el,
      update(next) {
        setState(next);
        return true;
      },
      destroy: dispose,
    };
  };
}

export interface GistUIProps {
  /** The component library (default: GistUI's built-in components). */
  library?: Library;
  /** Your own Solid components, by component name; they replace the built-in ones. */
  components?: Readonly<Record<string, Component<GistUIComponentProps>>>;
  /** A growing source string; only the appended part is parsed. */
  source?: string;
  /** With `source`: more text is still coming. */
  streaming?: boolean;
  /** A response stream (text or UTF-8 bytes); a new stream starts a new render. */
  stream?: ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string> | null;
  inline?: boolean;
  theme?: "light" | "dark" | "system";
  color?: string;
  tokens?: GistUITokens;
  darkTokens?: GistUITokens;
  classNames?: Readonly<Record<string, string>>;
  /** Read-only tools for `@query`. */
  tools?: ToolProvider;
  /** Tools that change something, for `@mutation` (run only from a user's action). */
  mutations?: ToolProvider;
  /** Called before every tool call (to log, check or confirm); return or resolve `false` to block it. */
  onToolCall?: (call: ToolCall) => boolean | void | Promise<boolean | void>;
  /** Hosts that images, video and backgrounds may load from (`"cdn.example.com"`, `"*.example.com"`). */
  allowedHosts?: readonly string[];
  /** Stops timed data refreshes (`every:`) while true; the UI still loads and answers. */
  paused?: boolean;
  /** Site icons on Source cards: `true` for a public favicon service, or your own URL with `{host}`. Off by default. */
  favicons?: boolean | string;
  initialState?: Readonly<Record<string, unknown>>;
  lockUntil?: "done" | "ready";
  openLinks?: boolean;
  onAction?: (action: Action) => void;
  onError?: (errors: GistUIError[]) => void;
  onStateChange?: (name: string, value: unknown) => void;
  onProse?: (text: string, line: number) => void;
  /** Repair a program that ends with mistakes, in code, and show the repaired version (default true). */
  autofix?: boolean;
  /** A program was repaired: what changed, and the errors left. */
  onAutofix?: (result: { changes: string[]; errors: GistUIError[] }) => void;
}

// The wrapper element, as the compiler would write `<div style="display:contents" />`.
const WRAPPER = '<div style="display:contents"></div>';
let wrapper: (() => Element) | undefined;

export function GistUI(props: GistUIProps): JSX.Element {
  // On the server only the empty wrapper is rendered (no `document` there); the program renders in
  // the browser, once mounted. The wrapper carries its hydration key, so the browser takes it over.
  if (isServer) return ssr(["<div", WRAPPER.slice(4)], ssrHydrationKey()) as unknown as JSX.Element;
  // The server's element while hydrating, a new one otherwise.
  const el = getNextElement((wrapper ??= template(WRAPPER))) as HTMLDivElement;
  const owner = getOwner();
  let view: GistUIMount | null = null;
  let last: MountOptions | null = null;
  // One renderer per component, and the same library for the same entries: a `components` object
  // that is new on every change rebuilds nothing.
  const withComponents = componentLibrary((c: Component<GistUIComponentProps>) => solidRenderer(c, owner));
  const handlers: Partial<MountOptions> = {
    onAction: (a) => props.onAction?.(a),
    onError: (e) => props.onError?.(e),
    onStateChange: (n, v) => props.onStateChange?.(n, v),
    onProse: (t, l) => props.onProse?.(t, l),
    onAutofix: (r) => props.onAutofix?.(r),
    onToolCall: (call) => props.onToolCall?.(call),
  };
  /** Every option, as it is now (a prop that is not set is `undefined`: unset). */
  const options = (): MountOptions => ({
    ...handlers,
    library: withComponents(props.library ?? ui, props.components),
    stream: props.stream,
    source: props.source ?? "",
    streaming: props.streaming,
    inline: props.inline,
    theme: props.theme,
    color: props.color,
    tokens: props.tokens,
    darkTokens: props.darkTokens,
    classNames: props.classNames,
    tools: props.tools,
    mutations: props.mutations,
    allowedHosts: props.allowedHosts,
    paused: props.paused,
    favicons: props.favicons,
    initialState: props.initialState,
    lockUntil: props.lockUntil,
    openLinks: props.openLinks,
    autofix: props.autofix,
  });
  onMount(() => {
    view = mount(el, (last = options()));
  });
  // Whatever changed, and only that, goes to the renderer.
  createEffect(
    on(
      options,
      (next) => {
        if (view && last) syncOptions(view, last, next);
        last = next;
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    view?.destroy();
    view = null;
  });
  return el;
}

export default GistUI;
