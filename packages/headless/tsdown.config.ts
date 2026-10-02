import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/engine.ts", "src/theme.ts", "src/design.ts", "src/form-schema.ts", "src/highlight.ts", "src/url.ts", "src/actions.ts", "src/host.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
