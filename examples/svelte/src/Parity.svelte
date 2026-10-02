<script lang="ts">
  import { GistUI } from "@gistui/svelte";
  import { onMount } from "svelte";
  import type { ToolProvider } from "@gistui/core";

  let { source, theme, tools, onready }: { source: string; theme: "light" | "dark"; tools: ToolProvider; onready: () => void } = $props();
  onMount(onready);
</script>

<GistUI {source} {theme} {tools} />
