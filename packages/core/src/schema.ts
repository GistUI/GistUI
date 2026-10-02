/**
 * Component schemas as the core engine sees them. Parsing is schema-directed (enums and flags are
 * resolved from the enclosing component), so the core needs an inspectable description of every
 * component. Framework packages build these from Zod / Standard JSON Schema via `propsFromJSONSchema`.
 */

export type PropType =
  /**
   * `format: "url"`: a URL that loads by itself (an image, a video, a background), so it is checked
   * against the host's URL policy (see url-policy.ts). A link the person clicks does not need it.
   */
  | { type: "string"; format?: "url" }
  | { type: "number" }
  | { type: "boolean" }
  | {
      type: "enum";
      values: readonly string[];
      aliases?: Readonly<Record<string, string>>;
      /**
       * Open enum: `values` are the known ones, but any value is accepted (e.g. icon names). The
       * prompt shows `examples` (default: the first 12 values) and "…" instead of the whole list.
       */
      open?: boolean;
      examples?: readonly string[];
    }
  /** One component. `of` limits it to component names or union names. */
  | { type: "node"; of?: readonly string[] }
  /** A list of components. */
  | { type: "nodes"; of?: readonly string[] }
  /** A pipe table, or an array of objects (e.g. a query result). */
  | { type: "data" }
  | { type: "array"; items?: PropType }
  | { type: "object" }
  /** An action list (`do:[...]`). */
  | { type: "action" }
  /** A two-way binding target (`bind:$var`). */
  | { type: "state" }
  | { type: "any" };

export type PropSpec = PropType & {
  required?: boolean;
  default?: unknown;
  description?: string;
};

export interface ComponentSpec {
  name: string;
  description?: string;
  /**
   * Positional props in order. They are required, except that a component without children may end
   * with optional positionals, marked `"name?"` (nothing can shift, since no children follow them).
   */
  args?: readonly string[];
  /** Variadic children after the positionals. `of` limits them to component or union names. */
  children?: boolean | { of?: readonly string[] };
  props: Readonly<Record<string, PropSpec>>;
  /** Prompt grouping, e.g. "Layout", "Data", "Forms". */
  group?: string;
  /** Alternative prop names accepted on input, mapped to the schema name. */
  aliases?: Readonly<Record<string, string>>;
  /**
   * How a pipe table passed to this component becomes its props and children, for components whose
   * data is split into parts (`Table(Col…)`, `BarChart(labels, Series…)`): `Table(rows)` with
   * `rows = |Name|Role\n|Ada|CTO` renders exactly like the parts written out.
   */
  table?: TableMapping;
}

export interface TableMapping {
  /** Prop that receives the first column as text (category labels). */
  labels?: string;
  /** Prop that receives the second column as numbers (one-series charts). */
  values?: string;
  /** One child per column (the columns after `labels`, when it is set). */
  columns?: {
    component: string;
    /** Prop that receives the column header. */
    label: string;
    /** Prop that receives the column's cells. */
    values: string;
    /** Cells as numbers (chart series) rather than their text. */
    numeric?: boolean;
    /** Prop that receives "number" or "string" when the header has a `:n` / `:s` hint. */
    type?: string;
  };
}

export interface LibraryInput {
  components: readonly ComponentSpec[];
  /** Named component unions, written once in the prompt (e.g. `Block = Text|Card|Table`). */
  unions?: Readonly<Record<string, readonly string[]>>;
  /** Component used for strings in children position. Defaults to "Text". */
  textComponent?: string;
  /** Prop of the text component that receives the Markdown. Defaults to "content". */
  textProp?: string;
}

export interface CompiledComponent {
  spec: ComponentSpec;
  /** Positional prop names, without the `?` marker. */
  positional: string[];
  /** How many positionals are required. */
  requiredPositional: number;
  hasChildren: boolean;
  childOf: ReadonlySet<string> | null;
  flags: ReadonlySet<string>;
  /** Enum values that belong to exactly one enum prop (and are not a flag): bare word → prop. */
  enumWords: ReadonlyMap<string, string>;
  /** Lower-cased prop name → schema name, for alias and case-insensitive matching. */
  propLookup: ReadonlyMap<string, string>;
}

export interface Library {
  components: ReadonlyMap<string, CompiledComponent>;
  unions: Readonly<Record<string, readonly string[]>>;
  textComponent: string;
  textProp: string;
  /** Bare words that can never be statement ids: every flag name in the catalog. */
  reserved: ReadonlySet<string>;
  get(name: string): CompiledComponent | undefined;
  /** Closest component name for an unknown one: case-insensitive, or within 2 edits (1 for names under 6 letters). */
  closest(name: string): string | undefined;
  /** Expands union names into component names. */
  expand(names: readonly string[]): Set<string>;
}

export function defineLibrary(input: LibraryInput): Library {
  const components = new Map<string, CompiledComponent>();
  const reserved = new Set<string>();
  const unions = input.unions ?? {};

  const expand = (names: readonly string[]): Set<string> => {
    const out = new Set<string>();
    const walk = (n: string, depth: number) => {
      const u = unions[n];
      if (u && depth < 8) for (const m of u) walk(m, depth + 1);
      else out.add(n);
    };
    for (const n of names) walk(n, 0);
    return out;
  };

  for (const spec of input.components) {
    const positional: string[] = [];
    let requiredPositional = 0;
    for (const a of spec.args ?? []) {
      const optional = a.endsWith("?");
      const name = optional ? a.slice(0, -1) : a;
      if (!(name in spec.props)) throw new Error(`${spec.name}: positional "${name}" is not a prop`);
      if (!optional) {
        if (requiredPositional !== positional.length) {
          throw new Error(`${spec.name}: required positional "${name}" follows an optional one`);
        }
        requiredPositional++;
      } else if (spec.children) {
        throw new Error(`${spec.name}: optional positionals are only allowed on components without children`);
      }
      positional.push(name);
    }
    const flags = new Set<string>();
    const propLookup = new Map<string, string>();
    for (const [name, p] of Object.entries(spec.props)) {
      propLookup.set(name.toLowerCase(), name);
      if (p.type === "boolean") {
        flags.add(name);
        reserved.add(name);
      }
    }
    for (const [alias, target] of Object.entries(spec.aliases ?? {})) propLookup.set(alias.toLowerCase(), target);
    const enumWords = new Map<string, string>();
    const ambiguous = new Set<string>(flags);
    for (const [name, p] of Object.entries(spec.props)) {
      // Open enums (icons…) are too broad to claim bare words.
      if (p.type !== "enum" || p.open) continue;
      for (const v of p.values) {
        if (enumWords.has(v) && enumWords.get(v) !== name) ambiguous.add(v);
        else enumWords.set(v, name);
      }
    }
    for (const w of ambiguous) enumWords.delete(w);
    const childOf =
      typeof spec.children === "object" && spec.children.of ? expand(spec.children.of) : null;
    components.set(spec.name, {
      spec,
      positional,
      requiredPositional,
      hasChildren: Boolean(spec.children),
      childOf,
      flags,
      enumWords,
      propLookup,
    });
  }

  const names = [...components.keys()];
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
  // Asked for every unknown name on every re-parse of a streaming statement, so answers are kept.
  const closestMemo = new Map<string, string | undefined>();
  const closest = (name: string): string | undefined => {
    if (closestMemo.has(name)) return closestMemo.get(name);
    let best = lower.get(name.toLowerCase());
    if (!best) {
      // Two edits for a long name (`Calout`, `Headre`), one for a short one: at two edits a short
      // name matches unrelated components (`Box` → `Row`, `Col` → `Row`).
      let bestD = name.length >= 6 ? 3 : 2;
      for (const n of names) {
        const d = editDistance(name.toLowerCase(), n.toLowerCase(), bestD);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    if (closestMemo.size < 500) closestMemo.set(name, best);
    return best;
  };

  return {
    components,
    unions,
    textComponent: input.textComponent ?? "Text",
    textProp: input.textProp ?? "content",
    reserved,
    get: (name) => components.get(name),
    closest,
    expand,
  };
}

/**
 * Edit distance where swapping two adjacent characters counts as one edit (optimal string
 * alignment), since swapped letters are a common typo (`Crad` → `Card` is 1, `Grid` is 2).
 * Gives up early once the distance reaches `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) >= max) return max;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin >= max) return max;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Converts a JSON Schema object schema (e.g. from `z.toJSONSchema`) into prop specs. */
export function propsFromJSONSchema(schema: JSONSchema): Record<string, PropSpec> {
  const out: Record<string, PropSpec> = {};
  const required = new Set(schema.required ?? []);
  for (const [name, s] of Object.entries(schema.properties ?? {})) {
    const t = propTypeFromJSONSchema(s);
    const spec: PropSpec = { ...t };
    if (required.has(name)) spec.required = true;
    if (s.default !== undefined) spec.default = s.default;
    if (s.description) spec.description = s.description;
    out[name] = spec;
  }
  return out;
}

export interface JSONSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  items?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  default?: unknown;
  description?: string;
  /** GistUI extension: marks a component-valued prop. */
  "x-gistui"?: "node" | "nodes" | "data" | "action" | "state";
  "x-gistui-of"?: string[];
}

function propTypeFromJSONSchema(s: JSONSchema): PropType {
  const x = s["x-gistui"];
  if (x === "node" || x === "nodes") return s["x-gistui-of"] ? { type: x, of: s["x-gistui-of"] } : { type: x };
  if (x) return { type: x };
  if (s.enum && s.enum.every((v) => typeof v === "string")) return { type: "enum", values: s.enum as string[] };
  const alts = s.anyOf ?? s.oneOf;
  if (alts) {
    const nonNull = alts.filter((a) => a.type !== "null");
    const consts = nonNull.map((a) => a.const);
    if (consts.length && consts.every((c) => typeof c === "string")) return { type: "enum", values: consts as string[] };
    if (nonNull.length === 1) return propTypeFromJSONSchema(nonNull[0]!);
    return { type: "any" };
  }
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  switch (type) {
    case "string":
      return { type: "string" };
    case "number":
    case "integer":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return s.items ? { type: "array", items: propTypeFromJSONSchema(s.items) } : { type: "array" };
    case "object":
      return { type: "object" };
    default:
      return { type: "any" };
  }
}
