<!-- Places the GistUI children of the component it is used in (a `display: contents` wrapper, or the element `as` names). -->
<script lang="ts">
  import { getContext } from "svelte";
  import type { DomContext } from "@gistui/vanilla";
  import { CHILDREN } from "./context";

  let { as }: { as?: string } = $props();
  const current = getContext<(() => DomContext) | undefined>(CHILDREN);
  let el: HTMLElement | undefined = $state();

  $effect(() => {
    const ctx = current?.();
    if (el && ctx) ctx.place(el);
  });
</script>

<svelte:element this={as ?? "div"} bind:this={el} style={as ? undefined : "display:contents"} data-gistui-children=""></svelte:element>
