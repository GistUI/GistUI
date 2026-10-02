import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts", chart: "src/chart/index.ts", markdown: "src/markdown/index.ts", icons: "src/icons.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
