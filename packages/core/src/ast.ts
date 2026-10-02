/** GistUI Lang AST. Produced by the parser, one statement at a time; frozen once a statement completes. */

export type Expr =
  | StrExpr
  | NumExpr
  | BoolExpr
  | NullExpr
  | RefExpr
  | StateExpr
  | EnumExpr
  | FlagExpr
  | CompExpr
  | BuiltinExpr
  | ArrExpr
  | ObjExpr
  | BinExpr
  | UnExpr
  | CondExpr
  | MemberExpr
  | IndexExpr
  | LambdaExpr;

/** `partial` marks a string whose closing quote has not arrived yet (tail parse only). */
export interface StrExpr { k: "str"; v: string; partial?: true }
export interface NumExpr { k: "num"; v: number }
export interface BoolExpr { k: "bool"; v: boolean }
export interface NullExpr { k: "null" }
/** A lowercase identifier: a statement reference or a lambda parameter. */
export interface RefExpr { k: "ref"; name: string }
export interface StateExpr { k: "state"; name: string }
/** A bare word resolved as an enum literal (`key:WORD` where the prop is an enum). */
export interface EnumExpr { k: "enum"; v: string }
/** A bare word resolved as a boolean flag of the enclosing component. */
export interface FlagExpr { k: "flag"; name: string }
export interface CompExpr { k: "comp"; name: string; args: Arg[]; partial?: true }
export interface BuiltinExpr { k: "builtin"; name: string; args: Arg[]; partial?: true }
export interface ArrExpr { k: "arr"; items: Expr[] }
export interface ObjExpr { k: "obj"; entries: [string, Expr][] }
export interface BinExpr { k: "bin"; op: BinOp; l: Expr; r: Expr }
export interface UnExpr { k: "un"; op: "!" | "-"; e: Expr }
export interface CondExpr { k: "cond"; c: Expr; t: Expr; f: Expr }
export interface MemberExpr { k: "member"; o: Expr; name: string }
export interface IndexExpr { k: "index"; o: Expr; i: Expr }
export interface LambdaExpr { k: "lambda"; params: string[]; body: Expr }

export type BinOp = "||" | "&&" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "+" | "-" | "*" | "/" | "%";

export interface Arg {
  /** Set for named args (`key:value` or `key=value`). */
  name?: string;
  value: Expr;
}

/** Parsed pipe-row table. `rows` holds typed values; `text` keeps the raw cells for display. */
export interface TableData {
  columns: TableColumn[];
  rows: Cell[][];
  text: string[][];
}
export interface TableColumn { name: string; type: "number" | "string"; /** Type set by a `:n` / `:s` header hint. */ hinted?: boolean }
export type Cell = string | number | null;

export type Stmt =
  | { kind: "assign"; id: string; value: Expr }
  | { kind: "table"; id: string; table: TableData }
  | { kind: "state"; id: string; value: Expr }
  | { kind: "patch"; id: string; prop: string; value: Expr }
  | { kind: "append"; id: string; value: Expr };
