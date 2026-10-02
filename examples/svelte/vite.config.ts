import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  // Inside this repo, workspace packages resolve to their TypeScript sources ("gistui-source").
  // An app using the published packages does not need this.
  resolve: { conditions: ["gistui-source", ...defaultClientConditions] },
});
