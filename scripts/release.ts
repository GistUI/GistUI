/**
 * Release: packs every package, checks each tarball, and (with --publish) publishes them in dependency
 * order. Without --publish nothing leaves this machine.
 *
 *   bun scripts/release.ts             # pack + check (tarballs in tests/pack/.work/packs)
 *   bun scripts/release.ts --publish   # also `bun publish` each tarball (needs npm auth, a clean git tree)
 *
 * Checks per tarball:
 *   - its version is the release version, and so is every `@gistui/*` dependency (no `workspace:`; a
 *     stale lockfile rewrites `workspace:*` to an old version, so `bun install` runs first);
 *   - README.md and LICENSE are in it;
 *   - every file its `exports` point to is in it;
 *   - every relative import of every JS file in it (a lazy chunk, a shared chunk) is in it.
 *
 * Publishing also needs: a clean git tree before and after the build, an npm login, and a passing
 * install test of these very tarballs (tests/pack/smoke.ts). A version that is already on npm is
 * skipped, so a publish that stopped half way can be run again.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "tests/pack/.work/packs");
const publish = process.argv.includes("--publish");

// Dependencies first.
const ORDER = ["core", "catalog", "headless", "styles", "widgets", "vanilla", "react", "server", "chat", "vue", "svelte", "solid"];

/** Runs a program with its arguments as a list: no shell, so a path with spaces is one argument. */
const run = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32" }).toString();
const dirty = () => run("git", ["status", "--porcelain"]).trim() !== "";
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const pkgs = ORDER.map((dir) => ({ dir, json: JSON.parse(readFileSync(join(ROOT, "packages", dir, "package.json"), "utf8")) }));
const version = pkgs[0]!.json.version as string;
for (const p of pkgs) if (p.json.version !== version) fail(`${p.json.name} is ${p.json.version}, expected ${version} (all packages release together)`);
const missing = readdirSync(join(ROOT, "packages")).filter((d) => !ORDER.includes(d));
if (missing.length) fail(`not in the release order: ${missing.join(", ")}`);

if (publish) {
  if (dirty()) fail("the git tree has uncommitted changes; commit first");
  try {
    run("npm", ["whoami"]);
  } catch {
    fail("not logged in to npm: run `npm login` first");
  }
}

console.log(`Release ${version}: install, build, test`);
run("bun", ["install"]);
run("bunx", ["turbo", "run", "build", "typecheck", "--concurrency=4"]);
// Tests one package at a time: timing tests must not share the CPU with a parallel build.
run("bunx", ["turbo", "run", "test", "--concurrency=1"]);
// The build may have rewritten a tracked file (a generated one that was stale): that is not what was committed.
if (publish && dirty()) fail("the build changed tracked files; commit them and run again");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function targets(x: unknown): string[] {
  if (typeof x === "string") return [x];
  if (x && typeof x === "object") return Object.entries(x).flatMap(([cond, v]) => (cond === "gistui-source" ? [] : targets(v)));
  return [];
}

/** Relative imports (static, dynamic, re-exports) of one built JS file. */
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;

const tarballs: { name: string; tgz: string }[] = [];
const manifest: Record<string, string> = {};
for (const p of pkgs) {
  const cwd = join(ROOT, "packages", p.dir);
  const out = run("bun", ["pm", "pack", "--destination", OUT], cwd);
  const tgz = out.trim().split("\n").find((l) => l.trim().endsWith(".tgz"))?.trim();
  if (!tgz) fail(`${p.json.name}: no tarball`);
  const files = new Set(run("tar", ["-tzf", tgz!]).trim().split("\n").map((f) => f.replace(/^package\//, "")));
  const read = (file: string) => run("tar", ["-xzf", tgz!, "-O", `package/${file}`]);
  const packed = JSON.parse(read("package.json"));
  const problems: string[] = [];
  if (packed.version !== version) problems.push(`version ${packed.version}`);
  for (const [name, range] of Object.entries({ ...packed.dependencies, ...packed.peerDependencies } as Record<string, string>)) {
    if (range.startsWith("workspace:")) problems.push(`${name} is ${range}`);
    else if (name.startsWith("@gistui/") && range !== version) problems.push(`${name} is ${range}, not ${version} (stale lockfile?)`);
  }
  for (const f of ["README.md", "LICENSE"]) if (!files.has(f)) problems.push(`no ${f}`);
  for (const t of targets(packed.exports)) {
    const path = t.replace(/^\.\//, "");
    if (!path.includes("*") && !files.has(path)) problems.push(`exports ${t}, not in the tarball`);
  }
  // A chunk a file imports but the tarball lacks only fails later, in the user's browser.
  for (const f of files) {
    if (!/\.m?js$/.test(f)) continue;
    for (const m of read(f).matchAll(RELATIVE_IMPORT)) {
      const target = posix.normalize(posix.join(dirname(f), m[1]!));
      if (!files.has(target)) problems.push(`${f} imports ${m[1]}, not in the tarball`);
    }
  }
  if (problems.length) fail(`${p.json.name}: ${problems.join("; ")}`);
  console.log(`✓ ${p.json.name}@${version}  ${files.size} files`);
  tarballs.push({ name: p.json.name, tgz: tgz! });
  manifest[p.json.name] = createHash("sha256").update(readFileSync(tgz!)).digest("hex");
}
// What the install test checks against, so it never tests tarballs from an earlier run.
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ version, packedAt: Date.now(), tarballs: manifest }, null, 2));

if (!publish) {
  console.log(`\nPacked and checked. Tarballs: ${OUT}\nPublish with: bun scripts/release.ts --publish`);
  process.exit(0);
}
console.log("\nInstall test of the tarballs (tests/pack/smoke.ts)");
try {
  execFileSync("bun", [join(ROOT, "tests/pack/smoke.ts")], { cwd: ROOT, stdio: "inherit" });
} catch {
  fail("the install test failed; nothing was published");
}

const onNpm = (name: string): boolean => {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"]).trim() === version;
  } catch {
    return false; // not found
  }
};
for (const { name, tgz } of tarballs) {
  if (onNpm(name)) {
    console.log(`already on npm: ${name}@${version}`);
    continue;
  }
  console.log(`publishing ${name}@${version}`);
  execFileSync("bun", ["publish", tgz, "--access", "public"], { cwd: ROOT, stdio: "inherit" });
}
console.log(`\nPublished ${version}. Tag it: git tag v${version} && git push --tags`);
