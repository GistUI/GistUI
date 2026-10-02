import { describe, expect, test } from "bun:test";
import { defineLibrary } from "@gistui/core";
import { Engine, runFor } from "../src/engine";

const lib = defineLibrary({
  components: [
    { name: "Stack", children: true, props: {} },
    { name: "Text", args: ["content"], props: { content: { type: "string", required: true } } },
    { name: "Button", args: ["label"], props: { label: { type: "string", required: true }, do: { type: "action" } } },
  ],
});
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const title = (e: Engine) => (e.store.get("root")?.props as { content?: string } | undefined)?.content;

function source(chunks: string[], opts: { hold?: boolean } = {}) {
  let cancelled = false;
  let ctrl!: ReadableStreamDefaultController<string>;
  const stream = new ReadableStream<string>({
    start(c) {
      ctrl = c;
      for (const ch of chunks) c.enqueue(ch);
      if (!opts.hold) c.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, ctrl: () => ctrl, cancelled: () => cancelled };
}

describe("StreamRun", () => {
  test("reads a stream into an engine and reports the end", async () => {
    const { stream } = source([`root = Text("He`, `llo")\n`]);
    const run = runFor(stream, () => new Engine(lib));
    run.retain();
    let done = 0;
    run.onDone(() => done++);
    await tick();
    expect(done).toBe(1);
    expect(run.done).toBe(true);
    expect(title(run.engine)).toBe("Hello");
  });

  test("a read error ends the run with what had arrived, and is kept on `error`", async () => {
    const s = source([`root = Text("partial`], { hold: true });
    const run = runFor(s.stream, () => new Engine(lib));
    run.retain();
    await tick();
    s.ctrl().error(new Error("network down"));
    await tick();
    expect(run.done).toBe(true);
    expect((run.error as Error).message).toBe("network down");
    expect(title(run.engine)).toBe("partial");
  });

  test("releasing the last holder cancels the source right away", async () => {
    const s = source([`root = Text("a")\n`], { hold: true });
    const run = runFor(s.stream, () => new Engine(lib));
    run.retain();
    await tick();
    run.release();
    await tick();
    expect(s.cancelled()).toBe(true);
    expect(run.disposed).toBe(true);
  });

  test("a release and a retain in the same tick keep the run (StrictMode remount)", async () => {
    const s = source([`root = Text("a")\n`], { hold: true });
    const run = runFor(s.stream, () => new Engine(lib));
    run.retain();
    run.release();
    run.retain();
    await tick();
    expect(run.disposed).toBe(false);
    expect(s.cancelled()).toBe(false);
  });

  test("mounting a stream again after its run was disposed shows what it had received, with working actions", async () => {
    for (const hold of [false, true]) {
      const s = source([`$n = 0\nroot = Stack(b)\nb = Button("Add", do:[@set($n, $n + 1)])\n`], { hold });
      const first = runFor(s.stream, () => new Engine(lib));
      first.retain();
      await tick();
      first.release();
      await tick();
      const again = runFor(s.stream, () => new Engine(lib));
      again.retain();
      expect(again).not.toBe(first);
      expect(again.done).toBe(true); // finished: the UI unlocks instead of waiting for a dead stream
      expect(again.engine.store.get("b")?.type).toBe("Button");
      await again.engine.runtime.run(again.engine.store.get("b")!.dyn!.do!, "b");
      expect(again.engine.runtime.getState("n")).toBe(1);
      expect(runFor(s.stream, () => new Engine(lib))).toBe(again);
    }
  });
});
