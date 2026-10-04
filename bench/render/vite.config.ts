import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

// GistUI from this repository's sources (as the playground uses them); OpenUI from npm. One copy of React for both.
const P = new URL("../../packages/", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["gistui-source", ...defaultClientConditions],
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^@gistui\/react$/, replacement: `${P}react/src/index.ts` },
      { find: /^@gistui\/react\/ui$/, replacement: `${P}react/src/ui.ts` },
      { find: /^@gistui\/styles\/styles\.css$/, replacement: `${P}styles/src/styles.css` },
    ],
  },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
