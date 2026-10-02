/**
 * Deterministic coercion of a prop value to its schema type, shared by the materializer (static
 * values) and the runtime (values an expression produced). An invalid value falls back to the prop's
 * default, or is dropped.
 */

import type { PropSpec } from "./schema";
import { editDistance } from "./schema";
import { isNodeRef } from "./store";
import { toNumber } from "./table";

export interface CoerceIssue {
  code: "invalid-prop" | "invalid-enum" | "blocked-url";
  severity: "error" | "warning";
  message: string;
  /** The enum value used instead of a close typo. */
  use?: string;
}

const isTable = (v: unknown): boolean => typeof v === "object" && v !== null && "columns" in v && "rows" in v;

const blocked = (label: string, url: string): CoerceIssue => ({ code: "blocked-url", severity: "warning", message: `${label}: "${url.slice(0, 80)}" is not on an allowed host` });

/**
 * `label` names the prop in messages (`Card.v`). `loads` is the URL policy for props that load by
 * themselves (`format: "url"`): a URL it refuses becomes "" (in a list, it is left out).
 */
export function coerceValue(v: unknown, spec: PropSpec, label: string, loads?: (url: string) => boolean): { value: unknown; issue?: CoerceIssue } {
  const bad = (code: CoerceIssue["code"], message: string, severity: CoerceIssue["severity"] = "warning") => ({ value: spec.default, issue: { code, severity, message } });
  // `null` means "not given", for every type: the prop takes its default, or is left out.
  if (v === null) return { value: spec.default };
  switch (spec.type) {
    case "string":
      if (typeof v === "string") return loads && spec.format === "url" && !loads(v) ? { value: "", issue: blocked(label, v) } : { value: v };
      if (typeof v === "number" || typeof v === "boolean") return { value: String(v) };
      return bad("invalid-prop", `${label} expects text`);
    case "number":
      if (typeof v === "number") return { value: v };
      if (typeof v === "string") {
        const n = toNumber(v);
        if (n !== null) return { value: n };
      }
      return bad("invalid-prop", `${label} expects a number`);
    case "boolean":
      if (typeof v === "boolean") return { value: v };
      if (v === "true" || v === "false") return { value: v === "true" };
      return bad("invalid-prop", `${label} expects true or false`);
    case "enum": {
      if (typeof v !== "string") return bad("invalid-enum", `${label} must be one of ${spec.values.join("|")}`, "error");
      if (spec.values.includes(v)) return { value: v };
      const aliases = spec.aliases;
      const alias = aliases ? (Object.hasOwn(aliases, v) ? aliases[v] : Object.hasOwn(aliases, v.toLowerCase()) ? aliases[v.toLowerCase()] : undefined) : undefined;
      if (alias) return { value: alias };
      const lower = spec.values.find((x) => x.toLowerCase() === v.toLowerCase());
      if (lower) return { value: lower };
      let best: string | undefined;
      let bestD = 3;
      for (const x of spec.values) {
        const d = editDistance(v.toLowerCase(), x.toLowerCase(), bestD);
        if (d < bestD) {
          bestD = d;
          best = x;
        }
      }
      // An open enum accepts other values as they are (after a close typo is corrected above).
      if (!best && spec.open) return { value: v };
      if (best) return { value: best, issue: { code: "invalid-enum", severity: "warning", message: `${label}: "${v}" is not a value; using "${best}"`, use: best } };
      return bad("invalid-enum", `${label}: "${v}" is not one of ${spec.values.join("|")}`, "error");
    }
    case "node":
      if (isNodeRef(v) || typeof v === "string") return { value: v };
      return bad("invalid-prop", `${label} expects a component`);
    case "nodes":
      if (Array.isArray(v)) return { value: v };
      if (isNodeRef(v)) return { value: [v] };
      return bad("invalid-prop", `${label} expects a list of components`);
    case "data":
      if (Array.isArray(v) || isTable(v)) return { value: v };
      return bad("invalid-prop", `${label} expects a table or a list`);
    case "array": {
      // One value where a list is expected is a list of that one value (`options:"a"`).
      if (!Array.isArray(v) && !isTable(v)) {
        if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return bad("invalid-prop", `${label} expects a list`);
        return { value: [v], issue: { code: "invalid-prop", severity: "warning", message: `${label} expects a list; the one value was read as a list of one`, use: "list" } };
      }
      const items = spec.items;
      if (!loads || !Array.isArray(v) || items?.type !== "string" || items.format !== "url") return { value: v };
      const kept = v.filter((x) => typeof x !== "string" || loads(x));
      if (kept.length === v.length) return { value: v };
      return { value: kept, issue: blocked(label, String(v.find((x) => typeof x === "string" && !loads(x)))) };
    }
    default:
      return { value: v };
  }
}
