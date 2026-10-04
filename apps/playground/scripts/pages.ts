/**
 * After `vite build` under /examples/: one HTML page per example (dist/examples/<id>/index.html) with
 * its own title, description and share tags, a 404 page that still loads the app, and sitemap.xml.
 * Every page is the same app; it opens the example named in the address.
 *
 *   bun scripts/pages.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EXAMPLES } from "../src/examples";

const SITE = "https://gistui.com";
const BASE = "/examples/";
const OUT = new URL("../dist/examples/", import.meta.url).pathname;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shell = readFileSync(OUT + "index.html", "utf8");

/** The shell page with this address's title, description and share tags. */
function page(url: string, title: string, description: string): string {
  const set = (html: string, re: RegExp, value: string) => {
    if (!re.test(html)) throw new Error(`index.html has no match for ${re}`);
    return html.replace(re, value);
  };
  let html = shell;
  html = set(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n    <link rel="canonical" href="${url}" />`);
  html = set(html, /(<meta name="description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  html = set(html, /(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  return html;
}

const home = `${SITE}${BASE.replace(/\/$/, "")}`;
writeFileSync(OUT + "index.html", page(home, "GistUI examples: ask, and watch the interface stream in", "A chat that answers in real GistUI screens: dashboards, forms, reports and slide decks, streamed live."));

for (const e of EXAMPLES) {
  mkdirSync(OUT + e.id, { recursive: true });
  const description = `${e.description}. A GistUI example: the answer streams in as a real interface.`;
  writeFileSync(`${OUT}${e.id}/index.html`, page(`${SITE}${BASE}${e.id}`, `${e.title} · GistUI examples`, description));
}

// An address that is not an example: the app, which shows its start screen.
writeFileSync(OUT + "404.html", shell.replace("<title>", '<meta name="robots" content="noindex" />\n    <title>'));

const today = new Date().toISOString().slice(0, 10);
const urls = [home, ...EXAMPLES.map((e) => `${SITE}${BASE}${e.id}`)];
writeFileSync(
  OUT + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`,
);
console.log(`examples: ${EXAMPLES.length} pages, 404.html, sitemap.xml with ${urls.length} addresses`);
