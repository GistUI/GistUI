import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  // Served from the site root in development; set BASE_PATH (for example "/examples/") where it is deployed under a path.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  // Workspace packages export their TypeScript sources under the "gistui-source" condition (a name no other package uses).
  resolve: { conditions: ["gistui-source", ...defaultClientConditions] },
});
