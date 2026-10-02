/**
 * Renderer parity: every playground example rendered by `@gistui/react`, then by `@gistui/vanilla` and
 * the Vue, Svelte and Solid bindings (each in its own example app, `examples/*`), screenshotted and
 * compared with React's pixel by pixel in the browser. Interactions run the same clicks in each.
 * Run: `bun run test:parity` (only some: `PARITY_RENDERERS=vue,solid bun run test:parity`).
 * Screenshots and a diff image per comparison go to `tests/visual/.output/parity` (git-ignored),
 * with a summary in `parity-summary.jsonl`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { EXAMPLES } from "../../apps/playground/src/examples";

// Live tool data changes between renders.
const SKIP = new Set(["live"]);
/** Share of pixels allowed to differ (anti-aliasing, sub-pixel text). */
const MAX_DIFF = 0.01;
// Screenshots, diffs and the summary stay in the repo, in a git-ignored folder.
const OUT = fileURLToPath(new URL("./.output/parity", import.meta.url));
mkdirSync(OUT, { recursive: true });

type Step = (page: Page) => Promise<unknown>;
type Renderer = "react" | "vanilla" | "vue" | "svelte" | "solid";

/** Where each renderer's parity page is served (see parity.config.ts). */
const SERVERS: Record<Renderer, string> = {
  react: "http://localhost:5199",
  vanilla: "http://localhost:5199",
  vue: "http://localhost:5201",
  svelte: "http://localhost:5202",
  solid: "http://localhost:5203",
};
const OTHERS = (process.env.PARITY_RENDERERS?.split(",") ?? ["vanilla", "vue", "svelte", "solid"]) as Exclude<Renderer, "react">[];

async function shoot(page: Page, ex: string, r: Renderer, theme: string, steps?: readonly Step[]): Promise<Buffer> {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  // Console errors are reported (not failed on): a renderer's warnings should be visible in the run.
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") console.log(`[${r}] ${ex}: ${m.text()}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  try {
    return await capture(page, ex, r, theme, errors, steps);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
}

async function capture(page: Page, ex: string, r: Renderer, theme: string, errors: string[], steps?: readonly Step[]): Promise<Buffer> {
  // No autoplay or count-up animations: every renderer honours reduced motion, so captures are stable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${SERVERS[r]}/parity.html?ex=${ex}&r=${r}&theme=${theme}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as unknown as { __parityReady?: boolean }).__parityReady === true);
  await page.evaluate(() => document.fonts.ready);
  // Lazy chunks, images and count-up animations settle.
  await page.waitForFunction(() => !document.querySelector('.gistui[aria-busy="true"], .gistui [aria-busy="true"], .gistui-skeleton'), null, { timeout: 15_000 }).catch(() => {});
  // Lazy images below the fold would load only when scrolled to: load them all, then wait.
  await page.evaluate(() => document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((i) => (i.loading = "eager")));
  // decode() resolves once an image is loaded and ready to paint (fresh browsers fetch in parallel).
  const slow = await page.evaluate(() => Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 20_000))]));
  if (slow) console.warn(`${test.info().title}: images still loading after 20s`);
  await page.waitForTimeout(1500);
  expect(errors, `${r} page errors`).toEqual([]);
  // Guard against comparing React with itself: the page says which renderer mounted, and React's
  // tree is recognisable (fibers on its elements).
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-renderer", r);
  await expect(stage).toHaveAttribute("data-mounted", "true");
  await expect(stage).toHaveAttribute("data-react-owned", r === "react" ? "true" : "false");
  if (process.env.PARITY_TRACE) console.log(`${new Date().toLocaleTimeString()} ${r} ${ex}: steps start`);
  if (!steps) return page.locator("#stage").screenshot({ animations: "disabled", caret: "hide", mask: [page.locator("iframe")] });
  for (const step of steps) {
    await step(page);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
  expect(errors, `${r} page errors after interacting`).toEqual([]);
  return page.screenshot({ animations: "disabled", caret: "hide", mask: [page.locator("iframe")] });
}

/** Compares two PNGs in the page; returns the share of differing pixels and a diff image. */
async function compare(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (b: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${b}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const px = (img: ImageBitmap) => {
        const c = new OffscreenCanvas(w, h);
        const x = c.getContext("2d")!;
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const pa = px(ia);
      const pb = px(ib);
      const out = new OffscreenCanvas(w, h);
      const ctx = out.getContext("2d")!;
      const diff = ctx.createImageData(w, h);
      let bad = 0;
      let firstY = -1;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i]! - pb[i]!), Math.abs(pa[i + 1]! - pb[i + 1]!), Math.abs(pa[i + 2]! - pb[i + 2]!), Math.abs(pa[i + 3]! - pb[i + 3]!));
        if (d > 48) {
          bad++;
          if (firstY < 0) firstY = Math.floor(i / 4 / w);
          diff.data.set([255, 0, 80, 255], i);
        } else {
          const g = (pa[i]! + pa[i + 1]! + pa[i + 2]!) / 3;
          diff.data.set([g, g, g, 60], i);
        }
      }
      ctx.putImageData(diff, 0, 0);
      const png = await out.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await png.arrayBuffer());
      let bin = "";
      for (const byte of bytes) bin += String.fromCharCode(byte);
      return { ratio: bad / (w * h), firstY, size: [ia.width, ia.height, ib.width, ib.height], diff: btoa(bin) };
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

/** Renders with React, then with each other renderer, and compares each with React's capture. */
async function parity(page: Page, project: string, name: string, ex: string, steps?: readonly Step[]) {
  const theme = project.includes("dark") ? "dark" : "light";
  const react = await shoot(page, ex, "react", theme, steps);
  const base = join(OUT, `${project}-${name}`);
  writeFileSync(`${base}-react.png`, react);
  for (const other of OTHERS) {
    const shot = await shoot(page, ex, other, theme, steps);
    const r = await compare(page, react, shot);
    writeFileSync(`${base}-${other}.png`, shot);
    writeFileSync(`${base}-${other}-diff.png`, Buffer.from(r.diff, "base64"));
    const row = { project, example: name, renderer: other, diff: Number((r.ratio * 100).toFixed(2)), firstDiffY: r.firstY, react: r.size.slice(0, 2), other: r.size.slice(2) };
    appendFileSync(join(OUT, "parity-summary.jsonl"), `${JSON.stringify(row)}\n`);
    expect.soft(row.other, `${other}: same size as React`).toEqual(row.react);
    expect.soft(r.ratio, `${other}: ${(r.ratio * 100).toFixed(2)}% of pixels differ; see ${base}-${other}-diff.png`).toBeLessThan(MAX_DIFF);
  }
}

/** The same clicks in every renderer; the viewport is compared afterwards. */
const click = (selector: string, nth = 0): Step => (page) => page.locator(selector).nth(nth).click();
const INTERACTIONS: { name: string; ex: string; steps: Step[] }[] = [
  { name: "deck-next", ex: "coffee", steps: [click('[aria-label="Next slide"]'), click('[aria-label="Next slide"]')] },
  { name: "viewer-page", ex: "japandeck", steps: [click('[aria-label="Next page"]'), click('[aria-label="Next page"]')] },
  { name: "report-zoom", ex: "report", steps: [click('[aria-label="Zoom in"]'), click('[aria-label="Zoom in"]')] },
  { name: "select-open", ex: "form", steps: [click('[data-scope="select"][data-part="trigger"]')] },
  { name: "form-errors", ex: "form", steps: [click('button:has-text("Request demo")')] },
  { name: "step-errors", ex: "signup", steps: [click('.gistui-form button[type="submit"]')] },
  { name: "datepicker-open", ex: "launch", steps: [click('[data-scope="date-picker"][data-part="trigger"]')] },
  { name: "range-open", ex: "launch", steps: [click('[data-scope="date-picker"][data-part="trigger"]', 1)] },
  { name: "timepicker-open", ex: "launch", steps: [click('[data-gistui="TimePicker"] [data-part="trigger"]')] },
  { name: "drawer-open", ex: "saas", steps: [click('button:has-text("Export")')] },
  { name: "combobox-open", ex: "settings", steps: [click('[role="tab"]:has-text("Workspace")'), click('[data-scope="combobox"][data-part="input"]')] },
  { name: "gallery-lightbox", ex: "japan", steps: [click(".gistui-gallery__item", 1)] },
];

for (const it of INTERACTIONS) {
  test(`interact: ${it.name}`, async ({ page }, info) => {
    await parity(page, info.project.name, `interact-${it.name}`, it.ex, it.steps);
  });
}

for (const ex of EXAMPLES) {
  if (SKIP.has(ex.id)) continue;
  test(ex.id, async ({ page }, info) => {
    await parity(page, info.project.name, ex.id, ex.id);
  });
}
