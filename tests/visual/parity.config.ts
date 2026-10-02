/**
 * Renderer parity (React vs the DOM renderer, Vue, Svelte and Solid); see parity.spec.ts.
 * Run: `bun run test:parity`. Starts the playground and the three example apps.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import visual from "./playwright.config";

const app = (dir: string, port: number) => ({
  command: `npx vite --port ${port} --strictPort`,
  cwd: `../../${dir}`,
  url: `http://localhost:${port}/parity.html`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
});

export default defineConfig({
  ...visual,
  testMatch: "parity.spec.ts",
  outputDir: fileURLToPath(new URL("./.output/parity-results", import.meta.url)),
  // Five renders per test.
  timeout: 120_000,
  webServer: [app("apps/playground", 5199), app("examples/vue", 5201), app("examples/svelte", 5202), app("examples/solid", 5203)],
});
