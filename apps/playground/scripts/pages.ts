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
function page(url: string, title: string, description: string, crumb?: string): string {
  const set = (html: string, re: RegExp, value: string) => {
    if (!re.test(html)) throw new Error(`index.html has no match for ${re}`);
    return html.replace(re, value);
  };
  let html = shell;
  // Where the page sits in the site, for search engines: GistUI › Examples › this example.
  const crumbs = [["GistUI", `${SITE}/`], ["Examples", `${SITE}${BASE.replace(/\/$/, "")}`], ...(crumb ? [[crumb, url]] : [])];
  const data = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  }).replace(/</g, "\\u003c");
  html = set(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n    <link rel="canonical" href="${url}" />\n    <script type="application/ld+json">${data}</script>`);
  html = set(html, /(<meta name="description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  html = set(html, /(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  return html;
}

const home = `${SITE}${BASE.replace(/\/$/, "")}`;
writeFileSync(OUT + "index.html", page(home, "Examples: generative UI dashboards, forms and reports | GistUI", "Live generative UI examples: ask, and GistUI streams in real dashboards, forms, reports and slide decks. Open-source, for React, Vue, Svelte and Solid."));

for (const e of EXAMPLES) {
  mkdirSync(OUT + e.id, { recursive: true });
  const description = `${e.description}. A generative UI example, streamed in live by GistUI.`;
  writeFileSync(`${OUT}${e.id}/index.html`, page(`${SITE}${BASE}${e.id}`, `${e.title} example | GistUI`, description, e.title));
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
