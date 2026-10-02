/**
 * Your own Svelte components as GistUI renderers. Each is mounted once and its props stay reactive
 * (Svelte 5 runes), so it keeps its own state while the program streams.
 */

import { formField, type DomContext, type DomRenderer, type FieldKind, type GistField } from "@gistui/vanilla";
import { mount, unmount, untrack, type Component } from "svelte";
import { CHILDREN } from "./context";

/** What your own component receives as props. */
export interface GistUIComponentProps {
  /** The component's resolved props (component-valued props are `NodeRef`s). */
  props: Readonly<Record<string, unknown>>;
  node: DomContext["node"];
  /** The renderer context: actions (`emit`, `run`), bindings, `locked`, `streaming`… */
  ctx: DomContext;
}

/** A DOM renderer that mounts a Svelte component; `context` passes the surrounding Svelte context. */
export function svelteRenderer(component: Component<GistUIComponentProps>, context?: Map<unknown, unknown>): DomRenderer {
  return (ctx) => {
    const el = document.createElement("div");
    el.style.display = "contents";
    el.setAttribute("data-gistui", ctx.type);
    let current = $state.raw(ctx);
    const contexts = new Map(context ?? []);
    contexts.set(CHILDREN, () => current);
    const instance = mount(component, {
      target: el,
      context: contexts,
      props: {
        get props() {
          return current.props;
        },
        get node() {
          return current.node;
        },
        get ctx() {
          return current;
        },
      },
    });
    return {
      el,
      update(next) {
        current = next;
        return true;
      },
      destroy() {
        void unmount(instance);
      },
    };
  };
}

/** Renderers for a map of Svelte components (`{ Card: MyCard }`). */
export function svelteComponents(components: Readonly<Record<string, Component<GistUIComponentProps>>>, context?: Map<unknown, unknown>): Record<string, DomRenderer> {
  return Object.fromEntries(Object.entries(components).map(([name, c]) => [name, svelteRenderer(c, context)]));
}

/**
 * Makes your own field component (a shadcn-svelte input, a Bits UI select…) a real GistUI form field:
 * the Form around it validates it (required, type, lengths, pattern… from its props) on submit,
 * blur or change, and `bind:$var` works. Render a native control (or your library's hidden input)
 * with `name`, show `error`, and disable it while `locked`. Call it while the component initialises.
 *
 *   let p: GistUIComponentProps = $props();
 *   const field = gistField(() => p.ctx);
 *   <input name={field.current.name} disabled={field.current.locked} />
 *   {#if field.current.error}<p>{field.current.error}</p>{/if}
 *
 * `kind` says how the value is read: "text" (default), "bool" (one checkbox) or "list".
 */
export function gistField(ctx: () => DomContext, kind: FieldKind = "text"): { readonly current: GistField } {
  const field = formField(untrack(ctx), () => (state = field.state()), kind);
  let state = $state.raw(field.state());
  $effect.pre(() => {
    const c = ctx();
    untrack(() => {
      field.sync(c);
      state = field.state();
    });
  });
  return {
    get current() {
      return state;
    },
  };
}
