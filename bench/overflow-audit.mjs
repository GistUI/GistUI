/**
 * Responsive audit: renders every playground example at phone and tablet widths and reports elements
 * that stick out of the preview (content inside an intentional horizontal scroller is allowed).
 *
 *   node bench/overflow-audit.mjs [url] → exits 1 when anything overflows.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5174/";
/** Extra CSS to inject (used to prove the audit catches a regression). */
const inject = process.env.AUDIT_INJECT_CSS ?? "";
// Viewport widths, plus the playground's Mobile and Tablet frames on a desktop viewport.
const runs = [
  { width: 360 },
  { width: 390 },
  { width: 768 },
  { width: 1440, device: "mobile" },
  { width: 1440, device: "tablet" },
];
const b = await chromium.launch();
let problems = 0;
for (const { width, device } of runs) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  await p.goto(url, { waitUntil: "networkidle" });
  if (inject) await p.addStyleTag({ content: inject });
  if (device) await p.click(`.pg-seg-sm button[title="${device}"]`);
  const items = await p.$$eval(".pg-item", (els) => els.map((e) => e.textContent.trim()));
  for (const name of items) {
    // On phones the example list lives in a drawer.
    if (await p.isVisible('[aria-label="Open examples"]')) {
      await p.click('[aria-label="Open examples"]');
      await p.waitForTimeout(350);
    }
    await p.click(`.pg-item:has-text("${name}")`);
    await p.waitForTimeout(1200);
    const found = await p.evaluate(() => {
      const root = document.querySelector(".pg-preview");
      const box = root.getBoundingClientRect();
      const scrolls = (el) => {
        for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
        }
        return false;
      };
      const out = [];
      for (const el of root.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.right <= box.right + 1 && r.left >= box.left - 1) continue;
        if (scrolls(el)) continue;
        // Report the outermost offender only.
        const parent = el.parentElement.getBoundingClientRect();
        if (el.parentElement !== root && (parent.right > box.right + 1 || parent.left < box.left - 1) && !scrolls(el.parentElement)) continue;
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}[${el.getAttribute("data-gistui") ?? ""}] right=${Math.round(r.right - box.right)}px`);
      }
      const page = root.scrollWidth > root.clientWidth + 1 ? [`preview scrolls sideways by ${root.scrollWidth - root.clientWidth}px`] : [];
      return [...page, ...out].slice(0, 6);
    });
    if (found.length) {
      problems += found.length;
      console.log(`✗ ${device ?? width + "px"} ${name}\n   ${found.join("\n   ")}`);
    }
  }
  await p.close();
}
console.log(problems ? `${problems} overflow problem(s)` : "✓ no overflow at 360, 390, 768px and in the mobile and tablet frames");
await b.close();
process.exit(problems ? 1 : 0);
