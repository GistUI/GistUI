/**
 * Scores a GistUI generation exactly like the benchmark scores the other formats: a run is complete
 * when it parses, renders a root, every reference resolves, every statement is reachable from root,
 * required and enum-typed props check out, it was not truncated, and it has at least as many
 * components as the brief has requirements. Error classes match protocols/openui/validator.ts.
 */

import { autofix, countComponents, parse, type GistUIError } from "@gistui/core";
import { benchLibrary } from "./catalog";

export type BenchError = { cls: string; detail: string };
export type Verdict = { renderable: boolean; complete: boolean; n: number; errs: BenchError[] };

const CLASS: Record<string, string> = {
  "parse-failed": "malformed-syntax",
  "unterminated-string": "malformed-syntax",
  "no-root": "root-missing",
  "unresolved-ref": "reference-graph",
  unreachable: "reference-graph",
  cycle: "reference-graph",
  "unknown-component": "hallucinated-component",
  "missing-required": "required-field",
  "excess-args": "signature-mismatch",
  "unknown-prop": "signature-mismatch",
  "invalid-prop": "signature-mismatch",
  "invalid-enum": "enum-mismatch",
};

// Not counted, for parity with the shared completeness layer (OpenUI's scorer does not check it
// either): a child of a type the slot does not list (`invalid-child`).

/**
 * Errors that fail a run. Not counted, as OpenUI's parser does not count them either: prose outside
 * statements, and a program without a `root` statement whose first component stands in as the root
 * (OpenUI takes the first statement as the root and passes it).
 */
const counts = (e: GistUIError) => e.code in CLASS && !(e.code === "no-root" && e.fixed);

function stripThink(t: string) {
  return t.includes("</think>") ? t.replace(/^[\s\S]*?<\/think>\s*/, "") : t;
}

export function evaluate(text: string, opts: { truncated?: boolean; reqs?: number } = {}): Verdict {
  const out: Verdict = { renderable: false, complete: false, n: 0, errs: [] };
  const r = parse(stripThink(text), benchLibrary());
  out.renderable = r.root !== null;
  for (const e of r.errors) if (counts(e)) out.errs.push({ cls: CLASS[e.code]!, detail: `${e.stmtId ?? ""}:${e.code}` });
  if (!r.root && !out.errs.some((e) => e.cls === "root-missing")) out.errs.push({ cls: "root-missing", detail: "no root element" });
  out.n = countComponents(r.root);
  if (opts.truncated) out.errs.push({ cls: "truncation", detail: "hit ceiling" });
  out.complete = out.errs.length === 0;
  if (out.complete && out.n < (opts.reqs ?? 0)) {
    out.errs.push({ cls: "coverage-floor", detail: `components ${out.n} < requirements ${opts.reqs}` });
    out.complete = false;
  }
  return out;
}

/**
 * The same verdict after deterministic repair (`autofix` in @gistui/core: code, no model call).
 * Reported next to the raw verdict, never in place of it.
 */
export function evaluateRepaired(text: string, opts: { truncated?: boolean; reqs?: number } = {}): Verdict & { changes: string[] } {
  const r = autofix(stripThink(text), benchLibrary());
  return { ...evaluate(r.source, opts), changes: r.changes };
}
