<!--
  <GistUI source={answer} streaming={loading} onaction={handle} />
  The default components are built in; `components={{ Card: MyCard }}` replaces any of them with your
  own Svelte component, which sees the context of the components around <GistUI>.
-->
<script lang="ts">
  import { getAllContexts, untrack, type Component } from "svelte";
  import type { GistUIError, ToolCall, ToolProvider } from "@gistui/core";
  import { componentLibrary, mount, syncOptions, type DomLibrary, type GistUIAction, type GistUIMount, type MountOptions } from "@gistui/vanilla";
  import { ui } from "@gistui/vanilla/ui";
  import type { GistUITokens } from "@gistui/headless/theme";
  import { svelteRenderer, type GistUIComponentProps } from "./bridge.svelte";

  let {
    library = undefined,
    components = undefined,
    source = undefined,
    streaming = false,
    stream = undefined,
    inline = false,
    theme = "system",
    color = undefined,
    tokens = undefined,
    darkTokens = undefined,
    classNames = undefined,
    tools = undefined,
    mutations = undefined,
    allowedHosts = undefined,
    paused = false,
    favicons = undefined,
    initialState = undefined,
    lockUntil = "done",
    openLinks = true,
    autofix = true,
    onaction = undefined,
    onerror = undefined,
    onstatechange = undefined,
    onprose = undefined,
    onautofix = undefined,
    ontoolcall = undefined,
  }: {
    library?: DomLibrary;
    components?: Readonly<Record<string, Component<GistUIComponentProps>>>;
    source?: string;
    streaming?: boolean;
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
    /** Hosts that images, video and backgrounds may load from (`"cdn.example.com"`, `"*.example.com"`). */
    allowedHosts?: readonly string[];
    /** Stops timed data refreshes (`every:`) while true; the UI still loads and answers. */
    paused?: boolean;
    /** Site icons on Source cards: `true` for a public favicon service, or your own URL with `{host}`. Off by default. */
    favicons?: boolean | string;
    initialState?: Readonly<Record<string, unknown>>;
    lockUntil?: "done" | "ready";
    openLinks?: boolean;
    /** Repair a program that ends with mistakes, in code, and show the repaired version. */
    autofix?: boolean;
    onaction?: (action: GistUIAction) => void;
    onerror?: (errors: GistUIError[]) => void;
    onstatechange?: (name: string, value: unknown) => void;
    onprose?: (text: string, line: number) => void;
    /** A program was repaired: what changed, and the errors left. */
    onautofix?: (result: { changes: string[]; errors: GistUIError[] }) => void;
    /** Called before every tool call (to log, check or confirm); return or resolve `false` to block it. */
    ontoolcall?: (call: ToolCall) => boolean | void | Promise<boolean | void>;
  } = $props();

  const contexts = getAllContexts();
  // One renderer per component, and the same library for the same entries: `components={{ Card: MyCard }}`
  // written inline (a new object whenever the parent's state changes) rebuilds nothing.
  const withComponents = componentLibrary((c: Component<GistUIComponentProps>) => svelteRenderer(c, contexts));
  const lib = $derived(withComponents(library ?? ui, components));
  let host: HTMLDivElement | undefined = $state();
  let view: GistUIMount | undefined;
  let last: MountOptions | undefined;

  const handlers: Partial<MountOptions> = {
    onAction: (a) => onaction?.(a),
    onError: (e) => onerror?.(e),
    onStateChange: (n, v) => onstatechange?.(n, v),
    onProse: (t, l) => onprose?.(t, l),
    onAutofix: (r) => onautofix?.(r),
    onToolCall: (call) => ontoolcall?.(call),
  };
  /** Every option, as it is now (a prop that is not set is `undefined`: unset). */
  const options = (): MountOptions => ({
    ...handlers,
    library: lib,
    stream,
    source: source ?? "",
    streaming,
    inline,
    theme,
    color,
    tokens,
    darkTokens,
    classNames,
    tools,
    mutations,
    allowedHosts,
    paused,
    favicons,
    initialState,
    lockUntil,
    openLinks,
    autofix,
  });

  $effect(() => {
    if (!host) return;
    view = untrack(() => mount(host!, (last = options())));
    return () => {
      view?.destroy();
      view = undefined;
    };
  });
  // Whatever changed, and only that, goes to the renderer.
  $effect(() => {
    const next = options();
    untrack(() => {
      if (view && last) syncOptions(view, last, next);
      last = next;
    });
  });
</script>

<div bind:this={host} style="display:contents"></div>
