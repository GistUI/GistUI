/**
 * Phase 1 exit gates (plan §1, §9): linear streaming, 16 KB stream ≤ 5 ms in 10-char chunks,
 * shared-ref DAG < 1 ms. Timings take the best of several runs to limit machine noise; the CI
 * thresholds carry headroom, and `bun run bench` reports exact numbers.
 */

import { describe, expect, test } from "bun:test";
import { createStream, parse } from "../src/stream";
import { bigProgram, bigStatement, dag } from "./fixtures/programs";
import { lib } from "./fixtures/lib";

function best(runs: number, fn: () => void): number {
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

function streamIt(src: string, size: number) {
  const s = createStream(lib);
  for (let i = 0; i < src.length; i += size) {
    s.push(src.slice(i, i + size));
    s.flush();
  }
  s.end();
  return s;
}

// Headroom over the release targets, for slower CI machines.
const SLACK = Number(process.env.GISTUI_PERF_SLACK ?? 3);

describe("performance gates", () => {
  const src16 = bigProgram(16 * 1024);

  test("16 KB program streamed in 10-char chunks (flush every chunk) ≤ 5 ms", () => {
    for (let i = 0; i < 20; i++) streamIt(src16, 10); // warm up the JIT
    const ms = best(15, () => streamIt(src16, 10));
    const once = best(15, () => parse(src16, lib));
    console.log(`16 KB stream: ${ms.toFixed(2)} ms (one-shot ${once.toFixed(2)} ms, ${(ms / once).toFixed(1)}×)`);
    expect(ms).toBeLessThan(5 * SLACK);
  });

  test("shared-ref DAG (20 levels) < 1 ms", () => {
    const src = dag(20);
    for (let i = 0; i < 20; i++) parse(src, lib);
    const ms = best(20, () => parse(src, lib));
    console.log(`DAG 20 levels: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(1 * SLACK);
  });

  test("streaming time grows linearly with program size", () => {
    const small = bigProgram(8 * 1024);
    const large = bigProgram(64 * 1024);
    for (let i = 0; i < 5; i++) {
      streamIt(small, 10);
      streamIt(large, 10);
    }
    const a = best(7, () => streamIt(small, 10));
    const b = best(7, () => streamIt(large, 10));
    const ratio = b / a;
    console.log(`8 KB → 64 KB: ${a.toFixed(2)} → ${b.toFixed(2)} ms (${ratio.toFixed(1)}× for 8× input)`);
    expect(ratio).toBeLessThan(8 * 2);
  });

  test("one 50 KB statement streams in near-linear time", () => {
    const src = bigStatement(50 * 1024);
    for (let i = 0; i < 3; i++) streamIt(src, 10);
    const ms = best(5, () => streamIt(src, 10));
    const once = best(5, () => parse(src, lib));
    console.log(`50 KB single statement: ${ms.toFixed(2)} ms stream, ${once.toFixed(2)} ms one-shot`);
    expect(ms).toBeLessThan(once * 40);
  });
});
