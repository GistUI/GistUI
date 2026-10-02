import { describe, expect, test } from "bun:test";
import { flushSync, mount, unmount } from "svelte";
import { gistui } from "../src/index";
import App from "./App.svelte";
import { counted } from "./counted";
import FieldApp from "./FieldApp.svelte";
import OptionsApp from "./OptionsApp.svelte";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("@gistui/svelte", () => {
  test("use:gistui renders a program and streams a growing source", () => {
    const host = document.createElement("div");
    const action = gistui(host, { source: `root = Page(Card(Header("Revenue")))\n`, streaming: true });
    expect(host.querySelector(".gistui-card .gistui-header__title")!.textContent).toBe("Revenue");
    const card = host.querySelector(".gistui-card");
    action.update({ source: `root = Page(Card(Header("Revenue")))\nx = Text("more")\n`, streaming: false });
    expect(host.querySelector(".gistui-card")).toBe(card);
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    action.destroy();
  });

  test("<GistUI>: a Svelte component replaces a built-in one, places its children and sees the app's context", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: unknown[] = [];
    const app = mount(App, { target: host, props: { source: `root = Page(Card(Button("Ping"), v:sunk))\n`, actions } });
    flushSync();
    await tick();
    const card = host.querySelector("article.my-card")!;
    expect(card.querySelector("h3")!.textContent).toBe("sunk");
    expect(card.getAttribute("data-brand")).toBe("acme");
    const button = card.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect(button.textContent).toBe("Ping");
    button.click();
    expect(actions).toEqual([{ type: "send", message: "Ping", nodeId: expect.any(String) }]);
    void unmount(app);
    host.remove();
  });

  test("gistField: a custom input joins the Form: required error on submit, bind:$var, typed submit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: { type: string; values?: Record<string, unknown> }[] = [];
    const app = mount(FieldApp, {
      target: host,
      props: { source: `$email = ""\nroot = Form("join", Input("email", "Email", type:email, required, bind:$email), Buttons(Button("Join")))\n`, actions },
    });
    flushSync();
    await tick();
    const input = host.querySelector<HTMLInputElement>(".my-input input")!;
    expect(input.name).toBe("email");
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !host.querySelector(".my-error"); i++) {
      flushSync();
      await tick();
    }
    expect(host.querySelector(".my-error")!.textContent).toBe("Email is required");
    expect(actions.filter((a) => a.type === "submit")).toEqual([]);
    input.value = "ada@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !actions.some((a) => a.type === "submit"); i++) await tick();
    expect(actions.find((a) => a.type === "submit")!.values).toEqual({ email: "ada@example.com" });
    flushSync();
    expect(host.querySelector(".my-error")).toBeNull();
    void unmount(app);
    host.remove();
  });

  /** <GistUI> with options that change after mount. */
  function options(initial: Record<string, unknown>, own = false) {
    const host = document.createElement("div");
    document.body.append(host);
    const app = mount(OptionsApp, { target: host, props: { initial, own } }) as { set(next: Record<string, unknown>): void };
    flushSync();
    return {
      host,
      set(next: Record<string, unknown>) {
        app.set(next);
        flushSync();
      },
      done() {
        void unmount(app);
        host.remove();
      },
    };
  }

  test("<GistUI>: components written inline are mounted once while the source streams", async () => {
    counted.mounts = 0;
    let source = `root = Card(a, b, c, d, e)\n`;
    const r = options({ source, streaming: true }, true);
    await tick();
    const input = r.host.querySelector("article.my-card input");
    expect(input).not.toBeNull();
    for (const id of "abcde") r.set({ source: (source += `${id} = Header("${id}")\n`), color: id < "c" ? "teal" : "rose" });
    await tick();
    expect([...r.host.querySelectorAll(".my-card .gistui-header__title")].map((t) => t.textContent)).toEqual(["a", "b", "c", "d", "e"]);
    expect(counted.mounts).toBe(1);
    expect(r.host.querySelector("article.my-card input")).toBe(input);
    r.done();
  });

  test("<GistUI>: from a stream to a source: the source is shown", async () => {
    let feed!: ReadableStreamDefaultController<string>;
    const stream = new ReadableStream<string>({ start: (c) => void (feed = c) });
    const r = options({ stream });
    feed.enqueue(`root = Card(Header("From stream"))\n`);
    for (let i = 0; i < 50 && !r.host.querySelector(".gistui-header__title"); i++) await tick();
    expect(r.host.querySelector(".gistui-header__title")!.textContent).toBe("From stream");
    r.set({ stream: undefined, source: `root = Card(Header("From source"))\n` });
    expect([...r.host.querySelectorAll(".gistui-header__title")].map((t) => t.textContent)).toEqual(["From source"]);
    expect(r.host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    r.done();
  });

  test("<GistUI>: props that change after mount reach the renderer, and a removed one is unset", async () => {
    const seen: string[] = [];
    const r = options({
      source: `root = Page(Card(Button("Load", do:[@run(q)])), Text("" + q))\nq = @query("load", {}, default:"none")\n`,
      streaming: true,
      color: "teal",
      tokens: { primary: "#0f766e" },
      classNames: { Card: "p-8" },
      tools: { load: async () => (seen.push("first"), 1) },
    });
    const root = r.host.querySelector(".gistui")!;
    const button = r.host.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className, button.disabled]).toEqual(["teal", true, "gistui-card p-8", true]);
    r.set({ color: undefined, tokens: undefined, classNames: undefined });
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className]).toEqual([null, false, "gistui-card"]);
    // `lockUntil` after mount: the (complete) button unlocks while the source still streams.
    r.set({ lockUntil: "ready" });
    expect(r.host.querySelector(".gistui-button")).toBe(button);
    expect(button.disabled).toBe(false);
    // Other tools: used by the next call.
    for (let i = 0; i < 50 && !seen.length; i++) await tick();
    r.set({ tools: { load: async () => (seen.push("second"), 2) } });
    button.click();
    for (let i = 0; i < 50 && seen.length < 2; i++) await tick();
    expect(seen).toEqual(["first", "second"]);
    r.done();
  });

  test("use:gistui: an option left out of an update is unset; unchanged options render nothing", () => {
    const host = document.createElement("div");
    let updates = 0;
    const Header = (ctx: { props: Readonly<Record<string, unknown>> }) => {
      const el = document.createElement("h2");
      el.textContent = String(ctx.props.title ?? "");
      return { el, update: () => (updates++, true) };
    };
    const base = { source: `root = Page(Header("a"), Header("b"))\n`, renderers: { Header } };
    const action = gistui(host, { ...base, color: "teal", classNames: { Page: "p-8" } });
    const root = host.querySelector(".gistui")!;
    expect([root.getAttribute("data-gistui-color"), host.querySelector(".gistui-page")!.className]).toEqual(["teal", "gistui-page p-8"]);
    // The same options again (new objects, as a template writes them): nothing renders.
    action.update({ ...base, renderers: { Header }, color: "teal", classNames: { Page: "p-8" } });
    expect(updates).toBe(0);
    action.update({ ...base });
    expect([root.getAttribute("data-gistui-color"), host.querySelector(".gistui-page")!.className]).toEqual([null, "gistui-page"]);
    expect(updates).toBe(0);
    action.destroy();
  });
});
