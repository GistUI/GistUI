import { describe, expect, test } from "bun:test";
import { createApp, defineComponent, h, nextTick, provide, inject, reactive, ref, shallowRef } from "vue";
import { GistChildren, GistUI, useGistField } from "../src/index";

const tick = () => new Promise((r) => setTimeout(r, 0));

function render(component: ReturnType<typeof defineComponent>) {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp(component);
  app.mount(host);
  return {
    host,
    done() {
      app.unmount();
      host.remove();
    },
  };
}

describe("@gistui/vue", () => {
  test("renders a program with the built-in components and streams a growing source", async () => {
    const source = ref(`root = Page(Card(Header("Revenue")))\n`);
    const streaming = ref(true);
    const r = render(defineComponent(() => () => h(GistUI, { source: source.value, streaming: streaming.value })));
    await nextTick();
    expect(r.host.querySelector(".gistui-card .gistui-header__title")!.textContent).toBe("Revenue");
    const card = r.host.querySelector(".gistui-card");
    source.value += `x = Text("more")\n`;
    streaming.value = false;
    await nextTick();
    expect(r.host.querySelector(".gistui-card")).toBe(card);
    expect(r.host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    r.done();
  });

  test("emits actions; a Vue component replaces a built-in one and places its children; app provide/inject works", async () => {
    const actions: unknown[] = [];
    const MyCard = defineComponent({
      props: ["props", "node", "ctx"],
      setup(p) {
        const brand = inject("brand", "none");
        return () => h("article", { class: "my-card", "data-brand": brand }, [h("h3", String((p.props as Record<string, unknown>).v ?? "")), h(GistChildren)]);
      },
    });
    const r = render(
      defineComponent(() => {
        provide("brand", "acme");
        return () =>
          h(GistUI, {
            source: `root = Page(Card(Button("Ping"), v:sunk))\n`,
            components: { Card: MyCard },
            onAction: (a: unknown) => actions.push(a),
          });
      }),
    );
    await nextTick();
    await tick();
    const card = r.host.querySelector("article.my-card")!;
    expect(card.querySelector("h3")!.textContent).toBe("sunk");
    expect(card.getAttribute("data-brand")).toBe("acme");
    const button = card.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect(button.textContent).toBe("Ping");
    button.click();
    expect(actions).toEqual([{ type: "send", message: "Ping", nodeId: expect.any(String) }]);
    r.done();
  });

  test("useGistField: a custom input joins the Form: required error on submit, bind:$var, typed submit", async () => {
    const actions: { type: string; values?: Record<string, unknown> }[] = [];
    const MyInput = defineComponent({
      props: ["props", "node", "ctx"],
      setup(p) {
        const field = useGistField(p as never);
        return () =>
          h("label", { class: "my-input" }, [
            field.value.label,
            h("input", {
              name: field.value.name,
              value: field.value.value ?? "",
              disabled: field.value.locked,
              "aria-invalid": field.value.error ? "true" : undefined,
              onInput: (e: Event) => field.value.setValue((e.target as HTMLInputElement).value),
            }),
            field.value.error ? h("p", { class: "my-error" }, field.value.error) : null,
          ]);
      },
    });
    const r = render(
      defineComponent(() => () =>
        h(GistUI, {
          source: `$email = ""\nroot = Form("join", Input("email", "Email", type:email, required, bind:$email), Buttons(Button("Join")))\n`,
          components: { Input: MyInput },
          onAction: (a: { type: string }) => actions.push(a),
        }),
      ),
    );
    await nextTick();
    await tick();
    const input = r.host.querySelector<HTMLInputElement>(".my-input input")!;
    expect(input.name).toBe("email");
    r.host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !r.host.querySelector(".my-error"); i++) await tick();
    expect(r.host.querySelector(".my-error")!.textContent).toBe("Email is required");
    expect(actions.filter((a) => a.type === "submit")).toEqual([]);
    input.value = "ada@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    r.host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    for (let i = 0; i < 50 && !actions.some((a) => a.type === "submit"); i++) await tick();
    expect(actions.find((a) => a.type === "submit")!.values).toEqual({ email: "ada@example.com" });
    await nextTick();
    expect(r.host.querySelector(".my-error")).toBeNull();
    r.done();
  });

  test("components written inline (a new object on every render) are set up once while the source streams", async () => {
    let setups = 0;
    const MyCard = defineComponent({
      props: ["props", "node", "ctx"],
      setup() {
        setups++;
        return () => h("article", { class: "my-card" }, [h("input"), h(GistChildren)]);
      },
    });
    const source = ref(`root = Card(a, b, c, d, e)\n`);
    const r = render(defineComponent(() => () => h(GistUI, { source: source.value, streaming: true, components: { Card: MyCard } })));
    await nextTick();
    const input = r.host.querySelector("article.my-card input");
    expect(input).not.toBeNull();
    for (const id of "abcde") {
      source.value += `${id} = Header("${id}")\n`;
      await nextTick();
    }
    expect([...r.host.querySelectorAll(".my-card .gistui-header__title")].map((t) => t.textContent)).toEqual(["a", "b", "c", "d", "e"]);
    expect(setups).toBe(1);
    expect(r.host.querySelector("article.my-card input")).toBe(input);
    r.done();
  });

  test("another component for a name replaces only that component", async () => {
    const card = (cls: string) => defineComponent({ props: ["props", "node", "ctx"], setup: () => () => h("article", { class: cls }, [h(GistChildren)]) });
    const [A, B] = [card("card-a"), card("card-b")];
    const Card = shallowRef(A);
    const r = render(defineComponent(() => () => h(GistUI, { source: `$n = 0\nroot = Page(Card(Button("Inc", do:[@set($n, $n + 1)]), Text("n=" + $n)))\n`, components: { Card: Card.value } })));
    await nextTick();
    const button = r.host.querySelector<HTMLButtonElement>(".card-a .gistui-button")!;
    button.click();
    for (let i = 0; i < 50 && !r.host.querySelector(".gistui-text")!.textContent!.includes("n=1"); i++) await tick();
    Card.value = B;
    await nextTick();
    // The program was not started over: its state and the built-in components are still there.
    expect(r.host.querySelector(".card-a")).toBeNull();
    expect(r.host.querySelector(".card-b .gistui-button")).toBe(button);
    expect(r.host.querySelector(".gistui-text")!.textContent).toContain("n=1");
    r.done();
  });

  test("from a stream to a source: the source is shown", async () => {
    let feed!: ReadableStreamDefaultController<string>;
    const stream = shallowRef<ReadableStream<string> | null>(new ReadableStream<string>({ start: (c) => void (feed = c) }));
    const source = ref<string | undefined>(undefined);
    const r = render(defineComponent(() => () => h(GistUI, { stream: stream.value, source: source.value })));
    await nextTick();
    feed.enqueue(`root = Card(Header("From stream"))\n`);
    for (let i = 0; i < 50 && !r.host.querySelector(".gistui-header__title"); i++) await tick();
    expect(r.host.querySelector(".gistui-header__title")!.textContent).toBe("From stream");
    stream.value = null;
    source.value = `root = Card(Header("From source"))\n`;
    await nextTick();
    expect([...r.host.querySelectorAll(".gistui-header__title")].map((t) => t.textContent)).toEqual(["From source"]);
    expect(r.host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    r.done();
  });

  test("props that change after mount reach the renderer, and a removed one is unset", async () => {
    const seen: string[] = [];
    const o = reactive<Record<string, unknown>>({
      source: `root = Page(Card(Button("Load", do:[@run(q)])), Text("" + q))\nq = @query("load", {}, default:"none")\n`,
      streaming: true,
      color: "teal",
      tokens: { primary: "#0f766e" },
      classNames: { Card: "p-8" },
      tools: { load: async () => (seen.push("first"), 1) },
    });
    const r = render(defineComponent(() => () => h(GistUI, { ...o })));
    await nextTick();
    const root = r.host.querySelector(".gistui")!;
    const button = r.host.querySelector<HTMLButtonElement>(".gistui-button")!;
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className, button.disabled]).toEqual(["teal", true, "gistui-card p-8", true]);
    // Unset: the colour, the tokens and the extra classes go away.
    o.color = undefined;
    o.tokens = undefined;
    o.classNames = undefined;
    await nextTick();
    expect([root.getAttribute("data-gistui-color"), root.querySelector("style") !== null, r.host.querySelector(".gistui-card")!.className]).toEqual([null, false, "gistui-card"]);
    // `lockUntil` after mount: the (complete) button unlocks while the source still streams.
    o.lockUntil = "ready";
    await nextTick();
    expect(r.host.querySelector(".gistui-button")).toBe(button);
    expect(button.disabled).toBe(false);
    // Other tools: used by the next call.
    for (let i = 0; i < 50 && !seen.length; i++) await tick();
    o.tools = { load: async () => (seen.push("second"), 2) };
    await nextTick();
    button.click();
    for (let i = 0; i < 50 && seen.length < 2; i++) await tick();
    expect(seen).toEqual(["first", "second"]);
    r.done();
  });

  test("tokens changed in place (a reactive object) are applied", async () => {
    const tokens = reactive({ primary: "#111111" });
    const r = render(defineComponent(() => () => h(GistUI, { source: `root = Card(Header("x"))\n`, tokens })));
    await nextTick();
    expect(r.host.querySelector(".gistui style")!.textContent).toContain("#111111");
    tokens.primary = "#222222";
    await nextTick();
    expect(r.host.querySelector(".gistui style")!.textContent).toContain("#222222");
    r.done();
  });
});
