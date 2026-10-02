<script lang="ts">
  import { GistUI, type GistUIAction } from "@gistui/svelte";
  import { onDestroy } from "svelte";
  import MyCard from "./MyCard.svelte";
  import { samples } from "./samples";

  let pick: keyof typeof samples = $state("dashboard");
  let source = $state(samples.dashboard);
  let streaming = $state(false);
  let ownCard = $state(false);
  let actions: GistUIAction[] = $state([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  // Replays the program in small chunks, the way a model streams it.
  function stream() {
    clearInterval(timer);
    const full = samples[pick];
    let at = 0;
    source = "";
    streaming = true;
    timer = setInterval(() => {
      at = Math.min(full.length, at + 24);
      source = full.slice(0, at);
      if (at === full.length) {
        clearInterval(timer);
        streaming = false;
      }
    }, 16);
  }
  onDestroy(() => clearInterval(timer));
</script>

<main class="demo">
  <header class="demo__bar">
    <strong>GistUI + Svelte</strong>
    <select bind:value={pick} onchange={stream}>
      <option value="dashboard">Dashboard</option>
      <option value="form">Form</option>
    </select>
    <button type="button" onclick={stream}>Stream again</button>
    <label><input type="checkbox" bind:checked={ownCard} /> Use my Card</label>
  </header>
  <GistUI {source} {streaming} components={ownCard ? { Card: MyCard } : undefined} onaction={(a) => (actions = [a, ...actions])} />
  {#if actions.length}
    <pre class="demo__log">{actions.map((a) => JSON.stringify(a)).join("\n")}</pre>
  {/if}
</main>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .demo { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
  .demo__bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .demo__log { font-size: 12px; background: #f4f4f5; padding: 12px; border-radius: 8px; overflow: auto; }
</style>
