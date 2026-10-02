import { defaultClientConditions, defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  // Inside this repo, workspace packages resolve to their TypeScript sources ("gistui-source").
  // An app using the published packages does not need this.
  resolve: { conditions: ["gistui-source", ...defaultClientConditions] },
});
