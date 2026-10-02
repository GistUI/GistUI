import { beforeAll, describe, expect, test } from "bun:test";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { createLibrary, defineComponent, GistUI, type ComponentProps, type GistUIAction, type GistUIProps } from "../src/index";
import { preloadAll, preloadChart, ui, useGistField } from "../src/ui";
import "../src/prompt";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Lazily loaded components (choice groups, slides, rich blocks) render synchronously once loaded.
beforeAll(() => preloadAll());

const DASHBOARD = `root = Page(head, kpis, Row(trend, mix, wrap), more, gap:lg)
head = Header("Q3 revenue", "All regions")
kpis = Stats(kpiData)
trend = Card(Header("Monthly revenue"), Chart(rev, type:line, y:"USD"))
mix = Card("### By channel", Chart(channels, type:donut))
more = FollowUps(["Compare with Q2", "Show top customers"])
kpiData = |Label|Value|Delta
|Revenue|$1.2M|+8%
|Customers|3,410|-2.1%
rev = |Month|Revenue
|Jul|380000
|Aug|402000
channels = |Channel|Share
|Organic|46
|Paid|31
`;

function mount(el: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return {
    host,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const q = (host: HTMLElement, sel: string) => host.querySelectorAll(sel);

describe("<GistUI>", () => {
  test("renders a complete program with the default library", () => {
    const errors: unknown[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={DASHBOARD} onError={(e) => errors.push(...e)} />);
    expect(q(host, '[data-gistui="Page"]')).toHaveLength(1);
    expect(q(host, '[data-gistui="Stat"]')).toHaveLength(2);
    expect(q(host, '[data-gistui="Chart"]')).toHaveLength(2);
    expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Q3 revenue");
    expect(host.querySelector('[data-trend="down"]')!.textContent).toBe("-2.1%");
    expect(q(host, ".gistui-followup")).toHaveLength(2);
    expect(host.querySelector(".gistui-md h3")!.textContent).toBe("By channel");
    expect(errors).toEqual([]);
    unmount();
  });

  test("streams: skeletons first, then content; nodes re-render only when they change", async () => {
    const renders = new Map<string, number>();
    const devtools = { onNodeRender: (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1) };
    const props = (source: string, streaming: boolean): GistUIProps => ({ library: ui, source, streaming, devtools });
    const { host, rerender, unmount } = mount(<GistUI {...props("", true)} />);

    // Once a statement is complete, later chunks never re-render it: work is O(changed), not O(tree).
    const headDone = DASHBOARD.indexOf("\nkpis =") + 1;
    let frozen: { root: number; head: number } | null = null;
    let steps = 0;
    for (let i = 20; i < DASHBOARD.length; i += 20) {
      rerender(<GistUI {...props(DASHBOARD.slice(0, i), true)} />);
      steps++;
      if (i === 60) {
        // `root` is known, its children are placeholders.
        expect(q(host, '[data-gistui="Page"]')).toHaveLength(1);
        expect(q(host, ".gistui-skeleton").length).toBeGreaterThan(0);
      }
      if (i > headDone + 20 && !frozen) frozen = { root: renders.get("root")!, head: renders.get("head")! };
    }
    rerender(<GistUI {...props(DASHBOARD, false)} />);
    // Charts are a lazy chunk: their placeholders stay until it arrives.
    await act(async () => {
      await preloadChart();
    });
    expect(q(host, ".gistui-skeleton")).toHaveLength(0);
    expect(q(host, ".gistui-chart__svg")).toHaveLength(2);
    expect(q(host, '[data-gistui="Chart"]')).toHaveLength(2);

    expect(steps).toBeGreaterThan(15);
    expect(renders.get("head")).toBe(frozen!.head);
    expect(renders.get("root")).toBe(frozen!.root);
    // Every node renders a small constant number of times, however many chunks arrive.
    const total = [...renders.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(renders.size * 6);
    unmount();
  });

  test("interactive components are locked until the stream is done (OpenUI parity)", () => {
    const src = `root = Stack(b, f)\nb = Button("Approve")\nf = FollowUps(["Next"])\n`;
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={src} streaming />);
    expect((host.querySelector(".gistui-button") as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector(".gistui-followup") as HTMLButtonElement).disabled).toBe(true);
    rerender(<GistUI library={ui} source={src} streaming={false} />);
    expect((host.querySelector(".gistui-button") as HTMLButtonElement).disabled).toBe(false);
    unmount();
  });

  test("lockUntil=ready unlocks a node as soon as its statement is complete", () => {
    const src = `root = Stack(b, rest)\nb = Button("Approve")\nrest = Text("more is com`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} streaming lockUntil="ready" />);
    expect((host.querySelector(".gistui-button") as HTMLButtonElement).disabled).toBe(false);
    unmount();
  });

  test("buttons and follow-ups send actions", async () => {
    const actions: GistUIAction[] = [];
    const src = `root = Stack(b, go, f)\nb = Button("Approve")\ngo = Button("Save", do:[@send("saved")])\nf = FollowUps(["Compare with Q2"])\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    act(() => (host.querySelectorAll(".gistui-button")[0] as HTMLElement).click());
    await act(async () => (host.querySelectorAll(".gistui-button")[1] as HTMLElement).click());
    act(() => (host.querySelector(".gistui-followup") as HTMLElement).click());
    expect(actions[0]).toEqual({ type: "send", message: "Approve", nodeId: "b" });
    // `do:` steps run in the runtime; @send reaches the host as a send.
    expect(actions[1]).toEqual({ type: "send", message: "saved", nodeId: "go" });
    expect(actions[2]).toEqual({ type: "send", message: "Compare with Q2", nodeId: "f" });
    unmount();
  });

  test("while streaming, data that has not arrived shows a placeholder, not \"No data\"", () => {
    const src = `root = Stack(Table(t), Stats(k))\n`;
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={src} streaming />);
    expect(q(host, '.gistui-skeleton[data-expected="Table"]')).toHaveLength(1);
    expect(q(host, '.gistui-skeleton[data-expected="Stats"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("No data");
    rerender(<GistUI library={ui} source={src} streaming={false} />);
    expect(host.textContent).toContain("No data");
    unmount();
  });

  test("tables sort and page", () => {
    const rows = Array.from({ length: 15 }, (_, i) => `|r${i}|${(i * 7) % 15}`).join("\n");
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Table(t, sort)\nt = |Name|Score\n${rows}\n`} />);
    expect(q(host, "tbody tr")).toHaveLength(10);
    expect(host.querySelector(".gistui-table__pager")!.textContent).toContain("1–10 of 15");
    act(() => (q(host, ".gistui-table__sort")[1] as HTMLElement).click());
    expect(q(host, "tbody tr td")[1]!.textContent).toBe("0");
    unmount();
  });

  test("radio groups render every option, with the initial value checked", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = RadioGroup("plan", "Plan", ["Free", "Pro"], hints:["$0", "$12"], value:"Pro", v:cards)\n`} />);
    const items = q(host, ".gistui-choice__item");
    expect(items).toHaveLength(2);
    expect(items[1]!.getAttribute("data-state")).toBe("checked");
    expect(host.textContent).toContain("$12");
    unmount();
  });

  test("tab labels reserve their bold width, and the scroll area wraps the list", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Tabs(a, b)\na = Tab("Overview", "Hello")\nb = Tab("Details", "More")\n`} />);
    expect(q(host, ".gistui-tabs__label")[0]!.getAttribute("data-text")).toBe("Overview");
    expect(q(host, ".gistui-tabs .gistui-scroll")).toHaveLength(1);
    unmount();
  });

  test("tables: pageSize sets the page, sortable limits sorting, order sorts first", () => {
    const rows = Array.from({ length: 15 }, (_, i) => `|r${i}|${(i * 7) % 15}`).join("\n");
    const src = `root = Table(t, pageSize:50, sortable:["Score"], order:"-Score")\nt = |Name|Score\n${rows}\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    expect(q(host, "tbody tr")).toHaveLength(15);
    expect(host.querySelector(".gistui-table__pager")).toBeNull();
    expect(q(host, ".gistui-table__sort")).toHaveLength(1);
    expect(q(host, ".gistui-table__sort")[0]!.textContent).toBe("Score");
    expect(q(host, "tbody tr td")[1]!.textContent).toBe("14");
    unmount();
  });

  test("tabs render labels from their Tab children", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Tabs(a, b)\na = Tab("Overview", "Hello")\nb = Tab("Details", "More")\n`} />);
    const triggers = [...q(host, '[data-part="trigger"]')].map((t) => t.textContent);
    expect(triggers).toEqual(["Overview", "Details"]);
    unmount();
  });

  test("an error in one section does not break the others", () => {
    const Boom = defineComponent({
      name: "Boom",
      props: {},
      component: () => {
        throw new Error("kaput");
      },
    });
    const Hello = defineComponent({ name: "Hello", args: ["name"], props: { name: { type: "string" } }, component: ({ props }) => <p className="hello">Hi {String(props.name)}</p> });
    const lib = createLibrary({ components: [Boom, Hello, { spec: ui.core.get("Stack")!.spec, component: ui.components.get("Stack")! }] });
    const origError = console.error;
    console.error = () => {};
    const { host, unmount } = mount(<GistUI library={lib} source={`root = Stack(a, b)\na = Boom()\nb = Hello("Ann")\n`} />);
    console.error = origError;
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("kaput");
    expect(host.querySelector(".hello")!.textContent).toBe("Hi Ann");
    unmount();
  });

  test("extend swaps one renderer and keeps the schema and prompt", () => {
    const lib = ui.extend({ Header: ({ props }) => <h1 className="mine">{String(props.title)}</h1> });
    expect(lib.prompt().text).toBe(ui.prompt().text);
    const { host, unmount } = mount(<GistUI library={lib} source={`root = Header("Custom")\n`} />);
    expect(host.querySelector("h1.mine")!.textContent).toBe("Custom");
    unmount();
  });

  test("a bare `import \"@gistui/react/prompt\"` survives tree-shaking: the entry is a declared side effect", async () => {
    // With `sideEffects: false`, production bundlers drop the import and `ui.prompt()` throws.
    const pkg = (await import("../package.json")).default as { sideEffects: unknown; exports: Record<string, Record<string, string>> };
    const entry = pkg.exports["./prompt"]!;
    expect(pkg.sideEffects).toEqual(expect.arrayContaining([entry["gistui-source"], entry.import]));
  });

  test("defineComponent accepts a Zod schema (Standard JSON Schema)", () => {
    const Badge = defineComponent({
      name: "Badge",
      args: ["text"],
      props: z.object({ text: z.string(), color: z.enum(["red", "blue"]).optional() }),
      component: ({ props }) => <span className="badge" data-color={String(props.color)}>{String(props.text)}</span>,
    });
    const lib = createLibrary({ components: [Badge] });
    expect(lib.prompt().text).toContain("Badge(text, color:red|blue)");
    const { host, unmount } = mount(<GistUI library={lib} source={`root = Badge("New", color:blue)\n`} />);
    expect(host.querySelector(".badge")!.getAttribute("data-color")).toBe("blue");
    unmount();
  });

  test("reads a ReadableStream once, even under StrictMode", async () => {
    const chunks = DASHBOARD.match(/[\s\S]{1,17}/g)!;
    const stream = new ReadableStream<string>({
      async pull(c) {
        const next = chunks.shift();
        if (next === undefined) c.close();
        else {
          await new Promise((r) => setTimeout(r, 0));
          c.enqueue(next);
        }
      },
    });
    let errors = null as unknown[] | null;
    const { host, unmount } = mount(
      <StrictMode>
        <GistUI library={ui} stream={stream} onError={(e) => (errors = e)} />
      </StrictMode>,
    );
    for (let i = 0; i < 200 && errors === null; i++) await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(errors).toEqual([]);
    expect(q(host, '[data-gistui="Stat"]')).toHaveLength(2);
    unmount();
  });
});

describe("forms and dialogs", () => {
  const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
  const errors = (host: HTMLElement) => Array.from(host.querySelectorAll(".gistui-field__error")).map((e) => e.textContent);
  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  test("validates on submit, then submits the values with a readable message", () => {
    const actions: GistUIAction[] = [];
    const src = `root = Form("contact", Input("email", "Email", type:email, required), Input("site", "Website", type:url, protocols:["https"]), Button("Send"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    click(host.querySelector('button[type="submit"]'));
    expect(errors(host)).toEqual(["Email is required"]);
    expect(actions).toHaveLength(0);
    const [email, site] = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    type(email!, "ada@example.com");
    type(site!, "http://example.com");
    click(host.querySelector('button[type="submit"]'));
    expect(errors(host)).toEqual(["Enter a valid URL starting with https://"]);
    type(site!, "https://example.com");
    click(host.querySelector('button[type="submit"]'));
    expect(actions[0]).toMatchObject({ type: "submit", form: "contact", partial: false, values: { email: "ada@example.com", site: "https://example.com" } });
    expect((actions[0] as { message: string }).message).toContain("- Email: ada@example.com");
    unmount();
  });

  test("useGistField: your own input joins the Form: required error, bind:$var, typed submit", () => {
    const actions: GistUIAction[] = [];
    function MyInput(p: ComponentProps) {
      const field = useGistField(p);
      return (
        <label className="my-input">
          {field.label}
          <input name={field.name} value={String(field.value ?? "")} disabled={field.locked} aria-invalid={field.error ? true : undefined} onChange={(e) => field.setValue(e.target.value)} />
          {field.error && <p className="my-error">{field.error}</p>}
        </label>
      );
    }
    const lib = ui.extend({ Input: MyInput });
    const src = `$email = ""\nroot = Form("join", Input("email", "Email", type:email, required, bind:$email), Button("Join"))\n`;
    const { host, unmount } = mount(<GistUI library={lib} source={src} onAction={(a) => actions.push(a)} />);
    const input = host.querySelector<HTMLInputElement>(".my-input input")!;
    expect(input.name).toBe("email");
    click(host.querySelector('button[type="submit"]'));
    expect(host.querySelector(".my-error")!.textContent).toBe("Email is required");
    expect(actions).toHaveLength(0);
    // React's controlled input: set the value the way a user's typing does.
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "ada@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(host.querySelector('button[type="submit"]'));
    expect(actions[0]).toMatchObject({ type: "submit", form: "join", values: { email: "ada@example.com" } });
    expect(host.querySelector(".my-error")).toBeNull();
    unmount();
  });

  test("a submit carries a stable formId, a unique submissionId, typed values and a JSON Schema", () => {
    const actions: GistUIAction[] = [];
    const src = [
      `root = Form("profile", Card(Input("email", "Email", type:email, required), Input("age", "Age", type:number, min:18, max:120), Input("site", "Site", type:url, protocols:["https"])), Select("plan", "Plan", ["Free", "Pro"]), RadioGroup("role", "Role", ["Viewer", "Editor"], value:"Editor", required), CheckboxGroup("topics", "Topics", ["AI", "Data"], value:["AI"], min:1), TagInput("cc", "CC", type:email), Checkbox("terms", "Terms", required, checked), Switch("news", "News"), Button("Save"))`,
      "",
    ].join("\n");
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    const input = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    type(input("email"), "ada@example.com");
    type(input("age"), "36");
    click(host.querySelector('button[type="submit"]'));
    click(host.querySelector('button[type="submit"]'));
    const subs = actions.filter((a) => a.type === "submit") as Extract<GistUIAction, { type: "submit" }>[];
    expect(subs.length).toBe(2);
    const [a, b] = subs as [(typeof subs)[0], (typeof subs)[0]];
    expect(a.formId).toMatch(/^form_[0-9a-f]{16}$/);
    expect(b.formId).toBe(a.formId);
    expect(a.submissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.submissionId).not.toBe(a.submissionId);
    expect(host.querySelector("form")?.getAttribute("data-form-id")).toBe(a.formId);
    expect(a.values).toEqual({ email: "ada@example.com", age: 36, role: "Editor", topics: ["AI"], cc: [], terms: true, news: false });
    expect(a.fields.map((f) => [f.name, f.component, f.type])).toEqual([
      ["email", "Input", "string"], ["age", "Input", "number"], ["site", "Input", "string"], ["plan", "Select", "string"], ["role", "RadioGroup", "string"],
      ["topics", "CheckboxGroup", "array"], ["cc", "TagInput", "array"], ["terms", "Checkbox", "boolean"], ["news", "Switch", "boolean"],
    ]);
    const props = a.schema.properties as Record<string, Record<string, unknown>>;
    expect(props.email).toMatchObject({ type: "string", format: "email", title: "Email", minLength: 1 });
    expect(props.age).toMatchObject({ type: "number", minimum: 18, maximum: 120 });
    expect(props.site).toMatchObject({ type: "string", format: "uri", pattern: "^(?:https)://" });
    expect(props.plan).toMatchObject({ type: "string", enum: ["Free", "Pro"] });
    expect(props.role).toMatchObject({ type: "string", enum: ["Viewer", "Editor"], default: "Editor" });
    expect(props.topics).toMatchObject({ type: "array", items: { type: "string", enum: ["AI", "Data"] }, minItems: 1 });
    expect(props.cc).toMatchObject({ type: "array", items: { type: "string", format: "email" } });
    expect(props.terms).toMatchObject({ type: "boolean", const: true });
    expect(a.schema.required).toEqual(["email", "role", "terms", "news"]);

    // The values validate against the schema with a standard JSON Schema validator; bad data does not.
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(a.schema);
    expect(validate(a.values)).toBe(true);
    expect(validate({ ...a.values, age: "36", site: "http://x.com", extra: 1 })).toBe(false);
    unmount();
  });

  test("an explicit id: is the formId; the same fields give the same fingerprint", () => {
    const actions: GistUIAction[] = [];
    const src = `root = Stack(a, b)\na = Form("x", Input("q", "Q"), id:"search-v1")\nb = Form("x", Input("q", "Q"))\n`;
    const src2 = `root = Stack(c)\nc = Form("x", Input("q", "Q"))\n`;
    const one = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    const forms = one.host.querySelectorAll("form");
    expect(forms[0]?.getAttribute("data-form-id")).toBe("search-v1");
    const printed = forms[1]?.getAttribute("data-form-id");
    one.unmount();
    const two = mount(<GistUI library={ui} source={src2} />);
    expect(two.host.querySelector("form")?.getAttribute("data-form-id")).toBe(printed!);
    two.unmount();
  });

  test("every form can submit: a Submit button is added when the program has none", () => {
    const src = `root = Form("f", Input("q", "Query"), draft:"Save draft")\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    const buttons = Array.from(host.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["Save draft", "Submit"]);
    unmount();
  });

  test("a draft skips required fields but still checks what is filled in", () => {
    const actions: GistUIAction[] = [];
    const src = `root = Form("f", Input("name", "Name", required), Input("email", "Email", type:email), Button("Save draft", v:secondary, type:draft), Button("Save"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    const [, email] = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    type(email!, "nope");
    click(host.querySelector("[data-draft]"));
    expect(errors(host)).toEqual(["Enter a valid email address, like name@example.com"]);
    type(email!, "ada@example.com");
    click(host.querySelector("[data-draft]"));
    expect(actions[0]).toMatchObject({ type: "submit", partial: true });
    // Empty optional (and, in a draft, empty required) fields are left out of the typed values.
    expect((actions[0] as { values: unknown }).values).toEqual({ email: "ada@example.com" });
    unmount();
  });

  test("step forms validate the current step before moving on", () => {
    const actions: GistUIAction[] = [];
    const src = `root = Form("s", Step("Account", Input("email", "Email", type:email, required)), Step("Profile", Input("name", "Name", required)), submit:"Create")\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    const next = () => host.querySelector<HTMLElement>('button[type="submit"]');
    expect(next()?.textContent).toBe("Continue");
    click(next());
    expect(errors(host)).toEqual(["Email is required"]);
    type(host.querySelector<HTMLInputElement>('input[name="email"]')!, "ada@example.com");
    click(next());
    expect(host.querySelector('[data-step="1"]')?.hasAttribute("hidden")).toBe(false);
    expect(next()?.textContent).toBe("Create");
    type(host.querySelector<HTMLInputElement>('input[name="name"]')!, "Ada");
    click(next());
    expect(actions[0]).toMatchObject({ type: "submit", values: { email: "ada@example.com", name: "Ada" } });
    unmount();
  });

  test("a button opens a dialog; close and a valid submit close it", async () => {
    const src = `root = Button("Invite", opens:dlg)\ndlg = Dialog("Invite", Form("i", Input("email", "Email", type:email, required), Buttons(Button("Send"), Button("Cancel", v:ghost, close))))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    expect(host.querySelector(".gistui-dialog")).toBeNull();
    click(host.querySelector(".gistui-button"));
    expect(host.querySelector(".gistui-dialog")).not.toBeNull();
    click(Array.from(host.querySelectorAll(".gistui-dialog button")).find((b) => b.textContent === "Cancel"));
    await act(() => new Promise((r) => setTimeout(r, 260)));
    expect(host.querySelector(".gistui-dialog")).toBeNull();
    click(host.querySelector(".gistui-button"));
    type(host.querySelector<HTMLInputElement>('.gistui-dialog input[name="email"]')!, "ada@example.com");
    click(host.querySelector('.gistui-dialog button[type="submit"]'));
    await act(() => new Promise((r) => setTimeout(r, 260)));
    expect(host.querySelector(".gistui-dialog")).toBeNull();
    unmount();
  });
});

describe("runtime: state, expressions, queries and actions", () => {
  const text = (host: HTMLElement) => host.textContent ?? "";
  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

  test("a bound input drives computed text elsewhere", () => {
    const src = `$name = "Ada"\nroot = Stack(i, t)\ni = Input("name", "Name", bind:$name)\nt = Text("Hello " + $name)\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    expect(text(host)).toContain("Hello Ada");
    const input = host.querySelector<HTMLInputElement>('input[name="name"]')!;
    expect(input.value).toBe("Ada");
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "Grace");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(text(host)).toContain("Hello Grace");
    unmount();
  });

  test("@each renders components per item, and a ternary switches with state", async () => {
    const src = [
      `$show = false`,
      `root = Stack(list, body, b)`,
      `rows = [{id:"a", name:"Alpha"}, {id:"b", name:"Beta"}]`,
      `list = @each(rows, r => Card(Header(r.name)))`,
      `body = $show ? Text("Shown") : Text("Hidden")`,
      `b = Button("Toggle", do:[@set($show, !$show)])`,
      ``,
    ].join("\n");
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    expect([...host.querySelectorAll(".gistui-card")].map((c) => c.textContent)).toEqual(["Alpha", "Beta"]);
    expect(text(host)).toContain("Hidden");
    await act(async () => host.querySelector<HTMLElement>(".gistui-button")!.click());
    await tick();
    expect(text(host)).toContain("Shown");
    unmount();
  });

  test("a query calls a tool, renders its rows, and re-runs when a bound select changes", async () => {
    const calls: unknown[] = [];
    const tools = {
      list_orders: async ({ status }: { status: string }) => {
        calls.push(status);
        return status === "open" ? [{ Order: "#1", Total: 10 }] : [{ Order: "#2", Total: 20 }, { Order: "#3", Total: 30 }];
      },
    };
    const src = `$status = "open"\nroot = Stack(t, n)\norders = @query("list_orders", {status:$status}, default:[])\nt = Table(orders)\nn = Text("Orders: " + @count(orders))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} tools={tools} />);
    expect(text(host)).toContain("Orders: 0");
    await tick();
    expect(calls).toEqual(["open"]);
    expect(text(host)).toContain("#1");
    expect(text(host)).toContain("Orders: 1");
    unmount();
  });

  test("do: actions run in order; @send and @emit reach onAction; a missing tool is an error", async () => {
    const actions: GistUIAction[] = [];
    const src = [
      `$n = 0`,
      `root = Stack(t, go, bad)`,
      `t = Text("Count " + $n)`,
      `go = Button("Go", do:[@set($n, $n + 1), @send("Now " + $n), @emit("counted", {n:$n})])`,
      `save = @mutation("save", {})`,
      `bad = Button("Bad", v:secondary, do:[@run(save), @send("never")])`,
      ``,
    ].join("\n");
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    await act(async () => host.querySelectorAll<HTMLElement>(".gistui-button")[0]!.click());
    await tick();
    expect(text(host)).toContain("Count 1");
    expect(actions).toEqual([
      { type: "send", message: "Now 1", nodeId: "go" },
      { type: "emit", event: "counted", payload: { n: 1 }, nodeId: "go" },
    ]);
    await act(async () => host.querySelectorAll<HTMLElement>(".gistui-button")[1]!.click());
    await tick();
    expect(actions[2]).toMatchObject({ type: "error", code: "tool-not-found", nodeId: "bad" });
    expect(actions).toHaveLength(3);
    unmount();
  });

  test("tabs bound to state select by label, both ways", async () => {
    const changes: [string, unknown][] = [];
    const src = `$tab = "Details"\nroot = Stack(tabs, t)\ntabs = Tabs(Tab("Overview", "A"), Tab("Details", "B"), bind:$tab)\nt = Text("On " + $tab)\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onStateChange={(n, v) => changes.push([n, v])} />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Details");
    act(() => host.querySelector<HTMLElement>('[role="tab"]')!.click());
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Overview");
    expect(text(host)).toContain("On Overview");
    expect(changes).toEqual([["tab", "Overview"]]);
    unmount();
  });
});

describe("autofix", () => {
  // An unknown prop, a misspelled component, a reference to nothing, and a statement never placed.
  const BROKEN = `root = Page(Card(Header("Hi"), colour:"red"), Txt("hello"), missing)\nnote = Callout("Placed by autofix")\n`;
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i++) await act(() => new Promise((r) => setTimeout(r, 5)));
  };

  test("a stream that ends with mistakes is repaired in code and shown repaired; onError reports what is left", async () => {
    const fixes: { changes: string[] }[] = [];
    const errors: unknown[][] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={BROKEN} onAutofix={(r) => fixes.push(r)} onError={(e) => errors.push(e)} />);
    const card = host.querySelector(".gistui-card");
    await until(() => fixes.length > 0);
    // Repaired in place: what the repair did not touch keeps its element.
    expect(host.querySelector(".gistui-card")).toBe(card);
    expect(fixes[0]!.changes.length).toBeGreaterThan(0);
    // The statement nothing used is placed on the page; the rest still renders.
    expect(host.querySelector(".gistui-callout")?.textContent).toContain("Placed by autofix");
    expect(host.querySelector(".gistui-text")?.textContent).toBe("hello");
    expect(host.querySelector(".gistui-card .gistui-header__title")?.textContent).toBe("Hi");
    expect(errors).toEqual([[]]);
    unmount();
  });

  test("autofix={false} keeps the program as written and reports its errors", async () => {
    const fixes: unknown[] = [];
    const errors: { code: string }[][] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={BROKEN} autofix={false} onAutofix={(r) => fixes.push(r)} onError={(e) => errors.push(e)} />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(fixes).toEqual([]);
    // Shown as written: the statement nothing uses stays off the page.
    expect(host.querySelector(".gistui-callout")).toBeNull();
    expect(errors[0]!.map((e) => e.code)).toEqual(expect.arrayContaining(["unknown-prop", "unresolved-ref", "unreachable"]));
    unmount();
  });

  test("a valid program is not touched", async () => {
    const fixes: unknown[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Card(Header("Fine"))\n`} onAutofix={(r) => fixes.push(r)} />);
    const card = host.querySelector(".gistui-card");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(fixes).toEqual([]);
    expect(host.querySelector(".gistui-card")).toBe(card);
    unmount();
  });
});

describe("lazy chunks", () => {
  test("a failed import is retried, and a later load can still succeed", async () => {
    const { lazyModule } = await import("../src/hooks");
    let calls = 0;
    let fail = 5;
    const mod = lazyModule(async () => {
      calls++;
      if (fail-- > 0) throw new Error("Failed to fetch dynamically imported module");
      return "ok";
    }, 1);
    await expect(mod.load()).rejects.toThrow("Failed to fetch");
    expect(calls).toBe(2); // first try + 1 retry
    fail = 0;
    expect(await mod.load()).toBe("ok");
    expect(mod.current).toBe("ok");
  });
});
