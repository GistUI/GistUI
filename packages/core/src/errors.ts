export type ErrorCode =
  | "parse-failed"
  | "prose-ignored"
  | "unterminated-string"
  | "unknown-component"
  | "unknown-prop"
  | "missing-required"
  | "excess-args"
  | "invalid-prop"
  | "invalid-enum"
  | "invalid-child"
  | "unresolved-ref"
  | "unreachable"
  | "cycle"
  | "patch-target-missing"
  | "no-root"
  | "reserved-id"
  | "tool-not-found"
  | "bare-text"
  | "positional-optional"
  /** Sloppy but unambiguous syntax that was accepted as meant (a warning; nothing was dropped). */
  | "lenient-syntax"
  /** A size or work limit was reached (nesting depth, nodes, evaluation steps). */
  | "limit"
  /** A URL that loads by itself points to a host the URL policy does not allow; it was dropped. */
  | "blocked-url"
  /** The program names a major version of the format this processor does not know (`#gistui 2`). */
  | "unsupported-version";

export interface GistUIError {
  code: ErrorCode;
  severity: "error" | "warning";
  /** Statement the error belongs to, when there is one. */
  stmtId?: string;
  /** 1-based source line of the statement. */
  line?: number;
  message: string;
  hint?: string;
  /** Replacement statement text for deterministic repair, when one is known. */
  fix?: string;
  /** The component name or enum value the engine used instead (autofix applies the same). */
  use?: string;
  /** The engine already repaired this deterministically (lenient validity ignores it). */
  fixed?: boolean;
  /** The prop the error is about (schema name), when it is about one. */
  prop?: string;
  /** The argument it came from: a named key, or a positional index as a string. */
  arg?: string;
  /** The statement name a reference error is about. */
  ref?: string;
}

/** Errors that make a program invalid under the strict (OpenUI-compatible) definition. */
export const STRICT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "parse-failed",
  "unterminated-string",
  "unknown-component",
  "missing-required",
  "excess-args",
  "invalid-enum",
  "unresolved-ref",
  "cycle",
  "no-root",
  "patch-target-missing",
  "limit",
]);

/** Errors that make a program invalid (the benchmark's definition, warnings included). */
export const REPAIRABLE: ReadonlySet<string> = new Set([
  "parse-failed",
  "unterminated-string",
  "no-root",
  "unresolved-ref",
  "unreachable",
  "cycle",
  "unknown-component",
  "missing-required",
  "excess-args",
  "unknown-prop",
  "invalid-prop",
  "invalid-enum",
]);
