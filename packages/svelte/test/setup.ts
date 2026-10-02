import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";

GlobalRegistrator.register();

// Compiles .svelte components and .svelte.ts modules (runes) the way an app's build would.
plugin({
  name: "svelte",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const r = compile(await Bun.file(path).text(), { filename: path, generate: "client" });
      return { contents: r.js.code, loader: "js" };
    });
    build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
      const js = new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path).text());
      const r = compileModule(js, { filename: path, generate: "client" });
      return { contents: r.js.code, loader: "js" };
    });
  },
});
