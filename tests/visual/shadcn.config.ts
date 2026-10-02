/** GistUI with shadcn/ui components behaves like the built-ins; see shadcn.spec.ts. Run: `bun run test:shadcn`. */
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "shadcn.spec.ts",
  outputDir: fileURLToPath(new URL("./.output/shadcn-results", import.meta.url)),
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5204", ...devices["Desktop Chrome"], viewport: { width: 1000, height: 1100 } },
  webServer: {
    command: "npx vite --port 5204 --strictPort",
    cwd: "../../examples/react-shadcn",
    url: "http://localhost:5204/check.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
