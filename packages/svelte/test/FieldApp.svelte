<script lang="ts">
  import { GistUI } from "../src/index";
  import MyInput from "./MyInput.svelte";
  let { source, actions }: { source: string; actions: unknown[] } = $props();
</script>

<GistUI {source} components={{ Input: MyInput }} onaction={(a) => actions.push(a)} />
