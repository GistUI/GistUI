/** Structural AST equality that ignores `partial` markers (they do not change what renders). */
export function sameAst(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameAst(a[i], b[i])) return false;
    return true;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k in ra) if (k !== "partial" && !sameAst(ra[k], rb[k])) return false;
  for (const k in rb) if (k !== "partial" && !(k in ra)) return false;
  return true;
}

/**
 * Object-literal keys a program may not write: they would be read as engine markers (`$ref`,
 * `$dyn`) or set a prototype.
 */
export const BLOCKED_KEYS: ReadonlySet<string> = new Set(["__proto__", "$ref", "$dyn"]);

/** An own property of a plain object, or undefined: never an inherited one (`constructor`, `toString`). */
export const own = (o: unknown, key: string): unknown => (o != null && typeof o === "object" && Object.hasOwn(o, key) ? (o as Record<string, unknown>)[key] : undefined);
