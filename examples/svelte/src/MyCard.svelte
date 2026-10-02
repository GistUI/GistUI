<!--
  Your own Svelte component in place of GistUI's Card: it gets the resolved props, and
  <GistChildren /> places the card's content wherever you want it.
-->
<script lang="ts">
  import { GistChildren, type GistUIComponentProps } from "@gistui/svelte";
  let {}: GistUIComponentProps = $props();
</script>

<section class="my-card">
  <GistChildren />
</section>

<style>
  .my-card {
    padding: 20px;
    border-radius: 20px;
    border: 2px dashed #ff3e00;
    background: color-mix(in srgb, #ff3e00 6%, transparent);
  }
</style>
