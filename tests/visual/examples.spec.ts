import { expect, test } from "@playwright/test";
import { EXAMPLES } from "../../apps/playground/src/examples";

// Examples whose content changes between runs (live tool data, remote video) are left out.
const SKIP = new Set(["live"]);

for (const ex of EXAMPLES) {
  if (SKIP.has(ex.id)) continue;
  test(ex.id, async ({ page }, info) => {
    const dark = info.project.name.includes("dark");
    await page.goto("/");
    await page.evaluate(
      ([id, mode]) => {
        localStorage.setItem("pg-example", id);
        localStorage.setItem("pg-mode", mode);
        localStorage.setItem("pg-color", "auto");
      },
      [ex.id, dark ? "dark" : "light"] as const,
    );
    await page.goto("/", { waitUntil: "networkidle" });
    // Lazy chunks, fonts and images settle.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.querySelector('.gistui[aria-busy="true"], .gistui [aria-busy="true"], .gistui-skeleton'), null, { timeout: 15_000 }).catch(() => {});
    // Lazy images below the fold would load only when scrolled to: load them all, then wait.
    await page.evaluate(() => document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((i) => (i.loading = "eager")));
    // decode() resolves once an image is loaded and ready to paint (fresh browsers fetch in parallel).
    const slow = await page.evaluate(() => Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 20_000))]));
    if (slow) console.warn(`${test.info().title}: images still loading after 20s`);
    await page.waitForTimeout(600);
    // The playground's sticky bar would cover the top of a tall capture.
    await page.addStyleTag({ content: ".pg-bar { display: none !important; }" });
    const preview = page.locator(".pg-preview").first();
    await expect(preview).toHaveScreenshot(`${info.project.name}/${ex.id}.png`, {
      // Third-party embeds render differently run to run.
      mask: [page.locator("iframe")],
    });
  });
}
