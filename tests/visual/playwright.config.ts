/**
 * Visual regression suite (plan §10): every playground example, desktop light and phone dark,
 * compared to committed baselines. Run: `bun run test:visual` (update: `bun run test:visual -- -u`).
 * It starts its own playground dev server on port 5199.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "examples.spec.ts",
  // Failure diffs and traces go to tests/visual/.output (git-ignored).
  outputDir: fileURLToPath(new URL("./.output/visual-results", import.meta.url)),
  // Text rendering differs per operating system, so each has its own baselines.
  snapshotPathTemplate: "{testDir}/baselines/{platform}/{arg}{ext}",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: { baseURL: "http://localhost:5199" },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
  webServer: {
    command: "npx vite --port 5199 --strictPort",
    cwd: "../../apps/playground",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
