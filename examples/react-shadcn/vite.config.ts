import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // Inside this repo, workspace packages resolve to their TypeScript sources ("gistui-source").
    // An app using the published packages does not need this.
    conditions: ["gistui-source", ...defaultClientConditions],
  },
});
