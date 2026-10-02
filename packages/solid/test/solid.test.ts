import { describe, expect, test } from "bun:test";
import { createComponent, createContext, createEffect, createSignal, useContext } from "solid-js";
import { hydrate, render } from "solid-js/web";
import { createGistField, GistChildren, GistUI, type GistUIComponentProps, type GistUIProps } from "../src/index";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("@gistui/solid", () => {
  test("renders a program with the built-in components and streams a growing source", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [source, setSource] = createSignal(`root = Page(Card(Header("Revenue")))\n`);
    const [streaming, setStreaming] = createSignal(true);
    const dispose = render(
      () =>
        createComponent(GistUI, {
          get source() {
            return source();
          },
          get streaming() {
            return streaming();
          },
        }),
      host,
    );
    await tick();
    expect(host.querySelector(".gistui-card .gistui-header__title")!.textContent).toBe("Revenue");
    const card = host.querySelector(".gistui-card");
    setSource((s) => `${s}x = Text("more")\n`);
    setStreaming(false);
    await tick();
    expect(host.querySelector(".gistui-card")).toBe(card);
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    dispose();
    host.remove();
  });

  test("a Solid component replaces a built-in one, places its children and sees the app's context", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const Brand = createContext("none");
    const actions: unknown[] = [];
    function MyCard(p: GistUIComponentProps) {
      const brand = useContext(Brand);
      const el = document.createElement("article");
      el.className = "my-card";
      el.dataset.brand = brand;
      const h = document.createElement("h3");
      h.textContent = String(p.props.v ?? "");
      el.append(h, GistChildren({}) as Node);
      return el;
    }
    const dispose = render(
      () =>
        createComponent(Brand.Provider, {
          value: "acme",
          get children() {
            return createComponent(GistUI, { source: `root = Page(Card(Button("Ping"), v:sunk))\n`, components: { Card: MyCard }, onAction: (a) => actions.push(a) });
          },
        }),
      host,
    );
    await tick();
    const card = host.querySelector("article.my-card")!;
    expect(card.querySelector("h3")!.textContent).toBe("sunk");
    expect(card.getAttribute("data-brand")).toBe("acme");
    const button = card.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect(button.textContent).toBe("Ping");
    button.click();
    expect(actions).toEqual([{ type: "send", message: "Ping", nodeId: expect.any(String) }]);
    dispose();
    host.remove();
  });

  test("createGistField: a custom input joins the Form: required error on submit, bind:$var, typed submit", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: { type: string; values?: Record<string, unknown> }[] = [];
    function MyInput(p: GistUIComponentProps) {
      const field = createGistField(p);
      const label = document.createElement("label");
      label.className = "my-input";
      const input = document.createElement("input");
      const error = document.createElement("p");
      error.className = "my-error";
      input.addEventListener("input", () => field().setValue(input.value));
      label.append(input);
      createEffect(() => {
        const f = field();
        input.name = f.name ?? "";
        input.disabled = f.locked;
        if (input.value !== String(f.value ?? "")) input.value = String(f.value ?? "");
        error.textContent = f.error ?? "";
        if (f.error) label.append(error);
        else error.remove();
      });
      return label;
    }
    const dispose = render(
      () =>
        createComponent(GistUI, {
          source: `$email = ""\nroot = Form("join", Input("email", "Email", type:email, required, bind:$email), Buttons(Button("Join")))\n`,
          components: { Input: MyInput },
          onAction: (a) => actions.push(a as never),
        }),
      host,
    );
    await tick();
    const input = host.querySelector<HTMLInputElement>(".my-input input")!;
    expect(input.name).toBe("email");
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !host.querySelector(".my-error"); i++) await tick();
    expect(host.querySelector(".my-error")!.textContent).toBe("Email is required");
    expect(actions.filter((a) => a.type === "submit")).toEqual([]);
    input.value = "ada@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !actions.some((a) => a.type === "submit"); i++) await tick();
    expect(actions.find((a) => a.type === "submit")!.values).toEqual({ email: "ada@example.com" });
    await tick();
    expect(host.querySelector(".my-error")).toBeNull();
    dispose();
    host.remove();
  });

  /** <GistUI> with props that change after mount: `set` merges, a key set to undefined is removed. */
  function options(initial: GistUIProps) {
    const host = document.createElement("div");
    document.body.append(host);
    const [props, setProps] = createSignal<GistUIProps>(initial);
    const keys = ["library", "components", "source", "streaming", "stream", "inline", "theme", "color", "tokens", "darkTokens", "classNames", "tools", "mutations", "initialState", "lockUntil", "openLinks", "autofix"] as const;
    const reactive = {} as GistUIProps;
    for (const k of keys) Object.defineProperty(reactive, k, { enumerable: true, get: () => props()[k] });
    const dispose = render(() => createComponent(GistUI, reactive), host);
    return {
      host,
      set: (next: Partial<GistUIProps>) => setProps((p) => Object.fromEntries(Object.entries({ ...p, ...next }).filter(([, v]) => v !== undefined)) as GistUIProps),
      done() {
        dispose();
        host.remove();
      },
    };
  }

  test("components passed as a new object on every change are created once while the source streams", async () => {
    let created = 0;
    function MyCard() {
      created++;
      const el = document.createElement("article");
      el.className = "my-card";
      el.append(document.createElement("input"), GistChildren({}) as Node);
      return el;
    }
    let source = `root = Card(a, b, c, d, e)\n`;
    const r = options({ source, streaming: true, components: { Card: MyCard } });
    await tick();
    const input = r.host.querySelector("article.my-card input");
    expect(input).not.toBeNull();
    for (const id of "abcde") {
      r.set({ source: (source += `${id} = Header("${id}")\n`), components: { Card: MyCard } });
      await tick();
    }
    expect([...r.host.querySelectorAll(".my-card .gistui-header__title")].map((t) => t.textContent)).toEqual(["a", "b", "c", "d", "e"]);
    expect(created).toBe(1);
    expect(r.host.querySelector("article.my-card input")).toBe(input);
    r.done();
  });

  test("from a stream to a source: the source is shown", async () => {
    let feed!: ReadableStreamDefaultController<string>;
    const stream = new ReadableStream<string>({ start: (c) => void (feed = c) });
    const r = options({ stream });
    await tick();
    feed.enqueue(`root = Card(Header("From stream"))\n`);
    for (let i = 0; i < 50 && !r.host.querySelector(".gistui-header__title"); i++) await tick();
    expect(r.host.querySelector(".gistui-header__title")!.textContent).toBe("From stream");
    r.set({ stream: undefined, source: `root = Card(Header("From source"))\n` });
    await tick();
    expect([...r.host.querySelectorAll(".gistui-header__title")].map((t) => t.textContent)).toEqual(["From source"]);
    expect(r.host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    r.done();
  });

  test("props that change after mount reach the renderer, and a removed one is unset", async () => {
    const seen: string[] = [];
    const r = options({
      source: `root = Page(Card(Button("Load", do:[@run(q)])), Text("" + q))\nq = @query("load", {}, default:"none")\n`,
      streaming: true,
      color: "teal",
      tokens: { primary: "#0f766e" },
      classNames: { Card: "p-8" },
      tools: { load: async () => (seen.push("first"), 1) },
    });
    await tick();
    const root = r.host.querySelector(".gistui")!;
    const button = r.host.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className, button.disabled]).toEqual(["teal", true, "gistui-card p-8", true]);
    r.set({ color: undefined, tokens: undefined, classNames: undefined });
    await tick();
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className]).toEqual([null, false, "gistui-card"]);
    // `lockUntil` after mount: the (complete) button unlocks while the source still streams.
    r.set({ lockUntil: "ready" });
    await tick();
    expect(r.host.querySelector(".gistui-button")).toBe(button);
    expect(button.disabled).toBe(false);
    // Other tools: used by the next call.
    for (let i = 0; i < 50 && !seen.length; i++) await tick();
    r.set({ tools: { load: async () => (seen.push("second"), 2) } });
    await tick();
    button.click();
    for (let i = 0; i < 50 && seen.length < 2; i++) await tick();
    expect(seen).toEqual(["first", "second"]);
    r.done();
  });

  test("renders on the server (SolidStart): an empty wrapper, without `document`, which the browser then hydrates", async () => {
    // The server build of solid-js is what a server resolves (this file runs with the browser's),
    // so the server half runs in a process of its own, with no DOM.
    const script = `
      import { createComponent } from "solid-js";
      import { renderToString, ssr } from "solid-js/web";
      import { GistChildren, GistUI } from "./src/index.ts";
      if (typeof document !== "undefined") throw new Error("this must run without a DOM");
      const html = renderToString(() =>
        ssr(["<main><p>before</p>", "<p>after</p>", "</main>"], createComponent(GistUI, { source: "root = Card(Header('Hello'))" }), createComponent(GistChildren, {})),
      );
      console.log(JSON.stringify(html));
    `;
    const run = Bun.spawn([process.execPath, "-e", script], { cwd: `${import.meta.dir}/..`, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text(), run.exited]);
    expect(err).toBe("");
    expect(code).toBe(0);
    const html: string = JSON.parse(out);
    expect(html).toMatch(/^<main><p>before<\/p><div data-hk="?[\w-]+"? style="display:contents"><\/div><p>after<\/p><\/main>$/);

    // In the browser: the server's wrapper is taken over (its neighbours stay) and the program renders in it.
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = html;
    const wrapper = host.querySelector<HTMLElement>("div[data-hk]")!;
    // What Solid's hydration script sets up on a real page.
    (globalThis as { _$HY?: unknown })._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} };
    const dispose = hydrate(() => createComponent(GistUI, { source: `root = Card(Header("Hello"))\n` }), host.querySelector("main")!);
    await tick();
    expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Hello");
    expect(host.querySelector(".gistui")!.parentElement).toBe(wrapper);
    expect([...host.querySelector("main")!.children].map((c) => c.tagName)).toEqual(["P", "DIV", "P"]);
    dispose();
    delete (globalThis as { _$HY?: unknown })._$HY;
    host.remove();
  });
});
