/**
 * Edit mode. The model receives the canonical printout of the current program (every inline component
 * hoisted to an `_cN` id) and answers with changes only:
 *   k3 = Stat("MRR", "$415k")   replace a statement
 *   k3.value = "$415k"          patch one prop (by schema name, even if it was passed positionally)
 *   kpis += k5                  append a child
 *   k2 = null                   delete; statements left unreachable are dropped
 */

import type { GistUIError } from "./errors";
import { printProgram } from "./printer";
import type { Library } from "./schema";
import { GistUIStream } from "./stream";

/** The printout to put in the model's context for an edit turn. */
export function toEditSource(source: string, lib: Library): string {
  const s = new GistUIStream(lib);
  s.push(source);
  s.end();
  return printProgram(s.program, lib, { hoist: true });
}

export interface MergeResult {
  /** The merged program, canonical and garbage-collected. */
  source: string;
  errors: GistUIError[];
}

/** Applies an edit to a program and returns the merged canonical program. */
export function merge(base: string, edit: string, lib: Library): MergeResult {
  const s = createEditStream(base, lib);
  s.push(edit);
  s.end();
  return { source: printProgram(s.program, lib, { hoist: true, gc: true }), errors: s.errors() };
}

/** A stream seeded with `base`, so an edit renders live as it streams in. */
export function createEditStream(base: string, lib: Library): GistUIStream {
  const s = new GistUIStream(lib);
  s.push(base.endsWith("\n") ? base : base + "\n");
  s.flush();
  return s;
}
