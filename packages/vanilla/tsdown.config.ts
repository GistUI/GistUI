import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/ui.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
