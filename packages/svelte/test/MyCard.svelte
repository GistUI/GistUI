<script lang="ts">
  import { getContext } from "svelte";
  import { GistChildren } from "../src/index";
  let { props }: { props: Record<string, unknown> } = $props();
  const brand = getContext<string>("brand") ?? "none";
</script>

<article class="my-card" data-brand={brand}>
  <h3>{String(props.v ?? "")}</h3>
  <GistChildren />
</article>
