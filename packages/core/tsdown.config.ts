import { defineConfig } from "tsdown";

export default defineConfig({
  // `repair` (autofix) is its own entry so renderers can load it on demand, only when a program has errors.
  entry: ["src/index.ts", "src/repair.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
