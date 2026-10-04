// Writes results/RESULTS.md from results/render.json and results/parse.json.
import { readFileSync, writeFileSync } from "node:fs";
const R = JSON.parse(readFileSync(new URL("./results/render.json", import.meta.url), "utf8"));
const P = JSON.parse(readFileSync(new URL("./results/parse.json", import.meta.url), "utf8"));
const f0 = (n) => Math.round(n).toLocaleString("en-US");
const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const x = (a, b) => (b > 0 ? `${(a / b).toFixed(1)}×` : "—");
const cell = (mode, cpu, screen, lib) => R.rows.find((r) => r.mode === mode && r.cpu === cpu && r.screen === screen && r.lib === lib);

let md = `# Rendering benchmark: GistUI vs OpenUI\n\nRun ${R.date.slice(0, 10)}. Chrome (Playwright), production builds, React ${"19"}, median of ${R.reps} runs, a fresh page for each run.\n\n`;
for (const mode of ["realistic", "fast"]) for (const cpu of [1, 4]) {
  const screens = [...new Set(R.rows.filter((r) => r.mode === mode && r.cpu === cpu).map((r) => r.screen))];
  if (!screens.length) continue;
  md += `## ${mode === "realistic" ? "Realistic stream (≈100 tokens/s)" : "Fast stream (≈1,000 tokens/s)"}, CPU ${cpu === 1 ? "unthrottled" : `slowed ${cpu}×`}\n\n`;
  md += `| Screen | Main thread, OpenUI | Main thread, GistUI | OpenUI / GistUI | Script, OpenUI | Script, GistUI | Blocking (>50 ms tasks), OpenUI / GistUI | Worst frame, OpenUI / GistUI | First content, OpenUI / GistUI | Done after last chunk, OpenUI / GistUI |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const s of screens) {
    const o = cell(mode, cpu, s, "openui"), g = cell(mode, cpu, s, "gistui");
    if (!o || !g) continue;
    md += `| ${s} | ${f0(o.mainThread)} ms | ${f0(g.mainThread)} ms | **${x(o.mainThread, g.mainThread)}** | ${f0(o.script)} | ${f0(g.script)} | ${f0(o.blocking)} / ${f0(g.blocking)} ms | ${f0(o.worstFrame)} / ${f0(g.worstFrame)} ms | ${f0(o.firstContent)} / ${f0(g.firstContent)} ms | ${f0(o.finishLag)} / ${f0(g.finishLag)} ms |\n`;
  }
  md += "\n";
}
md += `## Parsers alone, like for like\n\n${P.runtime}. Each parser produces an up-to-date result after every chunk. Median time to stream the whole screen.\n\n| Screen | Chars, OpenUI / GistUI | One shot | 4-char chunks | 10-char chunks | 40-char chunks |\n|---|---:|---:|---:|---:|---:|\n`;
for (const r of P.rows) {
  const c = (k) => `${f1(r[k].openui)} / ${f1(r[k].gistui)} ms (${x(r[k].openui, r[k].gistui)})`;
  md += `| ${r.screen} | ${f0(r.openuiChars)} / ${f0(r.gistuiChars)} | ${c("oneShot")} | ${c("stream4")} | ${c("stream10")} | ${c("stream40")} |\n`;
}
writeFileSync(new URL("./results/RESULTS.md", import.meta.url), md);
console.log(md);
