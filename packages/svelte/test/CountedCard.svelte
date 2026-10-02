<!-- A Card that counts how often it is mounted (see `mounts` in counted.ts). -->
<script lang="ts">
  import { GistChildren } from "../src/index";
  import { counted } from "./counted";
  counted.mounts++;
</script>

<article class="my-card">
  <input />
  <GistChildren />
</article>
