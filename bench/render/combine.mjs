// Builds screens/all-seven.{oui,gistui}: the seven sample screens in one answer, ids prefixed so they
// do not collide. Same content in both formats, about five times the size of the largest sample.
import { readFileSync, writeFileSync } from "node:fs";

const NAMES = ["simple-table", "chart-with-data", "contact-form", "dashboard", "e-commerce-product", "pricing-page", "settings-panel"];
const dir = new URL("./screens/", import.meta.url).pathname;

/** Prefixes every statement id of one program, leaving strings, keys and table rows alone. */
function prefix(src, p) {
  const ids = new Set([...src.matchAll(/^([a-z_]\w*)\s*=/gm)].map((m) => m[1]));
  let out = "";
  let i = 0;
  let lineStart = true;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { out += c; i++; lineStart = true; continue; }
    if (c === "|" ) { const j = src.indexOf("\n", i); const end = j < 0 ? src.length : j; out += src.slice(i, end); i = end; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1); i = j + 1; lineStart = false; continue;
    }
    if (/[A-Za-z_@$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w@$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const isKey = /^\s*:(?!:)/.test(src.slice(j, j + 3)) && !lineStart;
      out += ids.has(w) && !isKey ? `${p}${w}` : w;
      i = j; lineStart = false; continue;
    }
    if (c !== " ") lineStart = false;
    out += c; i++;
  }
  return out;
}

for (const ext of ["oui", "gistui"]) {
  const parts = NAMES.map((n, k) => prefix(readFileSync(dir + `${n}.${ext}`, "utf8").replace(/\n{2,}/g, "\n").trim(), `s${k + 1}_`));
  const roots = NAMES.map((_, k) => `s${k + 1}_root`);
  const root = ext === "oui" ? `root = Stack([${roots.join(", ")}], "column", "xl")` : `root = Stack(${roots.join(", ")}, gap:xl)`;
  writeFileSync(dir + `all-seven.${ext}`, [root, ...parts].join("\n") + "\n");
}
console.log("wrote all-seven.oui and all-seven.gistui");
