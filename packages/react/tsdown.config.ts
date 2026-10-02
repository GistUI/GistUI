import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/ui.ts", "src/prompt.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime"],
});
