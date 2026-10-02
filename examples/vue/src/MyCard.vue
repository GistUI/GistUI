<!--
  Your own Vue component in place of GistUI's Card: it gets the resolved props, and
  <GistChildren /> places the card's content wherever you want it.
-->
<script setup lang="ts">
import { GistChildren, type GistUIComponentProps } from "@gistui/vue";
defineProps<GistUIComponentProps>();
</script>

<template>
  <section class="my-card">
    <GistChildren />
  </section>
</template>

<style scoped>
.my-card {
  padding: 20px;
  border-radius: 20px;
  border: 2px dashed #42b883;
  background: color-mix(in srgb, #42b883 6%, transparent);
}
</style>
