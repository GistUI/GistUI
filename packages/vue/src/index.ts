/**
 * `@gistui/vue`: GistUI for Vue 3.5+.
 *
 *   <script setup>
 *   import { GistUI } from "@gistui/vue";
 *   import "@gistui/styles/styles.css";
 *   </script>
 *   <template>
 *     <GistUI :source="answer" :streaming="loading" @action="onAction" />
 *   </template>
 *
 * The default components are built in. Replace any of them with your own Vue component: it gets
 * `props` (the component's resolved props), `node` and `ctx`, and `<GistChildren />` places its
 * children wherever it renders it.
 *
 *   <GistUI :source="answer" :components="{ Card: MyCard }" />
 */

import type { GistUIError, GistUINode, ToolCall, ToolProvider } from "@gistui/core";
import { componentLibrary, formField, mount, syncOptions, type DomContext as Ctx, type DomLibrary as Library, type DomRenderer, type FieldKind, type GistField, type GistUIAction as Action, type GistUIMount, type MountOptions } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";
import type { GistUITokens } from "@gistui/headless/theme";
import {
  computed,
  createVNode,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  render as renderVNode,
  shallowRef,
  watch,
  type AppContext,
  type Component,
  type InjectionKey,
  type PropType,
  type ShallowRef,
} from "vue";

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

const CHILDREN: InjectionKey<ShallowRef<Ctx>> = Symbol("gistui.children");

/**
 * Places the GistUI children of the component it is used in. Renders a `display: contents` wrapper
 * by default; `as` picks the element (its children are then GistUI's).
 */
export const GistChildren = defineComponent({
  name: "GistChildren",
  props: { as: { type: String, default: undefined } },
  setup(props) {
    const ctx = inject(CHILDREN, null);
    const el = ref<HTMLElement | null>(null);
    const place = () => {
      if (el.value && ctx?.value) ctx.value.place(el.value);
    };
    onMounted(place);
    watch(() => ctx?.value, place);
    return () => h(props.as ?? "div", { ref: el, ...(props.as ? {} : { style: "display:contents" }), "data-gistui-children": "" });
  },
});

/**
 * Makes your own field component (a shadcn-vue `<Input>`, a Reka UI select…) a real GistUI form
 * field: the Form around it validates it (required, type, lengths, pattern… from its props) on
 * submit, blur or change, and `bind:$var` works. Render a native control (or your library's hidden
 * input) with `name`, show `error`, and disable it while `locked`.
 *
 *   const field = useGistField(props);
 *   <Input :name="field.name" :disabled="field.locked" :aria-invalid="!!field.error" />
 *   <p v-if="field.error">{{ field.error }}</p>
 *
 * `kind` says how the value is read: "text" (default), "bool" (one checkbox) or "list".
 */
export function useGistField(p: GistUIComponentProps, kind: FieldKind = "text"): Readonly<ShallowRef<GistField>> {
  const field = formField(p.ctx, () => (state.value = field.state()), kind);
  const state = shallowRef(field.state());
  watch(
    () => p.ctx,
    (c) => {
      field.sync(c);
      state.value = field.state();
    },
  );
  return state;
}

type WithProvides = { provides: Record<string | symbol, unknown> };

/**
 * A DOM renderer that renders a Vue component in the app's context (plugins, globals) and with what
 * the components around `<GistUI>` provide, so `inject` works as if it were rendered in place.
 */
export function vueRenderer(component: Component, appContext: () => AppContext | null = () => null, provides: () => object | null = () => null): DomRenderer {
  return (ctx) => {
    const el = document.createElement("div");
    el.style.display = "contents";
    el.setAttribute("data-gistui", ctx.type);
    const state = shallowRef(ctx);
    const Host = defineComponent({
      setup() {
        const outer = provides();
        const self = getCurrentInstance() as unknown as WithProvides | null;
        if (outer && self) self.provides = Object.create(outer);
        provide(CHILDREN, state);
        return () => h(component, { props: state.value.props, node: state.value.node, ctx: state.value });
      },
    });
    const vnode = createVNode(Host);
    vnode.appContext = appContext();
    renderVNode(vnode, el);
    return {
      el,
      update(next) {
        state.value = next;
        return true;
      },
      destroy() {
        renderVNode(null, el);
      },
    };
  };
}

export const GistUI = defineComponent({
  name: "GistUI",
  props: {
    /** The component library (default: GistUI's built-in components). */
    library: { type: Object as PropType<Library>, default: undefined },
    /** Your own Vue components, by component name; they replace the built-in ones. */
    components: { type: Object as PropType<Readonly<Record<string, Component>>>, default: undefined },
    /** A growing source string; only the appended part is parsed. */
    source: { type: String, default: undefined },
    /** With `source`: more text is still coming. */
    streaming: { type: Boolean, default: false },
    /** A response stream (text or UTF-8 bytes); a new stream starts a new render. */
    stream: { type: Object as PropType<ReadableStream<Uint8Array | string> | AsyncIterable<Uint8Array | string> | null>, default: undefined },
    inline: { type: Boolean, default: false },
    theme: { type: String as PropType<"light" | "dark" | "system">, default: "system" },
    color: { type: String, default: undefined },
    tokens: { type: Object as PropType<GistUITokens>, default: undefined },
    darkTokens: { type: Object as PropType<GistUITokens>, default: undefined },
    classNames: { type: Object as PropType<Readonly<Record<string, string>>>, default: undefined },
    /** Read-only tools for `@query`. */
    tools: { type: Object as PropType<ToolProvider>, default: undefined },
    /** Tools that change something, for `@mutation` (run only from a user's action). */
    mutations: { type: Object as PropType<ToolProvider>, default: undefined },
    /** Called before every tool call (to log, check or confirm); return or resolve `false` to block it. */
    onToolCall: { type: Function as PropType<(call: ToolCall) => boolean | void | Promise<boolean | void>>, default: undefined },
    /** Hosts that images, video and backgrounds may load from (`"cdn.example.com"`, `"*.example.com"`). */
    allowedHosts: { type: Array as PropType<readonly string[]>, default: undefined },
    /** Site icons on Source cards: `true` for a public favicon service, or your own URL with `{host}`. Off by default. */
    favicons: { type: [Boolean, String] as PropType<boolean | string>, default: undefined },
    /** Stops timed data refreshes (`every:`) while true; the UI still loads and answers. */
    paused: { type: Boolean, default: false },
    initialState: { type: Object as PropType<Readonly<Record<string, unknown>>>, default: undefined },
    lockUntil: { type: String as PropType<"done" | "ready">, default: "done" },
    openLinks: { type: Boolean, default: true },
    /** Repair a program that ends with mistakes, in code, and show the repaired version. */
    autofix: { type: Boolean, default: true },
  },
  emits: {
    action: (_a: Action) => true,
    error: (_e: GistUIError[]) => true,
    stateChange: (_name: string, _value: unknown) => true,
    prose: (_text: string, _line: number) => true,
    /** A program was repaired: what changed, and the errors left. */
    autofix: (_r: { changes: string[]; errors: GistUIError[] }) => true,
  },
  setup(props, { emit }) {
    const host = ref<HTMLElement | null>(null);
    const inst = getCurrentInstance();
    const app = inst?.appContext ?? null;
    const outerProvides = (inst as unknown as WithProvides | null)?.provides ?? null;
    let view: GistUIMount | null = null;
    // `:components="{ Card: MyCard }"` is a new object on every parent render: one renderer per
    // component, and the same library for the same entries, so nothing is rebuilt for that.
    const withComponents = componentLibrary((c: Component) => vueRenderer(c, () => app, () => outerProvides));
    const library = computed(() => withComponents(props.library ?? ui, props.components));
    // Tokens and classes may be reactive objects changed in place: a copy per change, so that is
    // seen as a change too.
    const copy = <T extends object>(o: T | undefined): T | undefined => o && (Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])) as T);
    const tokens = computed(() => copy(props.tokens));
    const darkTokens = computed(() => copy(props.darkTokens));
    const classNames = computed(() => copy(props.classNames));
    const handlers: Partial<MountOptions> = {
      onAction: (a) => emit("action", a),
      onError: (e) => emit("error", e),
      onStateChange: (n, v) => emit("stateChange", n, v),
      onProse: (t, l) => emit("prose", t, l),
      onAutofix: (r) => emit("autofix", r),
      onToolCall: (call) => props.onToolCall?.(call),
    };
    /** Every option, as it is now (a prop that is not set is `undefined`: unset). */
    const options = (): MountOptions => ({
      ...handlers,
      library: library.value,
      stream: props.stream,
      source: props.source ?? "",
      streaming: props.streaming,
      inline: props.inline,
      theme: props.theme,
      color: props.color,
      tokens: tokens.value,
      darkTokens: darkTokens.value,
      classNames: classNames.value,
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
    let last: MountOptions | null = null;
    onMounted(() => {
      view = mount(host.value!, (last = options()));
    });
    // Whatever changed, and only that, goes to the renderer.
    watch(options, (next) => {
      if (view && last) syncOptions(view, last, next);
      last = next;
    });
    onBeforeUnmount(() => {
      view?.destroy();
      view = null;
    });
    return () => h("div", { ref: host, style: "display:contents" });
  },
});

export default GistUI;
