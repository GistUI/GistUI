import { DASHBOARD } from "./lib";

/** Builds a ~`bytes`-long program in the style of LLM output: many cards, KPIs and tables. */
export function bigProgram(bytes: number): string {
  const lines: string[] = [];
  const ids: string[] = [];
  let body = "";
  for (let i = 0; body.length < bytes; i++) {
    ids.push(`sec${i}`);
    const block = [
      `sec${i} = Card(Header("Section ${i}", "Usage, acquisition and revenue for region ${i}"), row${i}, Chart(data${i}, type:line, y:"Users"), "_Tip: track **CAC** by channel, (see ${i})._")`,
      `row${i} = Row(Stat("MAU", "128,400", "+6.2%"), Stat("New users", "24,950", "+3.1%"), Stat("MRR", "$412,000"), wrap)`,
      `data${i} = |Month|MAU|WAU`,
      `|Jan|84500|40100`,
      `|Feb|87200|41000`,
      `|Mar|90100|43800`,
      `|Apr|93800|45200`,
    ].join("\n");
    body += block + "\n";
    lines.push(block);
  }
  return `root = Page(${ids.join(", ")}, gap:lg)\n${lines.join("\n")}\n`;
}

/** `a_i = Stack([a_{i+1}, a_{i+1}])`: exponential without shared-ref memoization. */
export function dag(levels: number): string {
  const lines = ["root = Stack(a0)"];
  for (let i = 0; i < levels; i++) lines.push(`a${i} = Stack([a${i + 1}, a${i + 1}])`);
  lines.push(`a${levels} = Text("leaf")`);
  return lines.join("\n") + "\n";
}

/** One huge statement: a Card with many children, e.g. a model that never breaks lines. */
export function bigStatement(bytes: number): string {
  const kids: string[] = [];
  let len = 0;
  for (let i = 0; len < bytes; i++) {
    const k = `Stat("Metric ${i}", "${i * 13}", "+${i % 9}%")`;
    kids.push(k);
    len += k.length + 2;
  }
  return `root = Card(${kids.join(", ")})\n`;
}

export { DASHBOARD };
