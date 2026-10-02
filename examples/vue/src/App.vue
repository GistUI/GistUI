<script setup lang="ts">
import { GistUI, type GistUIAction } from "@gistui/vue";
import { onBeforeUnmount, ref } from "vue";
import MyCard from "./MyCard.vue";
import { samples } from "./samples";

const pick = ref<keyof typeof samples>("dashboard");
const source = ref(samples.dashboard);
const streaming = ref(false);
const ownCard = ref(false);
const actions = ref<GistUIAction[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;

// Replays the program in small chunks, the way a model streams it.
function stream() {
  clearInterval(timer);
  const full = samples[pick.value];
  let at = 0;
  source.value = "";
  streaming.value = true;
  timer = setInterval(() => {
    at = Math.min(full.length, at + 24);
    source.value = full.slice(0, at);
    if (at === full.length) {
      clearInterval(timer);
      streaming.value = false;
    }
  }, 16);
}
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <main class="demo">
    <header class="demo__bar">
      <strong>GistUI + Vue</strong>
      <select v-model="pick" @change="stream">
        <option value="dashboard">Dashboard</option>
        <option value="form">Form</option>
      </select>
      <button type="button" @click="stream">Stream again</button>
      <label><input v-model="ownCard" type="checkbox" /> Use my Card</label>
    </header>
    <GistUI :source="source" :streaming="streaming" :components="ownCard ? { Card: MyCard } : undefined" @action="(a) => actions.unshift(a)" />
    <pre v-if="actions.length" class="demo__log">{{ actions.map((a) => JSON.stringify(a)).join("\n") }}</pre>
  </main>
</template>

<style>
body { margin: 0; font-family: system-ui, sans-serif; }
.demo { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
.demo__bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.demo__log { font-size: 12px; background: #f4f4f5; padding: 12px; border-radius: 8px; overflow: auto; }
</style>
