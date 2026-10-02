import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Workspace packages export their TypeScript sources under the "gistui-source" condition (a name no other package uses).
  resolve: { conditions: ["gistui-source", ...defaultClientConditions] },
});
