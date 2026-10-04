/**
 * Streams each screen into each renderer in Chrome and records, per run (fresh page each time):
 *  - first content: first chunk → first text on screen
 *  - finish lag: last chunk → last change on screen
 *  - main-thread time (Chrome's own counters): all tasks, script, layout, style
 *  - long tasks (> 50 ms) and total blocking time; frames slower than 50 ms; worst frame
 *  - DOM update batches, React state updates delivered, JS heap at the end
 * Median of REPS runs per cell. Results: results/render.json and results/render.md.
 *
 *   node run.mjs            (server: bunx vite preview --port 5310)
 *   REPS=5 node run.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.URL ?? "http://localhost:5310/";
const REPS = Number(process.env.REPS ?? 3);
const IMG = readFileSync(new URL("../../../website/public/shots/l-japan.jpg", import.meta.url));
const ALL = ["simple-table", "chart-with-data", "contact-form", "settings-panel", "dashboard", "e-commerce-product", "pricing-page", "all-seven"];
const KEY = ["simple-table", "dashboard", "pricing-page", "all-seven"];
// realistic: 4 characters every 10 ms (about 100 tokens a second); fast: 4 characters every 1 ms (about 1,000).
const PLANS = [
  { mode: "realistic", chunk: 4, interval: 10, screens: KEY, cpus: [1, 4] },
  { mode: "fast", chunk: 4, interval: 1, screens: ALL, cpus: [1, 4] },
];
const LIBS = ["gistui", "openui"];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const metric = (ms, name) => ms.metrics.find((m) => m.name === name)?.value ?? 0;

const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
async function once(lib, screen, plan, cpu) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const failed = [];
  page.on("pageerror", (e) => failed.push("pageerror: " + e.message.slice(0, 120)));
  await page.route(/images\.unsplash\.com/, (r) => r.fulfill({ body: IMG, contentType: "image/jpeg" }));
  // Anything else outside this page (fonts, icons from a CDN) is refused for both, so the network is not measured.
  await page.route((u) => !u.href.startsWith(BASE) && !/images\.unsplash\.com/.test(u.href), (r) => r.abort());
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(`${BASE}?lib=${lib}&screen=${screen}`);
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(300);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const before = await cdp.send("Performance.getMetrics");
  await page.evaluate(([c, i]) => window.__run(c, i), [plan.chunk, plan.interval]);
  await page.waitForFunction(() => window.__bench.tEnd && performance.now() - window.__bench.lastMutation > 1000, null, { timeout: 600000, polling: 200 });
  const after = await cdp.send("Performance.getMetrics");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const b = await page.evaluate(() => {
    const B = window.__bench;
    const out = document.getElementById("out");
    const inRun = B.longTasks.filter((t) => t.start >= B.t0 && t.start <= B.lastMutation + 50);
    return {
      chars: B.chars,
      firstContent: B.firstContent - B.t0,
      streamTime: B.tEnd - B.t0,
      finishLag: Math.max(0, B.lastMutation - B.tEnd),
      longTasks: inRun.length,
      blocking: inRun.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
      worstFrame: Math.max(...B.frames.slice(1)),
      slowFrames: B.frames.slice(1).filter((f) => f > 50).length,
      domBatches: B.domBatches,
      updates: B.updates,
      heapMB: (performance.memory?.usedJSHeapSize ?? 0) / 1048576,
      text: out.innerText.length,
      errors: B.errors,
    };
  });
  const d = (n) => (metric(after, n) - metric(before, n)) * 1000;
  await ctx.close();
  return { ...b, mainThread: d("TaskDuration"), script: d("ScriptDuration"), layout: d("LayoutDuration"), style: d("RecalcStyleDuration"), failed };
}

const rows = [];
for (const plan of PLANS) for (const cpu of plan.cpus) for (const screen of plan.screens) for (const lib of LIBS) {
  const runs = [];
  for (let r = 0; r < REPS; r++) runs.push(await once(lib, screen, plan, cpu));
  const keys = ["firstContent", "streamTime", "finishLag", "mainThread", "script", "layout", "style", "longTasks", "blocking", "worstFrame", "slowFrames", "domBatches", "updates", "heapMB", "text"];
  const row = { mode: plan.mode, cpu, screen, lib, chars: runs[0].chars, reps: REPS };
  for (const k of keys) row[k] = median(runs.map((x) => x[k]));
  row.errors = [...new Set(runs.flatMap((x) => [...x.errors, ...x.failed]))].slice(0, 3);
  rows.push(row);
  console.log(`${plan.mode} cpu×${cpu} ${screen.padEnd(19)} ${lib.padEnd(6)} main ${row.mainThread.toFixed(0).padStart(6)} ms | script ${row.script.toFixed(0).padStart(5)} | blocking ${row.blocking.toFixed(0).padStart(5)} | long ${row.longTasks} | worst frame ${row.worstFrame.toFixed(0)} | first ${row.firstContent.toFixed(0)} | lag ${row.finishLag.toFixed(0)} | text ${row.text}${row.errors.length ? " | " + row.errors.join("; ") : ""}`);
}
await browser.close();
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(new URL("./results/render.json", import.meta.url), JSON.stringify({ date: new Date().toISOString(), reps: REPS, rows }, null, 2));
console.log("wrote results/render.json");
