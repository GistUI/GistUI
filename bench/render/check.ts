// Parses every screen with both parsers (GistUI's default catalog, OpenUI's openuiLibrary) and lists problems.
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "../../packages/core/src/index";
import { library } from "../../packages/catalog/src/index";
const names = readdirSync(new URL("./screens/", import.meta.url).pathname).filter((f) => f.endsWith(".gistui")).map((f) => f.replace(".gistui", ""));
const { createParser } = await import("./node_modules/@openuidev/lang-core/dist/index.mjs");
const { openuiLibrary } = await import("./node_modules/@openuidev/react-ui/dist/genui-lib/index.mjs").catch((e) => ({ openuiLibrary: null, e }));
for (const n of names) {
  const g = readFileSync(new URL(`./screens/${n}.gistui`, import.meta.url), "utf8");
  const o = readFileSync(new URL(`./screens/${n}.oui`, import.meta.url), "utf8");
  const r = parse(g, library);
  const errs = r.errors.map((e: any) => `${e.code}${e.stmtId ? "@" + e.stmtId : ""}: ${e.message}`);
  let oerr = "(no openui library in node)";
  if (openuiLibrary) {
    const p = createParser(openuiLibrary.toJSONSchema());
    const res = p.parse(o);
    oerr = JSON.stringify(res?.meta?.errors ?? res?.errors ?? []).slice(0, 300);
  }
  console.log(`${n.padEnd(20)} gistui ${g.length}c ${errs.length ? "ERR " + errs.join(" | ") : "ok"}  ||  openui ${o.length}c ${oerr}`);
}
