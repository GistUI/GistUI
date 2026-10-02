/**
 * Tools a program may call, and the rule for calling them.
 *
 * A program is untrusted (a model wrote it, possibly steered by content it read), and `@query` runs
 * as soon as the UI renders, with no click. So the host gives two separate sets:
 *
 *   tools      read-only tools. `@query("name", args)` may call these by itself, and refresh them.
 *   mutations  tools that change something. Only `@mutation`, run from a user's action (`@run`).
 *
 * A tool is never reachable from the other side: `@query("delete_account")` finds nothing unless
 * the host put `delete_account` in `tools`.
 */

export type ToolFn = (args: any) => unknown;

/** A map of functions by tool name. */
export type ToolMap = Readonly<Record<string, ToolFn>>;

/** An MCP-style client. */
export interface ToolClient {
  callTool(name: string, args: unknown): Promise<unknown>;
  /**
   * The tool names a program may call through this client. Required for `tools` (a client given
   * as read-only tools exposes nothing without it, since a program would otherwise reach every tool
   * the server has); optional for `mutations`.
   */
  allow?: readonly string[];
}

export type ToolProvider = ToolMap | ToolClient;
/** A provider, or a function returning the current one (so a host can change tools without restarting). */
export type ToolSource = ToolProvider | (() => ToolProvider | undefined) | undefined;

export interface ToolCall {
  name: string;
  args: unknown;
  /** `query`: the UI called it by itself while rendering. `mutation`: a user's action ran it. */
  kind: "query" | "mutation";
  /** The node whose action ran a mutation, or the query's statement. */
  nodeId?: string | undefined;
}

const isClient = (p: ToolProvider): p is ToolClient => typeof (p as ToolClient).callTool === "function";

/** The function for `name` in a provider, or null when the program may not call it. */
export function resolveTool(source: ToolSource, name: string, kind: "query" | "mutation"): ((args: unknown) => unknown) | null {
  const provider = typeof source === "function" ? source() : source;
  if (!provider || !name) return null;
  if (isClient(provider)) {
    const allowed = provider.allow ? provider.allow.includes(name) : kind === "mutation";
    return allowed ? (args) => provider.callTool(name, args) : null;
  }
  // Own properties only: `constructor` or `toString` are not tools.
  const fn = Object.hasOwn(provider, name) ? (provider as ToolMap)[name] : undefined;
  return typeof fn === "function" ? fn : null;
}
