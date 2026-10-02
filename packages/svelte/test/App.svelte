<script lang="ts">
  import { setContext } from "svelte";
  import { GistUI } from "../src/index";
  import MyCard from "./MyCard.svelte";
  let { source, streaming = false, actions }: { source: string; streaming?: boolean; actions: unknown[] } = $props();
  setContext("brand", "acme");
</script>

<GistUI {source} {streaming} components={{ Card: MyCard }} onaction={(a) => actions.push(a)} />
