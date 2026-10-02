/**
 * Language conformance suite: spec/conformance/*.gistui → *.expected.json, against the shared catalog
 * in spec/conformance/library.json. Every case must also stream to the same result in 1-char chunks.
 * Regenerate expectations with `GISTUI_UPDATE=1 bun test conformance` and review the diff.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createStream, parse, result } from "../src/stream";
import { lib } from "./fixtures/lib";
import { view } from "./helpers";

const dir = join(import.meta.dir, "../../../spec/conformance");
const update = process.env.GISTUI_UPDATE === "1";

function outcome(r: ReturnType<typeof parse>) {
  return {
    tree: view(r.root),
    errors: r.errors.map((e) => ({ code: e.code, severity: e.severity, ...(e.stmtId ? { stmt: e.stmtId } : {}), ...(e.line ? { line: e.line } : {}), ...(e.fixed ? { fixed: true } : {}) })),
    valid: r.valid,
  };
}

describe("conformance", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".gistui")).sort()) {
    test(file, () => {
      const src = readFileSync(join(dir, file), "utf8");
      const got = outcome(parse(src, lib));
      const expectedPath = join(dir, file.replace(/\.gistui$/, ".expected.json"));
      if (update || !existsSync(expectedPath)) writeFileSync(expectedPath, JSON.stringify(got, null, 2) + "\n");
      expect(got).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));

      const s = createStream(lib);
      for (const ch of src) {
        s.push(ch);
        s.flush();
      }
      s.end();
      expect(outcome(result(s))).toEqual(got);
    });
  }
});
