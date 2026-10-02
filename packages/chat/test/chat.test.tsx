import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ui } from "@gistui/react/ui";
import { createChat, openai, splitReply, type ChatAdapter, type ChatRequest } from "../src/index";
import { Chat } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
/** Waits for a condition instead of a fixed time, so a loaded machine cannot make a test flaky. */
async function until(ok: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await tick(5);
  }
}

function scripted(replies: string[], delay = 1): ChatAdapter & { seen: unknown[] } {
  const seen: unknown[] = [];
  let i = 0;
  const fn = (async function* (req: ChatRequest) {
    seen.push(req.messages);
    const text = replies[i++] ?? "ok";
    for (let j = 0; j < text.length; j += 9) {
      if (req.signal.aborted) return;
      yield text.slice(j, j + 9);
      await tick(delay);
    }
  }) as unknown as ChatAdapter & { seen: unknown[] };
  fn.seen = seen;
  return fn;
}

describe("chat store", () => {
  test("sends, streams a reply, keeps history for the next turn", async () => {
    const adapter = scripted(["Hello there", "Second"]);
    const chat = createChat({ adapter, system: "SYS" });
    await chat.send("hi");
    expect(chat.getSnapshot().messages.map((m) => [m.role, m.content, m.status])).toEqual([["user", "hi", "done"], ["assistant", "Hello there", "done"]]);
    await chat.send("again");
    expect(adapter.seen[1]).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello there" },
      { role: "user", content: "again" },
    ]);
  });

  test("stop keeps the text so far; errors are shown and can be retried", async () => {
    const chat = createChat({ adapter: scripted(["a long reply that streams slowly for a while"], 25) });
    const p = chat.send("go");
    await until(() => (chat.getSnapshot().messages.at(-1)?.content.length ?? 0) > 0);
    chat.stop();
    await p;
    const last = chat.getSnapshot().messages.at(-1)!;
    expect(last.status).toBe("stopped");
    expect(last.content.length).toBeGreaterThan(0);
    let n = 0;
    const flaky = createChat({
      adapter: async function* () {
        if (n++ === 0) throw new Error("503 Service Unavailable");
        yield "fine";
      },
    });
    await flaky.send("x");
    expect(flaky.getSnapshot().messages.at(-1)).toMatchObject({ status: "error", error: "503 Service Unavailable" });
    await flaky.regenerate();
    expect(flaky.getSnapshot().messages.map((m) => m.content)).toEqual(["x", "fine"]);
  });

  test("the OpenAI adapter posts the conversation and reads the stream", async () => {
    let body: any;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    }) as unknown as typeof fetch;
    const chat = createChat({ adapter: openai({ url: "/api/chat", model: "m", fetch: fetchFn }) });
    await chat.send("hey");
    expect(body).toMatchObject({ model: "m", stream: true, messages: [{ role: "user", content: "hey" }] });
    expect(chat.getSnapshot().messages.at(-1)!.content).toBe("Hi");
  });

  test("replies split into chat text and UI blocks, an unclosed block is open", () => {
    expect(splitReply('Here:\n```gistui\nroot = Text("a")\n```\nDone.')).toEqual([
      { kind: "text", text: "Here:" },
      { kind: "ui", source: 'root = Text("a")\n', open: false },
      { kind: "text", text: "Done." },
    ]);
    expect(splitReply("Sure\n```gistui\nroot = Stack(")).toEqual([{ kind: "text", text: "Sure" }, { kind: "ui", source: "root = Stack(", open: true }]);
  });
});

describe("<Chat>", () => {
  test("renders text and UI; a button's send becomes the next message", async () => {
    const reply = 'Your KPIs:\n```gistui\nroot = Stack(Stat("Revenue", "$1.2M"), Button("Break it down"))\n```\n';
    const chat = createChat({ adapter: scripted([reply, "Here is the breakdown."]) });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Chat store={chat} library={ui} suggestions={["Revenue dashboard"]} />));
    expect(host.querySelector(".gistui-chat__suggestion")?.textContent).toBe("Revenue dashboard");
    await act(async () => {
      host.querySelector<HTMLElement>(".gistui-chat__suggestion")!.click();
      await until(() => chat.getSnapshot().status === "idle" && (host.textContent ?? "").includes("$1.2M"));
    });
    expect(host.querySelector(".gistui-chat__bubble")?.textContent).toBe("Revenue dashboard");
    expect(host.textContent).toContain("Your KPIs:");
    expect(host.textContent).toContain("$1.2M");
    await act(async () => {
      [...host.querySelectorAll<HTMLElement>(".gistui-button")].find((b) => b.textContent === "Break it down")!.click();
      await until(() => (host.textContent ?? "").includes("Here is the breakdown."));
    });
    expect([...host.querySelectorAll(".gistui-chat__bubble")].map((b) => b.textContent)).toEqual(["Revenue dashboard", "Break it down"]);
    expect(host.textContent).toContain("Here is the breakdown.");
    act(() => root.unmount());
  });
});
