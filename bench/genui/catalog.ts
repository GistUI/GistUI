/**
 * The benchmark's 70-component catalog (catalog/public-catalog.json), as a GistUI library. Same
 * components, props, enums and descriptions as the OpenUI / A2UI / json-render catalogs; only the
 * calling convention is GistUI's:
 *
 * - Required props are positional, in catalog order; optional props are always named (`key:value`).
 * - A component's list of child components (`refs`) is its variadic children: `Card(a, b, c)`.
 *   When a component has a required single child (`ref`, e.g. FormControl's input) it stays positional.
 * - Enums are bare words (`variant:sunk`); optional booleans are flags (`wrap`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineLibrary, type ComponentSpec, type Library, type PropSpec, type TableMapping } from "@gistui/core";
import { GUB } from "./gub";

export type BenchProp = { t: string; req?: boolean; enum?: string[]; allowed?: string[] };
export type BenchCatalog = Record<string, { desc: string; props: [string, BenchProp][] }>;

export const benchCatalog: BenchCatalog = JSON.parse(readFileSync(join(GUB, "catalog/public-catalog.json"), "utf8"));

/**
 * Child types and groups are not in the JSON catalog; OpenUI's prompt shows them (from its Zod
 * catalog), so they are read from its generated signatures to give GistUI the same information.
 */
const { systemPrompt: openuiPrompt } = (await import(join(GUB, "protocols/openui/prompt.ts"))) as { systemPrompt: () => string };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** component → prop → allowed component names; component → group. */
function readOpenuiSignatures(): { allowed: Map<string, Map<string, string[]>>; groups: Map<string, string> } {
  const allowed = new Map<string, Map<string, string[]>>();
  const groups = new Map<string, string>();
  let group = "Components";
  for (const line of openuiPrompt().split("\n")) {
    const g = /^### (.+)$/.exec(line);
    if (g) group = g[1]!.trim();
    const m = /^([A-Z]\w*)\((.*)\)(?: — .*)?$/.exec(line);
    if (!m || !benchCatalog[m[1]!]) continue;
    groups.set(m[1]!, group);
    const props = new Map<string, string[]>();
    for (const param of splitTop(m[2]!)) {
      const pm = /^(\w+)\??:\s*(.+)$/.exec(param);
      if (!pm) continue;
      const names = pm[2]!.replace(/[()[\]]/g, " ").split("|").map((x) => x.trim());
      if (names.length && names.every((x) => /^[A-Z]\w*$/.test(x) && benchCatalog[x])) props.set(pm[1]!, names);
    }
    allowed.set(m[1]!, props);
  }
  return { allowed, groups };
}
const openui = readOpenuiSignatures();

/** The prop that becomes a component's variadic children: its first list of components. */
export function childrenProp(props: readonly [string, BenchProp][]): string | undefined {
  return props.find(([, p]) => p.t === "refs")?.[0];
}

/**
 * Positional props: the required ones, then (on components without children) the optional plain
 * text props, in catalog order — like GistUI's own `Header(title, subtitle?)`. A later optional
 * positional can only be given if the earlier ones are; enums, flags, numbers and lists are named.
 */
export const OPTIONAL_TEXT_POSITIONALS = process.env.GISTUI_BENCH_NAMED_ONLY !== "1";

/**
 * Pipe tables for the column-oriented components: `Table(rows)` → one Col per column;
 * `BarChart(sales)` → labels from the first column, one Series per other column;
 * `PieChart(mix)` → labels and values. The rendered tree is the one the parts would give.
 */
const SERIES: TableMapping = { labels: "labels", columns: { component: "Series", label: "category", values: "values", numeric: true } };
const TABLES: Record<string, TableMapping> = {
  Table: { columns: { component: "Col", label: "label", values: "data", type: "type" } },
  BarChart: SERIES,
  LineChart: SERIES,
  AreaChart: SERIES,
  HorizontalBarChart: SERIES,
  RadarChart: SERIES,
  PieChart: { labels: "labels", values: "values" },
  RadialChart: { labels: "labels", values: "values" },
  SingleStackedBarChart: { labels: "labels", values: "values" },
};

function propOf(p: BenchProp): PropSpec {
  const required = p.req === true || undefined;
  if (p.enum) return { type: "enum", values: p.enum, required };
  switch (p.t) {
    case "string":
      return { type: "string", required };
    case "number":
      return { type: "number", required };
    case "boolean":
      return { type: "boolean", required };
    case "ref":
      return { type: "node", of: p.allowed, required };
    case "refs":
      return { type: "nodes", of: p.allowed, required };
    default:
      return { type: "array", required };
  }
}

/**
 * A catalog in the bench's JSON shape, turned into GistUI signatures and a GistUI library.
 * `allowed` gives each slot's child types; lists of child types used by more than one slot get a
 * name, declared once in the prompt, and a list that contains a named one is written as that name
 * plus the rest (`DialogContent = Content|Heading|…`).
 */
export class Kit {
  readonly unions: Record<string, string[]> = {};
  private lib: Library | undefined;

  constructor(
    readonly catalog: BenchCatalog,
    private readonly allowed: ReadonlyMap<string, ReadonlyMap<string, string[]>>,
    private readonly groups: ReadonlyMap<string, string> = new Map(),
    unionNames: Record<string, string> = {},
  ) {
    const lists = new Map<string, { names: string[]; uses: number; first: string }>();
    for (const [comp, props] of allowed) {
      for (const [prop, names] of props) {
        if (names.length < 2) continue;
        const key = names.join("|");
        const l = lists.get(key);
        if (l) l.uses++;
        else lists.set(key, { names, uses: 1, first: `${comp}.${prop}` });
      }
    }
    // Smallest first, so larger lists can be written in terms of smaller ones.
    for (const l of [...lists.values()].filter((l) => l.uses >= 2).sort((a, b) => a.names.length - b.names.length)) {
      const [comp, prop] = l.first.split(".") as [string, string];
      this.unions[unionNames[l.first] ?? `${comp}${prop[0]!.toUpperCase()}${prop.slice(1)}`] = this.compress(l.names);
    }
  }

  positionalsOf(name: string): { prop: string; optional: boolean }[] {
    const c = this.catalog[name];
    if (!c) return [];
    const kids = childrenProp(c.props);
    const req = c.props.filter(([k, p]) => k !== kids && p.req).map(([k]) => ({ prop: k, optional: false }));
    if (kids || !OPTIONAL_TEXT_POSITIONALS) return req;
    const opt = c.props.filter(([k, p]) => k !== kids && !p.req && p.t === "string" && !p.enum).map(([k]) => ({ prop: k, optional: true }));
    return [...req, ...opt];
  }

  /** Replaces the largest named union contained in `names` by its name, repeatedly. */
  private compress(names: string[]): string[] {
    let rest = [...names];
    const out: string[] = [];
    for (const [u, members] of Object.entries(this.unions).sort((a, b) => this.expand(b[1]).length - this.expand(a[1]).length)) {
      const flat = this.expand(members);
      if (flat.length < rest.length && flat.every((m) => rest.includes(m))) {
        out.push(u);
        rest = rest.filter((m) => !flat.includes(m));
      }
    }
    return [...out, ...rest];
  }
  private expand(members: readonly string[]): string[] {
    return members.flatMap((m) => (this.unions[m] ? this.expand(this.unions[m]) : [m]));
  }
  private typeRef(names: string[] | undefined): string[] | undefined {
    if (!names || names.length < 2) return names;
    const key = names.join("|");
    const named = Object.entries(this.unions).find(([, v]) => this.expand(v).join("|") === key)?.[0];
    return named ? [named] : this.compress(names);
  }

  specs(): ComponentSpec[] {
    return Object.entries(this.catalog).map(([name, c]) => {
      const kids = childrenProp(c.props);
      const props: Record<string, PropSpec> = {};
      for (const [prop, p] of c.props) {
        if (prop === kids) continue;
        props[prop] = propOf(p);
      }
      const args = this.positionalsOf(name).map((a) => (a.optional ? `${a.prop}?` : a.prop));
      const typed = this.allowed.get(name);
      for (const [prop, p] of Object.entries(props)) {
        if (p.type === "node" || p.type === "nodes") props[prop] = { ...p, of: this.typeRef(typed?.get(prop)) };
      }
      const allowed = kids ? this.typeRef(typed?.get(kids)) : undefined;
      const table = TABLES[name] && this.fits(name, TABLES[name]) ? TABLES[name] : undefined;
      return {
        name,
        group: this.groups.get(name) ?? "Components",
        // A component written from a pipe table: the catalog's hint about arrays (OpenUI's data form) is left out.
        description: table ? c.desc.replace(/; use plucked arrays: .*$/, "").replace(/ — column-oriented\. Each Col holds its own data array\.$/, "") : c.desc,
        args,
        props,
        ...(kids ? { children: allowed?.length ? { of: allowed } : true } : {}),
        ...(table ? { table } : {}),
      };
    });
  }

  /** A table mapping applies only when the catalog has the props it fills. */
  private fits(name: string, m: TableMapping): boolean {
    const has = (comp: string, prop: string) => this.catalog[comp]?.props.some(([k]) => k === prop) ?? false;
    if (m.labels && !has(name, m.labels)) return false;
    if (m.values && !has(name, m.values)) return false;
    return !m.columns || (has(m.columns.component, m.columns.label) && has(m.columns.component, m.columns.values));
  }

  library(): Library {
    // A string child is a TextContent (Markdown), like GistUI's own Text.
    return (this.lib ??= defineLibrary({ components: this.specs(), unions: this.unions, textComponent: "TextContent", textProp: "text" }));
  }
}

/** A catalog from a JSON Schema whose `$defs` are the components (OpenUI's `toJSONSchema()`). */
export function kitFromJSONSchema(schema: { $defs: Record<string, { description?: string; properties?: Record<string, any>; required?: string[] }> }): Kit {
  const catalog: BenchCatalog = {};
  const allowed = new Map<string, Map<string, string[]>>();
  const refName = (r: string) => r.replace(/^#\/\$defs\//, "");
  for (const [name, def] of Object.entries(schema.$defs)) {
    const props: [string, BenchProp][] = [];
    const slots = new Map<string, string[]>();
    for (const [prop, ps] of Object.entries(def.properties ?? {})) {
      const req = def.required?.includes(prop) || undefined;
      const refs = (x: any): string[] | null =>
        x?.$ref ? [refName(x.$ref)] : Array.isArray(x?.anyOf) && x.anyOf.every((a: any) => a.$ref) ? x.anyOf.map((a: any) => refName(a.$ref)) : null;
      let bp: BenchProp;
      if (ps.type === "array" && refs(ps.items)) {
        bp = { t: "refs", req };
        slots.set(prop, refs(ps.items)!);
      } else if (refs(ps)) {
        bp = { t: "ref", req };
        slots.set(prop, refs(ps)!);
      } else if (Array.isArray(ps.enum)) bp = { t: "string", req, enum: ps.enum.map(String) };
      else if (ps.type === "string" || ps.type === "number" || ps.type === "boolean") bp = { t: ps.type, req };
      else bp = { t: "array", req };
      props.push([prop, bp]);
    }
    catalog[name] = { desc: def.description ?? "", props };
    allowed.set(name, slots);
  }
  return new Kit(catalog, allowed);
}

/** The benchmark's own catalog. */
export const benchKit = new Kit(benchCatalog, openui.allowed, openui.groups, {
  "Card.children": "Block",
  "TabItem.content": "Content",
  "DialogBlock.content": "DialogContent",
});
export const positionalsOf = (name: string) => benchKit.positionalsOf(name);
export const benchSpecs = () => benchKit.specs();
export const benchLibrary = () => benchKit.library();
