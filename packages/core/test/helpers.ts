import type { SnapshotNode } from "../src/store";
import type { TableData } from "../src/ast";
import { printExpr } from "../src/printer";

/** A compact, JSON-stable view of a tree for assertions and conformance files. */
export function view(n: SnapshotNode | null): unknown {
  if (!n) return null;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.props)) props[k] = viewValue(v);
  const out: Record<string, unknown> = { type: n.type };
  if (Object.keys(props).length) out.props = props;
  if (n.dyn) out.dyn = Object.fromEntries(Object.entries(n.dyn).map(([k, e]) => [k, printExpr(e)]));
  if (n.children.length) out.children = n.children.map(view);
  return out;
}

function viewValue(v: unknown): unknown {
  if (v && typeof v === "object") {
    if ("columns" in v && "rows" in v) {
      const t = v as TableData;
      return { table: t.columns.map((c) => `${c.name}:${c.type === "number" ? "n" : "s"}`), rows: t.rows };
    }
    if ("type" in v && "children" in v && "props" in v) return view(v as SnapshotNode);
    if (Array.isArray(v)) return v.map(viewValue);
  }
  return v;
}

/** Deterministic chunk splitter for streaming tests. */
export function chunks(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
