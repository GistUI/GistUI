import { describe, expect, test } from "bun:test";
import { library } from "@gistui/catalog";
import { validate } from "@gistui/core";
import { EXAMPLES } from "../src/examples";
import { MAX_TURNS, QUESTIONS, screen } from "../src/chat/adapter";
import { FOLLOWS, SUBMITS } from "../src/chat/follows";

const ids = EXAMPLES.map((e) => e.id);

describe("recorded follow-ups", () => {
  test("every example has a thread to go on with", () => {
    for (const id of ids) expect([id, (FOLLOWS[id] ?? []).length > 0]).toEqual([id, true]);
    for (const id of Object.keys(FOLLOWS)) expect(ids).toContain(id);
    for (const q of QUESTIONS) expect(ids).toContain(q.id);
  });

  test("every answer is a valid program, with nothing to repair", () => {
    const problems: string[] = [];
    for (const [id, pool] of Object.entries(FOLLOWS)) {
      for (const f of pool) {
        const report = validate(screen(f.ui, f.tables, ["One more question?"]), library);
        for (const e of report.errors) problems.push(`${id} · ${f.q} · ${e.code}: ${e.message}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("every suggested question on an example's first screen has an answer", () => {
    for (const e of EXAMPLES) {
      const pool = FOLLOWS[e.id] ?? [];
      for (const list of e.source.matchAll(/FollowUps\(\[(.*?)\]\)/g)) {
        for (const q of JSON.parse(`[${list[1]}]`) as string[]) expect([e.id, q, pool.some((f) => f.q === q)]).toEqual([e.id, q, true]);
      }
    }
  });

  test("a question is asked once per example, and a thread fits in its turns", () => {
    for (const [id, pool] of Object.entries(FOLLOWS)) {
      expect([id, new Set(pool.map((f) => f.q)).size]).toEqual([id, pool.length]);
      // The opening question, then every follow-up.
      expect(1 + pool.length).toBeLessThanOrEqual(MAX_TURNS);
    }
  });

  test("every form in the examples and in the answers has a reply", () => {
    const sources = [...EXAMPLES.map((e) => e.source), ...Object.values(FOLLOWS).flatMap((pool) => pool.flatMap((f) => f.ui))];
    const forms = new Set(sources.flatMap((source) => [...source.matchAll(/Form\("([^"]+)"/g)].map((m) => m[1]!)));
    expect([...forms].filter((name) => !SUBMITS[name])).toEqual([]);
  });
});
