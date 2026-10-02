/**
 * Deterministic repair: turns a program with mistakes into a valid one, in code, with no model call.
 * The implementation is in `./repair` (loaded on demand by the renderers); this binds it to the parser.
 */

import { REPAIRABLE } from "./errors";
import { parseStatement } from "./parser";
import { createAutofix } from "./repair";
import { parse } from "./stream";

import type { AutofixResult } from "./repair";

export type { AutofixResult };
export { REPAIRABLE };

/**
 * Repairs `text` in rounds: each error is fixed at the statement it points to (see `./repair` for the
 * table of fixes). `inline`: chat text with fences. `shape: "original"` keeps inline components inside
 * their parents (for applying in place); the default is the canonical form.
 */
// A function, not a top-level call, so bundlers drop it (and the repair module) when it is unused.
export function autofix(...args: Parameters<ReturnType<typeof createAutofix>>): AutofixResult {
  return createAutofix({ parse, parseStatement, repairable: REPAIRABLE })(...args);
}
