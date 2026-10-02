/**
 * Installs the packed tarballs (from `bun scripts/release.ts`) into fresh apps, the way a user would:
 * npm, no workspace, no source condition. Then for React, Vue, Svelte, Solid and the DOM renderer:
 * a production Vite build, and a real browser check. Each app renders a program with mistakes, so
 * the check also proves autofix loads from the published packages (and is not in the main bundle).
 * Plus a Node check of `@gistui/catalog` (the prompt) and `@gistui/server` (validation, repair).
 *
 *   bun scripts/release.ts && bun tests/pack/smoke.ts
 *
 * Everything is written under tests/pack/.work (git-ignored).
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = join(import.meta.dir, "../..");
const PACKS = join(ROOT, "tests/pack/.work/packs");
const APPS = join(ROOT, "tests/pack/.work/apps");

/** On Windows the package runners are `.cmd` files, which need a shell. */
const WIN = process.platform === "win32";
/** Runs a program with its arguments as a list: no shell quoting, so a path with spaces is one argument. */
const sh = (cmd: string, args: string[], cwd: string = ROOT) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, shell: WIN }).toString();
const packedJson = (tgz: string) => JSON.parse(sh("tar", ["-xzf", tgz, "-O", "package/package.json"]));

if (!existsSync(join(PACKS, "manifest.json"))) throw new Error("No tarballs: run `bun scripts/release.ts` first.");
const manifest = JSON.parse(readFileSync(join(PACKS, "manifest.json"), "utf8")) as { version: string; packedAt: number; tarballs: Record<string, string> };

const tarball = new Map<string, string>();
for (const f of readdirSync(PACKS).filter((f) => f.endsWith(".tgz"))) tarball.set(packedJson(join(PACKS, f)).name as string, join(PACKS, f));

// The tarballs must be the ones the last `release.ts` run packed, from the sources as they are now.
{
  const stale: string[] = [];
  for (const [name, hash] of Object.entries(manifest.tarballs)) {
    const tgz = tarball.get(name);
    if (!tgz || createHash("sha256").update(readFileSync(tgz)).digest("hex") !== hash) stale.push(`${name}: its tarball is not the one that was packed`);
  }
  const newest = (dir: string): number => {
    let t = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const path = join(dir, e.name);
      t = Math.max(t, e.isDirectory() ? newest(path) : statSync(path).mtimeMs);
    }
    return t;
  };
  for (const dir of readdirSync(join(ROOT, "packages"))) {
    const pkg = join(ROOT, "packages", dir);
    if (!existsSync(join(pkg, "package.json"))) continue;
    for (const part of ["src", "package.json"]) {
      const path = join(pkg, part);
      if (!existsSync(path)) continue;
      const t = statSync(path).isDirectory() ? newest(path) : statSync(path).mtimeMs;
      if (t > manifest.packedAt) stale.push(`packages/${dir}/${part} changed after packing`);
    }
  }
  if (stale.length) throw new Error(`Stale tarballs: run \`bun scripts/release.ts\` again.\n${stale.join("\n")}`);
}

/** The @gistui packages a set of packages needs, transitively. */
function closure(names: string[]): string[] {
  const out = new Set<string>();
  const visit = (n: string) => {
    if (out.has(n)) return;
    out.add(n);
    const pkg = packedJson(tarball.get(n)!);
    for (const d of Object.keys({ ...pkg.dependencies })) if (d.startsWith("@gistui/")) visit(d);
  };
  names.forEach(visit);
  return [...out];
}

// Mistakes a model makes: an unknown prop, a misspelled component, a reference to nothing, and a
// statement it never placed. Autofix places the Callout; without it, the Callout would not show.
const PROGRAM = `root = Page(Card(Header("Hi"), colour:"red"), Txt("hello"), missing)\nnote = Callout("Placed by autofix")\n`;
const REPORT = `(window as any).__fixes = []; const report = (r: unknown) => (window as any).__fixes.push(r);`;

interface App {
  name: string;
  gistui: string[];
  deps: Record<string, string>;
  plugin?: { pkg: string; version: string; import: string; call: string };
  files: Record<string, string>;
  entry: string;
}

const APPS_DEF: App[] = [
  {
    name: "react",
    gistui: ["@gistui/react", "@gistui/styles"],
    deps: { react: "^19.3.0", "react-dom": "^19.3.0" },
    plugin: { pkg: "@vitejs/plugin-react", version: "^6.1.0", import: 'import react from "@vitejs/plugin-react";', call: "react()" },
    entry: "src/main.tsx",
    files: {
      "src/main.tsx": `import "@gistui/styles/styles.css";
import { createRoot } from "react-dom/client";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";
${REPORT}
createRoot(document.getElementById("app")!).render(<GistUI library={ui} source={${JSON.stringify(PROGRAM)}} onAutofix={report} />);
`,
    },
  },
  {
    name: "vue",
    gistui: ["@gistui/vue", "@gistui/styles"],
    deps: { vue: "^3.5.0" },
    plugin: { pkg: "@vitejs/plugin-vue", version: "^6.0.9", import: 'import vue from "@vitejs/plugin-vue";', call: "vue()" },
    entry: "src/main.ts",
    files: {
      "src/main.ts": `import "@gistui/styles/styles.css";
import { createApp, h } from "vue";
import { GistUI } from "@gistui/vue";
${REPORT}
createApp({ render: () => h(GistUI, { source: ${JSON.stringify(PROGRAM)}, onAutofix: report }) }).mount("#app");
`,
    },
  },
  {
    name: "svelte",
    gistui: ["@gistui/svelte", "@gistui/styles"],
    deps: { svelte: "^5.46.4" },
    plugin: { pkg: "@sveltejs/vite-plugin-svelte", version: "^7.3.1", import: 'import { svelte } from "@sveltejs/vite-plugin-svelte";', call: "svelte()" },
    entry: "src/main.ts",
    files: {
      "svelte.config.js": `import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";\nexport default { preprocess: vitePreprocess() };\n`,
      "src/App.svelte": `<script lang="ts">
  import { GistUI } from "@gistui/svelte";
  let { onautofix }: { onautofix: (r: unknown) => void } = $props();
</script>

<GistUI source={${JSON.stringify(PROGRAM)}} {onautofix} />
`,
      "src/main.ts": `import "@gistui/styles/styles.css";
import { mount } from "svelte";
import App from "./App.svelte";
${REPORT}
mount(App, { target: document.getElementById("app")!, props: { onautofix: report } });
`,
    },
  },
  {
    name: "solid",
    gistui: ["@gistui/solid", "@gistui/styles"],
    deps: { "solid-js": "^1.9.0" },
    plugin: { pkg: "vite-plugin-solid", version: "^2.11.14", import: 'import solid from "vite-plugin-solid";', call: "solid()" },
    entry: "src/main.tsx",
    files: {
      "src/main.tsx": `import "@gistui/styles/styles.css";
import { render } from "solid-js/web";
import { GistUI } from "@gistui/solid";
${REPORT}
render(() => <GistUI source={${JSON.stringify(PROGRAM)}} onAutofix={report} />, document.getElementById("app")!);
`,
    },
  },
  {
    name: "vanilla",
    gistui: ["@gistui/vanilla", "@gistui/styles"],
    deps: {},
    entry: "src/main.ts",
    files: {
      "src/main.ts": `import "@gistui/styles/styles.css";
import { mount } from "@gistui/vanilla";
import { ui } from "@gistui/vanilla/ui";
${REPORT}
mount(document.getElementById("app")!, { library: ui, source: ${JSON.stringify(PROGRAM)}, onAutofix: report });
`,
    },
  },
];

const results: string[] = [];
let failed = false;
const check = (ok: boolean, what: string) => {
  results.push(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed = true;
};

rmSync(APPS, { recursive: true, force: true });
const browser = await chromium.launch();
let port = 5310;

for (const app of APPS_DEF) {
  const dir = join(APPS, app.name);
  mkdirSync(join(dir, "src"), { recursive: true });
  const gistui = closure(app.gistui);
  const fileSpec = (n: string) => `file:${tarball.get(n)}`;
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `smoke-${app.name}`,
        private: true,
        type: "module",
        dependencies: { ...Object.fromEntries(gistui.map((n) => [n, fileSpec(n)])), ...app.deps },
        devDependencies: { vite: "^8.3.0", typescript: "^5.9.0", ...(app.plugin ? { [app.plugin.pkg]: app.plugin.version } : {}) },
        // Every @gistui package from its tarball, never from the registry.
        overrides: Object.fromEntries(gistui.map((n) => [n, fileSpec(n)])),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>${app.name}</title></head><body><div id="app"></div><script type="module" src="/${app.entry}"></script></body></html>`);
  writeFileSync(join(dir, "vite.config.ts"), `import { defineConfig } from "vite";\n${app.plugin?.import ?? ""}\nexport default defineConfig({ plugins: [${app.plugin?.call ?? ""}] });\n`);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: app.name === "solid" ? "preserve" : "react-jsx", ...(app.name === "solid" ? { jsxImportSource: "solid-js" } : {}), strict: true, skipLibCheck: true } }));
  for (const [f, content] of Object.entries(app.files)) writeFileSync(join(dir, f), content);

  try {
    sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], dir);
    sh("npx", ["vite", "build"], dir);
  } catch (e) {
    check(false, `${app.name}: install and build\n${(e as { stderr?: Buffer }).stderr?.toString().slice(0, 1500) ?? e}`);
    continue;
  }
  check(true, `${app.name}: installs from the tarballs and builds`);

  // The repair module must be a lazy chunk: not in the entry file, nor in anything the entry loads
  // up front (its static imports, and the files the page preloads).
  const assets = join(dir, "dist/assets");
  const html = readFileSync(join(dir, "dist/index.html"), "utf8");
  const entryFile = /src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  const marker = "it was defined but not used";
  const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
  const withRepair = js.filter((f) => readFileSync(join(assets, f), "utf8").includes(marker));
  const eager = new Set<string>();
  const load = (f: string) => {
    if (eager.has(f) || !js.includes(f)) return;
    eager.add(f);
    // Static imports only: `import … from "./x.js"` and `import "./x.js"`, not `import("./x.js")`.
    for (const m of readFileSync(join(assets, f), "utf8").matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) load(m[1]!);
  };
  if (entryFile) load(entryFile);
  for (const m of html.matchAll(/rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)) load(m[1]!);
  check(withRepair.length > 0 && !withRepair.some((f) => eager.has(f)), `${app.name}: autofix is its own chunk, loaded on demand (${withRepair.join(", ") || "missing"})`);

  const p = port++;
  const server = spawn("npx", ["vite", "preview", "--port", String(p), "--strictPort"], { cwd: dir, stdio: "ignore", shell: WIN });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (let i = 0; i < 50; i++) {
      try {
        await page.goto(`http://localhost:${p}/`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await page.waitForFunction(() => ((window as unknown as { __fixes?: unknown[] }).__fixes ?? []).length > 0, null, { timeout: 15_000 }).catch(() => {});
    const title = await page.locator(".gistui-card .gistui-header__title").textContent({ timeout: 5000 }).catch(() => null);
    const callout = await page.locator(".gistui-callout").textContent({ timeout: 5000 }).catch(() => null);
    check(title === "Hi", `${app.name}: renders in the browser`);
    check(Boolean(callout?.includes("Placed by autofix")), `${app.name}: autofix repaired the program in the browser`);
    check(errors.length === 0, `${app.name}: no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
    await page.close();
  } finally {
    server.kill();
  }
}
await browser.close();

// In Node: the prompt, validation and repair from the published packages; the chat store; and every
// JS entry point of every package can be imported without a browser (a server render imports them).
{
  const dir = join(APPS, "node");
  mkdirSync(dir, { recursive: true });
  // Svelte ships its sources (compiled by the app's bundler), so Node cannot import it.
  const names = [...tarball.keys()].filter((n) => n !== "@gistui/svelte" && n !== "@gistui/styles");
  const gistui = closure(names);
  const fileSpec = (n: string) => `file:${tarball.get(n)}`;
  const entries: string[] = [];
  for (const n of names) {
    const exp = packedJson(tarball.get(n)!).exports as Record<string, unknown>;
    for (const [sub, target] of Object.entries(exp)) {
      const file = typeof target === "string" ? target : ((target as { import?: string; default?: string }).import ?? (target as { default?: string }).default ?? "");
      if (/\.m?js$/.test(file)) entries.push(sub === "." ? n : `${n}/${sub.slice(2)}`);
    }
  }
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "smoke-node",
        private: true,
        type: "module",
        dependencies: { ...Object.fromEntries(gistui.map((n) => [n, fileSpec(n)])), react: "^19.3.0", "react-dom": "^19.3.0", vue: "^3.5.0", "solid-js": "^1.9.0" },
        overrides: Object.fromEntries(gistui.map((n) => [n, fileSpec(n)])),
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "check.mjs"),
    `import { prompt, library } from "@gistui/catalog";
import { repairProgram, validateProgram } from "@gistui/server";
import { createChat, splitReply } from "@gistui/chat";
const system = prompt().text;
// A blocking error for the server: an Input without its required label.
const broken = ${JSON.stringify(`root = Page(Input("email"))
`)};
const before = validateProgram(broken, library);
const after = await repairProgram(broken, library);
// The chat store with a stub adapter: one question, one streamed answer with a UI block.
const fence = String.fromCharCode(96).repeat(3);
const chat = createChat({ adapter: async function* () { yield "Here you go:\\n" + fence + "gistui\\nroot = Page(Text(1))\\n" + fence + "\\n"; } });
await chat.send("Show me something");
const reply = chat.getSnapshot().messages.at(-1);
const parts = splitReply(reply?.content ?? "");
const imports = {};
for (const entry of ${JSON.stringify(entries)}) {
  try {
    await import(entry);
    imports[entry] = true;
  } catch (e) {
    imports[entry] = String(e && e.message ? e.message : e).slice(0, 200);
  }
}
console.log(JSON.stringify({ promptChars: system.length, validBefore: before.valid, validAfter: after.valid, chatStatus: reply?.status, chatParts: parts.map((p) => p.kind), imports }));
`,
  );
  try {
    sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], dir);
    const r = JSON.parse(sh("node", ["check.mjs"], dir).trim().split("\n").pop()!);
    check(r.promptChars > 1000, `node: @gistui/catalog prompt() (${r.promptChars} characters)`);
    check(r.validBefore === false && r.validAfter === true, "node: @gistui/server validates and repairs");
    check(r.chatStatus === "done" && r.chatParts.join() === "text,ui", `node: @gistui/chat streams a reply and splits it (${r.chatStatus}; ${r.chatParts.join()})`);
    const bad = Object.entries(r.imports as Record<string, true | string>).filter(([, v]) => v !== true);
    check(bad.length === 0, `node: all ${entries.length} entry points import without a browser${bad.length ? `\n${bad.map(([k, v]) => `    ${k}: ${v}`).join("\n")}` : ""}`);
  } catch (e) {
    check(false, `node: ${(e as { stderr?: Buffer }).stderr?.toString().slice(0, 1500) ?? e}`);
  }
}

console.log(results.join("\n"));
process.exit(failed ? 1 : 0);
