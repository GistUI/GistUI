import type { CompiledComponent, PropType } from "./schema";

/** What a pipe table supplies to a component with `spec.table`: props, and its children when they are the table's columns. */
export function tableSupplies(c: CompiledComponent): { props: ReadonlySet<string>; children: boolean } | null {
  const t = c.spec.table;
  if (!t) return null;
  const props = new Set<string>();
  if (t.labels) props.add(t.labels);
  if (t.values) props.add(t.values);
  const of = typeof c.spec.children === "object" ? c.spec.children.of : undefined;
  return { props, children: Boolean(t.columns && of && of.length === 1 && of[0] === t.columns.component) };
}

/**
 * One-line signature, e.g. `Chart(data:data, type:bar|line|pie, x:str, y:str, zoom)`.
 * Positionals come first (bare = string), then `...children`, then named props; a bare trailing name
 * is a boolean flag.
 *
 * `tableForm`: a component that takes a pipe table (`spec.table`) is shown the way it should be
 * written, `PieChart(table, variant:pie|donut)`, without the props and children the table supplies.
 * (Shown with their types, `labels:list`, models copy the type into their answer.)
 */
export function signature(c: CompiledComponent, enumNames?: ReadonlyMap<string, string>, tableForm = false): string {
  const parts: string[] = [];
  const { spec } = c;
  const table = tableForm ? tableSupplies(c) : null;
  if (table) parts.push("table");
  c.positional.forEach((name, i) => {
    if (table?.props.has(name)) return;
    const t = typeLabel(spec.props[name]!, enumNames);
    const opt = i >= c.requiredPositional ? "?" : "";
    parts.push(t === "str" ? `${name}${opt}` : `${name}${opt}:${t}`);
  });
  if (c.hasChildren && !table?.children) {
    const of = typeof spec.children === "object" && spec.children.of ? spec.children.of.join("|") : "children";
    parts.push(`...${of}`);
  }
  const positional = new Set(c.positional);
  const flags: string[] = [];
  for (const [name, p] of Object.entries(spec.props)) {
    if (positional.has(name) || table?.props.has(name)) continue;
    if (p.type === "boolean") flags.push(name);
    else parts.push(`${name}:${typeLabel(p, enumNames)}`);
  }
  parts.push(...flags);
  return `${spec.name}(${parts.join(", ")})`;
}

/** The value list a prompt shows for an enum: all values, or examples and "…" for an open one. */
export function enumList(p: Extract<PropType, { type: "enum" }>): string {
  return p.open ? `${(p.examples ?? p.values.slice(0, 12)).join("|")}|…` : p.values.join("|");
}

/** `enumNames` maps a joined value list (`a|b|c`) to a type name declared once in the prompt. */
export function typeLabel(p: PropType, enumNames?: ReadonlyMap<string, string>): string {
  switch (p.type) {
    case "string":
      return "str";
    case "number":
      return "num";
    case "boolean":
      return "bool";
    case "enum": {
      const list = enumList(p);
      return enumNames?.get(list) ?? list;
    }
    case "node":
      return p.of ? p.of.join("|") : "Node";
    case "nodes":
      return `[${p.of ? p.of.join("|") : "Node"}]`;
    case "data":
      return "data";
    case "array":
      return p.items ? `[${typeLabel(p.items, enumNames)}]` : "[…]";
    case "object":
      return "{…}";
    case "action":
      return "[@step…]";
    case "state":
      return "$var";
    case "any":
      return "any";
  }
}
