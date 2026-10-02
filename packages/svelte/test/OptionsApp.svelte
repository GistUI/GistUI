<!-- <GistUI> with options a test changes after mount: `set` merges, a key set to undefined is removed. -->
<script lang="ts">
  import { GistUI } from "../src/index";
  import CountedCard from "./CountedCard.svelte";
  let { initial, own = false }: { initial: Record<string, unknown>; own?: boolean } = $props();
  let options = $state.raw(initial);
  export function set(next: Record<string, unknown>) {
    options = Object.fromEntries(Object.entries({ ...options, ...next }).filter(([, v]) => v !== undefined));
  }
</script>

{#if own}
  <GistUI {...options} components={{ Card: CountedCard }} />
{:else}
  <GistUI {...options} />
{/if}
