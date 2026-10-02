/** Copies the stylesheet to dist/, plus a minified copy. No preprocessing: it is plain CSS. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dir;
const css = readFileSync(join(here, "src/styles.css"), "utf8");
const min = css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{};,>])\s*/g, "$1")
  .replace(/;}/g, "}")
  .trim();
mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist/styles.css"), css);
writeFileSync(join(here, "dist/styles.min.css"), min + "\n");
console.log(`styles.css ${css.length} B, min ${min.length} B, gzip ${Bun.gzipSync(min).length} B`);
