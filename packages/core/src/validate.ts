import type { GistUIError } from "./errors";
import type { Library } from "./schema";
import { isSnapshotNode, type SnapshotNode } from "./store";
import { parse } from "./stream";

export interface ValidationReport {
  valid: { strict: boolean; lenient: boolean };
  errors: GistUIError[];
  /** Components reachable from the root (text nodes included, placeholders and runtime nodes not). */
  components: number;
}

/** Validates a complete program. Used by the CLI, the server middleware and benchmark adapters. */
export function validate(source: string, lib: Library): ValidationReport {
  const r = parse(source, lib);
  return { valid: r.valid, errors: r.errors, components: countComponents(r.root) };
}

export function countComponents(root: SnapshotNode | null): number {
  if (!root) return 0;
  const seen = new Set<object>();
  let count = 0;
  // Iterative: a very deep tree must not overflow the stack. Only real snapshot nodes count; a data
  // object that happens to have `type` and `children` is data.
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v !== "object" || v === null || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) stack.push(...v);
    else if (isSnapshotNode(v)) {
      if (!v.type.startsWith("#")) count++;
      stack.push(...v.children, ...Object.values(v.props));
    }
  }
  return count;
}
