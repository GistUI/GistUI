/**
 * System-prompt generator. Output is byte-stable for a given library and options (so provider prompt
 * caching hits), and the dynamic tool list goes last. Rules that OpenUI spells out in prose live in
 * validation and repair instead; the prompt only teaches the syntax and the catalog.
 */

import type { Library } from "./schema";
import { enumList, signature, tableSupplies } from "./signature";

export interface PromptTool {
  name: string;
  /** Argument summary, e.g. `{range:str}`. */
  args?: string;
  description?: string;
}

export interface PromptOptions {
  /** `full` writes a whole program, `edit` writes changes to one, `inline` mixes chat text and fenced UI. */
  mode?: "full" | "edit" | "inline";
  tools?: readonly PromptTool[];
  /** `one` uses the library's first example; pass strings for custom examples. */
  examples?: "one" | "none" | readonly string[];
  /** Only include these component groups. */
  groups?: readonly string[];
  /** List names and summaries only; signatures come from the `gistui_docs` tool. For large catalogs. */
  progressive?: boolean;
  /** Extra rules appended to the built-in ones. */
  rules?: readonly string[];
  /** Text placed before everything else (role, product context). */
  preamble?: string;
  /** Library examples to choose from when `examples` is "one". */
  libraryExamples?: readonly string[];
  /** Design guidance: `false` leaves it out, a string replaces the library's own guide. */
  guide?: string | false;
  /** The library's design guide (set by the library; used unless `guide` overrides it). */
  libraryGuide?: string;
  /** Usage notes per component group, printed under that group's signatures. */
  notes?: Readonly<Record<string, readonly string[]>>;
}

export interface PromptSection {
  name: string;
  text: string;
}

export interface GeneratedPrompt {
  text: string;
  sections: PromptSection[];
}

const TABLES_LINE = `- Tables are pipe rows; the first row is the header (\`Rev:n\` marks a number column) and the first
  column is the x axis or category. One table can feed @@FEEDS@@:
  rev = |Month|Revenue
  |Apr|84500
  |May|87200`;

const STATE_LINE = `- State and data: \`$tab = "a"\`, \`bind:$tab\`, \`q = @query("tool", {range:$range}, default:[])\`.`;
const ACTIONS_LINE = `- Actions: \`do:[@run(save), @set($tab, "b"), @send("text"), @open(url)]\`.`;

/** Component names, props and values for the syntax examples, taken from the library itself. */
function demos(lib: Library, examples: readonly string[]) {
  const all = [...lib.components.values()];
  const boxes = all.filter((c) => c.hasChildren && c.requiredPositional === 0);
  const rootName = examples.map((e) => /^root\s*=\s*([A-Z]\w*)\(/m.exec(e)?.[1]).find((n) => n && lib.get(n)?.hasChildren);
  const root = (rootName && lib.get(rootName)) || boxes[0];
  const flagBox = [root, ...boxes].find((c) => c && [...c.flags].length > 0);
  // A readable bare enum value (a word, not `2xl`), preferably a container's `variant`.
  const VARIANT = ["variant", "v"];
  const wordOf = (c: (typeof all)[number] | undefined, variantOnly = false) => {
    for (const [prop, p] of Object.entries(c?.spec.props ?? {})) {
      if (p.type !== "enum" || p.open || (variantOnly && !VARIANT.includes(prop))) continue;
      const w = [p.values[1], p.values[0]].find((v) => v && /^[a-z]/.test(v) && c!.enumWords.get(v) === prop);
      if (w) return w;
    }
    return undefined;
  };
  const candidates = [root, ...boxes.filter((c) => c !== root)];
  const variantBox = candidates.find((c) => wordOf(c, true));
  const enumBox = variantBox ?? candidates.find((c) => wordOf(c));
  const box = flagBox ?? enumBox ?? root;
  const enumProp = (c: typeof box) => {
    if (!c) return undefined;
    const [prop, spec] = Object.entries(c.spec.props).find(([, p]) => p.type === "enum" && !p.open && p.values.length > 1) ?? [];
    return prop && spec?.type === "enum" ? `${prop}:${spec.values[spec.values.length - 1]}` : undefined;
  };
  const leaf = lib.get("Tag") && !lib.get("Tag")!.hasChildren
    ? lib.get("Tag")
    : all.find((c) => !c.hasChildren && c.requiredPositional === 1 && c.spec.props[c.positional[0]!]?.type === "string");
  const text = lib.get(lib.textComponent);
  return {
    root: root?.spec.name,
    box: box?.spec.name,
    named: enumProp(box) ?? enumProp(all.find((c) => enumProp(c))),
    flag: flagBox ? `${flagBox.spec.name}(a, b, ${[...flagBox.flags].sort()[0]})` : undefined,
    word: enumBox ? `${enumBox.spec.name}(a, b, ${wordOf(enumBox, Boolean(variantBox))})` : undefined,
    leaf: leaf?.spec.name,
    markdown: Boolean(text && box),
  };
}

/**
 * The syntax card. Its examples use the library's own components, props and values, so it never
 * teaches a name the catalog lacks. Only what the catalog can use is taught: pipe tables when a
 * component takes table data (\`feeds\` lists them), state and queries when a prop binds state or
 * takes data, actions when a prop runs them.
 */
function syntaxFull(lib: Library, examples: readonly string[], feeds: readonly string[], state: boolean, actions: boolean): string {
  const d = demos(lib, examples);
  const out = [
    "Write the UI in GistUI: one statement per line, `id = value`.",
    "Order: `root = …` first, then containers, then leaves, then data tables last.",
    "- Component: `Name(positionals, children…, key:value)`. Required props are positional, in signature order",
    "  (or named); optional props are always named, in any order.",
  ];
  const bare = [
    d.named && `\`${d.named}\``,
    d.flag && `a boolean prop alone turns it on: \`${d.flag}\``,
    d.word && `an enum value alone sets the one prop that has it: \`${d.word}\``,
  ].filter(Boolean);
  if (bare.length) out.push(`- Enum values and flags are bare words: ${bare.join(";\n  ")}.`);
  const strings = "- Strings are JSON strings (use \\n, no raw newlines).";
  out.push(d.markdown ? `${strings} A string child is Markdown: \`${d.box}("### MRR", "**$412k**")\`.` : strings);
  const ids = `- Ids are short, lowercase and may be used before they are defined${d.root ? `: \`root = ${d.root}(head, body)\`` : ""}.`;
  out.push(d.box && d.leaf ? `${ids} Give ids to\n  sections; write small parts inline where they are used: \`${d.box}(${d.leaf}("New"), ${d.leaf}("Sale"))\`.` : ids);
  if (feeds.length) out.push(TABLES_LINE.replace("@@FEEDS@@", feeds.join(", ")));
  if (state) out.push(STATE_LINE);
  if (actions) out.push(ACTIONS_LINE);
  out.push(`- Expressions: + - * / % == != < > <= >= && || ! a ? b : c, a.b, a[0]${d.box ? `, \`@each(list, r => ${d.box}(r.name))\`` : ""}.`);
  return out.join("\n");
}
const TABLE_RULE = "Put chart and table data in pipe tables, not in arrays.";

const SYNTAX_EDIT = `You are editing the GistUI program below. Output only the changes, one per line:
- Replace a statement: \`id = …\`
- Change one prop: \`id.prop = value\`
- Add a child: \`id += child\`
- Delete: \`id = null\` (anything left unused is removed)
Keep existing ids. Do not repeat statements that do not change.`;

const SYNTAX_INLINE = `Answer in Markdown. When UI helps, put it in a \`\`\`gistui fenced block; text outside fences is shown as chat.`;

const RULES = [
  "Output only GistUI: no prose, no code fences.",
  "Define every id you use, once; do not define ids you do not use.",
  "Put chart and table data in pipe tables, not in arrays.",
  'Never pad a skipped argument (no null, no "", no empty slot); write the later one as key:value.',
  "Use only the components, props and enum values printed above. A prop exists only on the components whose signature lists it; never carry one over from a similar component.",
  "Leave optional props out unless the screen needs them; their defaults are good. When the value you want is not in a prop's list, omit the prop instead of guessing.",
];

const CHECK = "Before you finish, check: `root` comes first; every id you use is defined and every id you define is used; every component, prop and enum value appears in its signature.";

/** Generates the system prompt for a library. */
export function generatePrompt(lib: Library, opts: PromptOptions = {}): GeneratedPrompt {
  const mode = opts.mode ?? "full";
  const sections: PromptSection[] = [];
  if (opts.preamble) sections.push({ name: "preamble", text: opts.preamble.trim() });

  const feeds = [...lib.components.values()]
    .filter((c) => (!opts.groups || opts.groups.includes(c.spec.group ?? "Components")) && (c.spec.table || Object.values(c.spec.props).some((p) => p.type === "data")))
    .map((c) => c.spec.name);
  const tables = feeds.length > 0;
  const propTypes = new Set([...lib.components.values()].flatMap((c) => Object.values(c.spec.props).map((p) => p.type)));
  const exampleList =
    opts.examples === "none"
      ? []
      : Array.isArray(opts.examples)
        ? opts.examples
        : (opts.libraryExamples ?? []).slice(0, 1);
  const syntax = syntaxFull(lib, exampleList, feeds, propTypes.has("state") || propTypes.has("data"), propTypes.has("action"));
  if (mode === "inline") sections.push({ name: "syntax", text: `${SYNTAX_INLINE}\n\n${syntax}` });
  else sections.push({ name: "syntax", text: syntax });
  if (mode === "edit") sections.push({ name: "edit", text: SYNTAX_EDIT });

  // Named types come first, so every signature that uses one follows its definition.
  const enumNames = sharedEnums(lib, opts);
  const types = [
    ...Object.entries(lib.unions).map(([n, m]) => `${n} = ${m.join("|")}`),
    ...[...enumNames].map(([list, n]) => `${n} = ${list}`),
  ];
  if (types.length) sections.push({ name: "types", text: `Types:\n${types.join("\n")}` });
  sections.push({ name: "components", text: catalog(lib, opts, enumNames) });

  const guide = opts.guide === false ? undefined : (opts.guide ?? opts.libraryGuide);
  if (guide?.trim()) sections.push({ name: "design", text: guide.trim() });

  if (exampleList.length) {
    sections.push({ name: "example", text: exampleList.map((e) => `Example:\n${e.trim()}`).join("\n\n") });
  }

  const rules = (mode === "inline" ? RULES.slice(1) : RULES).filter((r) => tables || r !== TABLE_RULE);
  const allRules = [...rules, ...(opts.rules ?? [])];
  sections.push({ name: "rules", text: `Rules:\n${allRules.map((r) => `- ${r}`).join("\n")}` });

  if (lib.reserved.size) {
    sections.push({ name: "reserved", text: `Reserved words (flags, never ids): ${[...lib.reserved].sort().join(", ")}` });
  }
  if (mode !== "edit") sections.push({ name: "check", text: CHECK });

  if (opts.tools?.length) {
    const tools = [...opts.tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const lines = tools.map((t) => `- ${t.name}${t.args ? ` ${t.args}` : ""}${t.description ? `: ${t.description}` : ""}`);
    sections.push({ name: "tools", text: `Tools for @query and @mutation:\n${lines.join("\n")}` });
  }

  return { text: sections.map((s) => s.text).join("\n\n") + "\n", sections };
}

/**
 * Enum value lists used by two or more props are declared once as a named type (`Gap = sm|md|lg`),
 * named after the prop (numbered if two different lists share a prop name).
 */
function sharedEnums(lib: Library, opts: PromptOptions): Map<string, string> {
  const uses = new Map<string, { count: number; prop: string }>();
  for (const c of lib.components.values()) {
    if (opts.groups && !opts.groups.includes(c.spec.group ?? "Components")) continue;
    for (const [prop, p] of Object.entries(c.spec.props)) {
      if (p.type !== "enum") continue;
      const list = enumList(p);
      const u = uses.get(list);
      if (u) u.count++;
      else uses.set(list, { count: 1, prop });
    }
  }
  const taken = new Set([...lib.components.keys(), ...Object.keys(lib.unions)]);
  const out = new Map<string, string>();
  for (const [list, u] of [...uses].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    // Short lists used once or twice stay inline: a model reads the values where it writes the prop.
    if (u.count < 2 || (u.count < 3 && list.length <= 60)) continue;
    const base = u.prop.charAt(0).toUpperCase() + u.prop.slice(1);
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
    taken.add(name);
    out.set(list, name);
  }
  return out;
}

/**
 * Components that exist only as the columns of a pipe table (`Series` under a chart, `Col` under a
 * table): every place that accepts them is a slot a table fills. They are written by the table, so
 * the prompt does not list them.
 */
function columnHelpers(lib: Library): Set<string> {
  const helpers = new Set<string>();
  for (const c of lib.components.values()) if (c.spec.table?.columns && tableSupplies(c)?.children) helpers.add(c.spec.table.columns.component);
  const expand = (names: readonly string[] | undefined): string[] => (names ?? []).flatMap((n) => (Object.hasOwn(lib.unions, n) ? expand(lib.unions[n]) : [n]));
  for (const c of lib.components.values()) {
    const viaTable = tableSupplies(c)?.children === true;
    if (!viaTable && typeof c.spec.children === "object") for (const n of expand(c.spec.children.of)) helpers.delete(n);
    for (const p of Object.values(c.spec.props)) if (p.type === "node" || p.type === "nodes") for (const n of expand(p.of)) helpers.delete(n);
  }
  return helpers;
}

function catalog(lib: Library, opts: PromptOptions, enumNames: ReadonlyMap<string, string>): string {
  const groups = new Map<string, string[]>();
  const helpers = columnHelpers(lib);
  let tables = false;
  let optional = false;
  for (const c of lib.components.values()) {
    const g = c.spec.group ?? "Components";
    if (opts.groups && !opts.groups.includes(g)) continue;
    if (helpers.has(c.spec.name)) continue;
    if (c.spec.table) tables = true;
    if (c.positional.length > c.requiredPositional) optional = true;
    let lines = groups.get(g);
    if (!lines) groups.set(g, (lines = []));
    const desc = c.spec.description ? ` — ${c.spec.description}` : "";
    lines.push(opts.progressive ? `${c.spec.name}${desc}` : `${signature(c, enumNames, true)}${desc}`);
  }
  const legend = ["bare positional = text", ...(optional ? ["`name?` = may be left out"] : []), ...(tables ? ["`table` = the id of a pipe table"] : []), "`…X` = children of type X", "bare trailing name = flag"];
  const head = opts.progressive ? "Components (call gistui_docs(name) for a component's signature before using it):" : `Components (${legend.join("; ")}):`;
  const body = [...groups]
    .map(([g, lines]) => {
      const notes = (opts.notes?.[g] ?? []).map((n) => `  ${n.replace(/^-\s*/, "- ")}`);
      return `${g}:\n${[...lines.map((l) => `  ${l}`), ...notes].join("\n")}`;
    })
    .join("\n");
  return `${head}\n${body}`;
}

/** Full documentation for one component: the result of the `gistui_docs` tool in progressive mode. */
export function componentDocs(lib: Library, name: string): string | undefined {
  const c = lib.get(name) ?? lib.get(lib.closest(name) ?? "");
  if (!c) return undefined;
  const lines = [signature(c, undefined, true)];
  if (c.spec.description) lines.push(c.spec.description);
  for (const [p, spec] of Object.entries(c.spec.props)) {
    if (spec.description) lines.push(`  ${p}: ${spec.description}`);
  }
  return lines.join("\n");
}

/** Rough token estimate (≈4 characters per token) for budgets; use a real tokenizer for reports. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
