import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

// Served from the site root in development; set BASE_PATH (for example "/examples/") where it is deployed under a path.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  // Under a path, the files are built into a folder of that name, so a static host serves them at the same address.
  build: { outDir: `dist${base.replace(/\/$/, "")}`, emptyOutDir: true },
  plugins: [react()],
  // Workspace packages export their TypeScript sources under the "gistui-source" condition (a name no other package uses).
  resolve: { conditions: ["gistui-source", ...defaultClientConditions] },
});
