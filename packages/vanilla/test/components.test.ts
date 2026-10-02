/**
 * Components keep their elements: a redraw patches attributes and text, so focus, scroll position
 * and playing media survive it; bound controls follow their `$var`; nothing outlives its component.
 */
import { describe, expect, test } from "bun:test";
import type { Runtime } from "@gistui/core";
import { mount, type DomRenderer } from "../src/index";
import { ui } from "../src/ui";
import { zagParts } from "../src/ui/zag";

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
};
/**
 * Mounts a program in a host attached to the document (focus needs a connected element). With
 * `attached: false` the host stays out of it: happy-dom loads the page of a connected <iframe>.
 */
function show(source: string, options: Partial<Parameters<typeof mount>[1]> = {}, renderers: Readonly<Record<string, DomRenderer>> = {}, attached = true) {
  const host = document.createElement("div");
  if (attached) document.body.append(host);
  // Every renderer is wrapped, to reach the runtime (state and its subscribers) from a test.
  let runtime!: Runtime;
  const probe = ui.extend(
    Object.fromEntries(
      [...ui.extend(renderers).components].map(([name, render]): [string, DomRenderer] => [
        name,
        (ctx) => {
          runtime = ctx.runtime;
          return render(ctx);
        },
      ]),
    ),
  );
  const view = mount(host, { library: probe, source, ...options });
  return {
    host,
    view,
    /** What `@set($name, value)` does. */
    set: (name: string, value: unknown) => runtime.setState(name, value),
    /** How many controls are subscribed to `$name`. */
    subscribers: (name: string) => (runtime as unknown as { subs: Map<string, Set<unknown>> }).subs.get(`$${name}`)?.size ?? 0,
    $: <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!,
    $$: <T extends Element = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)],
    done() {
      view.destroy();
      host.remove();
    },
  };
}
/** Element identity as a boolean: a failed `toBe` on two elements prints the whole document. */
const same = (a: unknown, b: unknown) => a === b;
const focused = (el: Element) => document.activeElement === el;
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("nothing is drawn after destroy (D20)", () => {
  const settle = () => new Promise((r) => setTimeout(r, 150));
  // A new instance of a component module: its lazy chunk (chart engine, form schema, KaTeX, Mermaid)
  // is "not loaded yet" again, whatever ran before this test.
  let n = 0;
  const fresh = <M>(path: string): Promise<M> => import(`${path}?fresh=${++n}`) as Promise<M>;

  test("a Chart destroyed before its chunk loads creates no widget", async () => {
    const { Chart } = await fresh<typeof import("../src/ui/data")>("../src/ui/data");
    const source = `root = Chart(sales, type:bar)\nsales = |Month|Revenue\n|Jan|10\n|Feb|14\n`;
    const s = show(source, {}, { Chart });
    const chart = s.$('[data-gistui="Chart"]');
    expect(chart.querySelector("svg") === null).toBe(true);
    s.done();
    await settle();
    expect(chart.querySelector("svg") === null).toBe(true);
    // A chart that is still there does get its widget.
    const again = await fresh<typeof import("../src/ui/data")>("../src/ui/data");
    const live = show(source, {}, { Chart: again.Chart });
    expect(live.host.querySelector("[data-gistui='Chart'] svg") === null).toBe(true);
    await until(() => live.host.querySelector("[data-gistui='Chart'] svg") !== null);
    expect(live.host.querySelector("[data-gistui='Chart'] svg") !== null).toBe(true);
    live.done();
  });

  test("a Form destroyed before the schema chunk loads is not drawn again", async () => {
    const { Form } = await fresh<typeof import("../src/ui/form")>("../src/ui/form");
    const s = show(`root = Form("f", Input("a", "A"))\n`, {}, { Form });
    const form = s.$("form");
    expect(form.hasAttribute("data-form-id")).toBe(false);
    s.done();
    await settle();
    expect(form.hasAttribute("data-form-id")).toBe(false);
    const again = await fresh<typeof import("../src/ui/form")>("../src/ui/form");
    const live = show(`root = Form("f", Input("a", "A"))\n`, {}, { Form: again.Form });
    await until(() => live.$("form").hasAttribute("data-form-id"));
    expect(live.$("form").getAttribute("data-form-id")).toMatch(/^form_/);
    live.done();
  });

  test("Math and Diagram destroyed before KaTeX and Mermaid load stay as they were", async () => {
    // Mermaid itself is loaded (so the component's own import resolves soon), with `render` counted.
    type Mermaid = { render: (...args: unknown[]) => Promise<{ svg: string }>; initialize: (o: unknown) => void };
    const loaded = (await import("mermaid")) as unknown as { default?: Mermaid } & Mermaid;
    const mermaid = loaded.default ?? loaded;
    const { render, initialize } = mermaid;
    let renders = 0;
    mermaid.initialize = () => {};
    mermaid.render = async () => {
      renders++;
      return { svg: "<svg></svg>" };
    };
    try {
      const source = `root = Page(Math("x^2"), Diagram("graph TD; A-->B"))\n`;
      const extras = await fresh<typeof import("../src/ui/extras")>("../src/ui/extras");
      const s = show(source, {}, { Math: extras.MathView, Diagram: extras.Diagram });
      const math = s.$(".gistui-math");
      const diagram = s.$(".gistui-diagram");
      expect(math.querySelector("math") === null).toBe(true);
      s.done();
      await settle();
      expect(math.querySelector("math") === null).toBe(true);
      expect(renders).toBe(0);
      expect(diagram.querySelector("svg") === null).toBe(true);
      const again = await fresh<typeof import("../src/ui/extras")>("../src/ui/extras");
      const live = show(source, {}, { Math: again.MathView, Diagram: again.Diagram });
      await until(() => live.host.querySelector(".gistui-math math") !== null && live.host.querySelector(".gistui-diagram svg") !== null);
      expect(renders).toBe(1);
      live.done();
    } finally {
      mermaid.render = render;
      mermaid.initialize = initialize;
    }
  });
});

describe("Table keeps its controls (D5)", () => {
  const rows = Array.from({ length: 14 }, (_, i) => `|Item ${i + 1}|${(i * 7) % 10}|${i % 2 ? "Healthy" : "At risk"}`).join("\n");
  const source = `root = Table(rows, sort, search, filter:["Status"], tags:["Status"])\nrows = |Name|Score|Status\n${rows}\n`;

  test("typing in the search box keeps the input, its toolbar and the focus", async () => {
    const s = show(source);
    const search = s.$<HTMLInputElement>(".gistui-table__search input");
    const toolbar = s.$(".gistui-table__toolbar");
    search.focus();
    expect(focused(search)).toBe(true);
    type(search, "Item 1");
    expect(same(s.$(".gistui-table__toolbar"), toolbar)).toBe(true);
    expect(search.isConnected).toBe(true);
    expect(focused(search)).toBe(true);
    expect(s.$$("tbody tr").length).toBe(6);
    type(search, "Item 12");
    expect(focused(search)).toBe(true);
    expect(s.$$("tbody tr").length).toBe(1);
    s.done();
  });

  test("sort headers, pager buttons and filter chips are the same elements after a click", async () => {
    const s = show(source);
    const sort = s.$$<HTMLButtonElement>(".gistui-table__sort")[1]!;
    sort.focus();
    sort.click();
    expect(same(s.$$(".gistui-table__sort")[1], sort)).toBe(true);
    expect(focused(sort)).toBe(true);
    expect(sort.getAttribute("data-sort")).toBe("asc");
    expect(sort.closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    sort.click();
    expect(sort.getAttribute("data-sort")).toBe("desc");
    expect(sort.closest("th")!.getAttribute("aria-sort")).toBe("descending");

    const next = s.$<HTMLButtonElement>('.gistui-page-btn[aria-label="Next page"]');
    const two = s.$$<HTMLButtonElement>(".gistui-page-btn").find((b) => b.textContent === "2")!;
    next.focus();
    next.click();
    expect(same(s.$('.gistui-page-btn[aria-label="Next page"]'), next)).toBe(true);
    expect(focused(next)).toBe(true);
    expect(next.disabled).toBe(true);
    expect(same(s.$$(".gistui-page-btn").find((b) => b.textContent === "2"), two)).toBe(true);
    expect(two.getAttribute("aria-current")).toBe("page");
    expect(s.$(".gistui-table__pager span").textContent).toBe("11–14 of 14");

    const chip = s.$$<HTMLButtonElement>(".gistui-chip")[0]!;
    chip.focus();
    chip.click();
    expect(same(s.$$(".gistui-chip")[0], chip)).toBe(true);
    expect(focused(chip)).toBe(true);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(s.$$("tbody tr").length).toBe(7);
    expect(s.$(".gistui-table__pager") === null).toBe(true);
    s.done();
  });
});

describe("Table memo (performance)", () => {
  test("a redraw that shows the same rows keeps the row elements", () => {
    const source = `root = Table(rows, sort, search)\nrows = |Name|Score\n|A|1\n|B|2\n`;
    const s = show(source);
    const row = s.$("tbody tr");
    const search = s.$<HTMLInputElement>(".gistui-table__search input");
    // The table is drawn again with the same rows (an input event that leaves the query empty).
    type(search, "");
    expect(same(s.$("tbody tr"), row)).toBe(true);
    // A sort click changes the rows shown: they are rebuilt, the header button is not.
    s.$<HTMLButtonElement>(".gistui-table__sort").click();
    s.$<HTMLButtonElement>(".gistui-table__sort").click();
    expect(same(s.$("tbody tr"), row)).toBe(false);
    expect(s.$$("tbody tr").map((tr) => tr.textContent)).toEqual(["B2", "A1"]);
    expect(same(s.$(".gistui-table__search input"), search)).toBe(true);
    s.done();
  });
});

describe("groups and tabs keep their controls (D6)", () => {
  test("RadioGroup: focusing a radio keeps the input (and the focus); picking patches the items", async () => {
    const s = show(`root = RadioGroup("plan", "Plan", ["Free", "Pro", "Team"], value:"Pro", v:cards, images:["https://example.com/free.png"])\n`);
    await until(() => s.host.querySelector('[data-scope="radio-group"][data-part="item"]') !== null);
    const items = s.$$('[data-scope="radio-group"][data-part="item"]');
    const inputs = s.$$<HTMLInputElement>('input[type="radio"]');
    const img = s.$("img");
    inputs[0]!.focus();
    await tick();
    await tick();
    expect(same(s.$('input[type="radio"]'), inputs[0])).toBe(true);
    expect(focused(inputs[0]!)).toBe(true);
    inputs[2]!.click();
    await until(() => items[2]!.getAttribute("data-state") === "checked");
    expect(s.$$('[data-scope="radio-group"][data-part="item"]').every((el, i) => el === items[i])).toBe(true);
    expect(s.$$('input[type="radio"]').every((el, i) => el === inputs[i])).toBe(true);
    expect(items.map((i) => i.getAttribute("data-state"))).toEqual(["unchecked", "unchecked", "checked"]);
    expect(inputs.map((i) => i.checked)).toEqual([false, false, true]);
    // The option's picture is not loaded again by a redraw.
    expect(same(s.$("img"), img)).toBe(true);
    s.done();
  });

  test("CheckboxGroup: toggling keeps the input and its focus", async () => {
    const s = show(`root = CheckboxGroup("addons", "Add-ons", ["SSO", "Audit", "SLA"], max:2)\n`);
    await until(() => s.host.querySelector('input[name="addons"]') !== null);
    const inputs = s.$$<HTMLInputElement>('input[name="addons"]');
    inputs[1]!.focus();
    inputs[1]!.click();
    expect(s.$$('input[name="addons"]').every((el, i) => el === inputs[i])).toBe(true);
    expect(focused(inputs[1]!)).toBe(true);
    expect(inputs.map((i) => i.checked)).toEqual([false, true, false]);
    expect(inputs[1]!.closest("label")!.getAttribute("data-state")).toBe("checked");
    inputs[0]!.click();
    // `max:2` is reached: the remaining option is disabled, in place.
    expect(inputs.map((i) => i.disabled)).toEqual([false, false, true]);
    expect(inputs[2]!.closest("label")!.hasAttribute("data-disabled")).toBe(true);
    inputs[0]!.click();
    expect(inputs.map((i) => [i.checked, i.disabled])).toEqual([[false, false], [true, false], [false, false]]);
    s.done();
  });

  test("Tabs: a clicked tab is the same element, so arrow keys go on from it", async () => {
    const s = show(`root = Tabs(Tab(Text("one"), label:"One"), Tab(Text("two"), label:"Two", icon:star), Tab(Text("three"), label:"Three"))\n`);
    const tabs = s.$$<HTMLButtonElement>('[role="tab"]');
    tabs[1]!.focus();
    tabs[1]!.click();
    expect(s.$$('[role="tab"]').every((el, i) => el === tabs[i])).toBe(true);
    expect(focused(tabs[1]!)).toBe(true);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(focused(tabs[2]!)).toBe(true);
    expect(s.$$('[role="tabpanel"]').map((p) => p.hasAttribute("hidden"))).toEqual([true, true, false]);
    tabs[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(focused(tabs[0]!)).toBe(true);
    s.done();
  });
});

describe("bound controls follow their $var (D7)", () => {
  test("Select, Combobox, RadioGroup, DatePicker and TimePicker show a value set from elsewhere", async () => {
    const s = show(
      `$v = "b"\n$d = "2026-10-01"\n$t = "09:00"\nroot = Page(Select("s", "S", ["a", "b", "c"], bind:$v), Combobox("c", "C", ["a", "b", "c"], bind:$v), RadioGroup("r", "R", ["a", "b", "c"], bind:$v), DatePicker("d", "D", bind:$d), TimePicker("t", "T", bind:$t))\n`,
    );
    const radioState = () => s.$$('[data-scope="radio-group"][data-part="item"]').map((i) => i.getAttribute("data-state"));
    const date = () => s.$<HTMLInputElement>('[data-gistui="DatePicker"] input[type="hidden"]')?.value;
    const time = () => s.$('[data-gistui="TimePicker"] [data-part="value-text"]')?.textContent;
    const selectText = () => s.$('[data-gistui="Select"] [data-scope="select"][data-part="value-text"]')?.textContent;
    const comboValue = () => s.$<HTMLInputElement>('[data-gistui="Combobox"] input[type="hidden"]')?.value;
    await until(() => selectText() === "b" && comboValue() === "b" && radioState().length === 3 && date() !== undefined && time() !== undefined);
    expect([selectText(), comboValue(), radioState(), date(), time()]).toEqual(["b", "b", ["unchecked", "checked", "unchecked"], "2026-10-01", "9:00 AM"]);
    s.set("v", "c");
    s.set("d", "2026-12-24");
    s.set("t", "14:30");
    await tick();
    await tick();
    expect([selectText(), comboValue(), radioState(), date(), time()]).toEqual(["c", "c", ["unchecked", "unchecked", "checked"], "2026-12-24", "2:30 PM"]);
    expect(s.$<HTMLSelectElement>('[data-gistui="Select"] select').value).toBe("c");
    expect(s.$<HTMLInputElement>('[data-gistui="DatePicker"] .gistui-dp__input').value).toContain("12/24/2026");
    // One subscription per control, released with it.
    expect(s.subscribers("v")).toBe(3);
    s.view.update({ source: `root = Text("gone")\n` });
    expect(s.subscribers("v")).toBe(0);
    s.done();
  });
});

describe("binding subscriptions are released (D15)", () => {
  test("Input and TextArea shown and hidden six times leave no subscribers behind", async () => {
    const s = show(`$show = true\n$x = "a"\nroot = Page(body)\nbody = $show ? Stack(Input("a", "A", bind:$x), TextArea("b", "B", bind:$x)) : Text("…")\n`);
    expect(s.subscribers("x")).toBe(2);
    for (let i = 0; i < 6; i++) {
      s.set("show", false);
      await tick();
      expect(s.subscribers("x")).toBe(0);
      s.set("show", true);
      await tick();
      expect(s.subscribers("x")).toBe(2);
    }
    s.set("x", "typed elsewhere");
    expect(s.$<HTMLInputElement>('input[name="a"]').value).toBe("typed elsewhere");
    expect(s.$<HTMLTextAreaElement>('textarea[name="b"]').value).toBe("typed elsewhere");
    s.done();
  });
});

describe("Button (D24b, S13)", () => {
  test("a Button with opens: is the element its parent sees; its Dialog opens inside the GistUI root", async () => {
    const s = show(
      `root = Page(Buttons(Button("Invite", opens:invite), Button("Ok")), Row(Button("More", opens:more)), accent:teal)\ninvite = Dialog("Invite", Text("Who?"), Button("Cancel", v:ghost, close))\nmore = Dialog("More", Text("…"))\n`,
    );
    expect(s.$$(".gistui-buttons > .gistui-button").map((b) => b.textContent)).toEqual(["Invite", "Ok"]);
    expect(s.$$(".gistui-row > .gistui-button").map((b) => b.textContent)).toEqual(["More"]);
    expect(s.$$(".gistui-buttons > *").length).toBe(2);
    const invite = s.$<HTMLButtonElement>(".gistui-buttons > .gistui-button");
    expect(invite.getAttribute("aria-haspopup")).toBe("dialog");
    expect(s.$("dialog") === null).toBe(true);
    invite.click();
    expect(s.$("dialog .gistui-dialog__title").textContent).toBe("Invite");
    expect(s.$<HTMLDialogElement>("dialog").open).toBe(true);
    // Not next to the button (its parent's selectors still see only buttons), but themed like it.
    expect(s.$$(".gistui-buttons > *").length).toBe(2);
    expect(s.$("dialog").closest(".gistui") !== null).toBe(true);
    expect(s.$("dialog").closest("[data-gistui-color]")!.getAttribute("data-gistui-color")).toBe("teal");
    s.$$<HTMLButtonElement>("dialog .gistui-button").find((b) => b.textContent === "Cancel")!.click();
    expect(s.$("dialog").hasAttribute("data-closing")).toBe(true);
    await until(() => s.host.querySelector("dialog") === null);
    expect(s.$("dialog") === null).toBe(true);
    // Open again, then the button goes away: so does its dialog.
    invite.click();
    expect(s.$("dialog") !== null).toBe(true);
    s.view.update({ source: `root = Text("gone")\n` });
    expect(s.$("dialog") === null).toBe(true);
    expect(s.$(".gistui").children.length).toBe(1);
    s.done();
  });

  test("a link Button is a plain link: a click runs no steps, sends nothing and closes nothing", async () => {
    const actions: unknown[] = [];
    const s = show(`root = Page(Button("Docs", href:"https://example.com/docs", do:[@send("clicked")]), Button("Plain", href:"https://example.com", close))\n`, { onAction: (a) => actions.push(a) });
    // The test page must not navigate.
    s.host.addEventListener("click", (e) => e.preventDefault());
    const links = s.$$<HTMLAnchorElement>("a.gistui-button");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com/docs", "https://example.com"]);
    for (const a of links) a.click();
    await tick();
    expect(actions).toEqual([]);
    s.done();
  });
});

describe("Form (D11, D23)", () => {
  test("a step form streamed after its Form: the wizard shows as soon as a Step arrives, and follows its title", async () => {
    let src = `$t = "Account"\nroot = Form("signup", s1, s2)\n`;
    const s = show(src, { streaming: true });
    expect(s.$("form").hasAttribute("data-wizard")).toBe(false);
    s.view.update({ source: (src += `s1 = Step($t, Input("name", "Name"))\n`) });
    expect(s.$("form").hasAttribute("data-wizard")).toBe(true);
    expect(s.$$(".gistui-stepper__label").map((e) => e.textContent)).toEqual(["Account"]);
    s.view.update({ source: (src += `s2 = Step("Plan", Input("plan", "Plan"))\n`) });
    expect(s.$$(".gistui-stepper__label").map((e) => e.textContent)).toEqual(["Account", "Plan"]);
    expect(s.$$(".gistui-form__step").map((e) => e.hasAttribute("hidden"))).toEqual([false, true]);
    expect(s.$("button[data-auto]").textContent).toBe("Continue");
    s.view.update({ streaming: false });
    await tick();
    expect(s.$$(".gistui-form__step").map((e) => e.querySelector("input") !== null)).toEqual([true, true]);
    s.set("t", "Your account");
    await tick();
    expect(s.$("legend").textContent).toBe("Your account");
    expect(s.$$(".gistui-stepper__label").map((e) => e.textContent)).toEqual(["Your account", "Plan"]);
    s.done();
  });

  test("Start over after success: shows the form as it first was, not the previous answers", async () => {
    const actions: any[] = [];
    const s = show(
      `root = Form("signup", Input("email", "Email"), TextArea("note", "Note"), Checkbox("terms", "I agree"), Switch("news", "Newsletter", checked), CheckboxGroup("addons", "Add-ons", ["SSO", "Audit"]), Slider("seats", "Seats", min:1, max:50, value:5), success:"Thanks!")\n`,
      { onAction: (a) => actions.push(a) },
    );
    await until(() => s.host.querySelector('input[name="addons"]') !== null && s.host.querySelector('input[name="seats"]') !== null);
    const email = s.$<HTMLInputElement>('input[name="email"]');
    type(email, "a@b.co");
    type(s.$<HTMLTextAreaElement>('textarea[name="note"]'), "hello");
    s.$<HTMLInputElement>('input[name="terms"]').click();
    s.$<HTMLInputElement>('input[name="news"]').click();
    s.$<HTMLInputElement>('input[name="addons"]').click();
    type(s.$<HTMLInputElement>('input[name="seats"]'), "20");
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => actions.length > 0);
    expect(actions[0].values).toEqual({ email: "a@b.co", note: "hello", terms: true, news: false, addons: ["SSO"], seats: 20 });
    expect(s.$(".gistui-form__done p").textContent).toBe("Thanks!");
    s.$$<HTMLButtonElement>(".gistui-form__done button").find((b) => b.textContent === "Start over")!.click();
    await tick();
    expect(same(s.$('input[name="email"]'), email)).toBe(true);
    const values = () => ({
      email: s.$<HTMLInputElement>('input[name="email"]').value,
      note: s.$<HTMLTextAreaElement>('textarea[name="note"]').value,
      terms: s.$<HTMLInputElement>('input[name="terms"]').checked,
      news: s.$<HTMLInputElement>('input[name="news"]').checked,
      addons: s.$$<HTMLInputElement>('input[name="addons"]').map((i) => i.checked),
      seats: s.$<HTMLInputElement>('input[name="seats"]').value,
      seatsShown: s.$(".gistui-slider__value").textContent,
    });
    expect(values()).toEqual({ email: "", note: "", terms: false, news: true, addons: [false, false], seats: "5", seatsShown: "5" });
    // A later redraw of the fields does not bring the old answers back.
    s.view.update({ lockUntil: "ready" });
    expect(values()).toEqual({ email: "", note: "", terms: false, news: true, addons: [false, false], seats: "5", seatsShown: "5" });
    s.done();
  });
});

describe("Zag options are reused and released (D18)", () => {
  /** Counts the elements of one tag created while `run` runs. */
  const created = async (tag: string, run: () => Promise<void>) => {
    const make = document.createElement;
    let n = 0;
    document.createElement = function (this: Document, name: string, ...rest: unknown[]) {
      if (name === tag) n++;
      return (make as (...a: unknown[]) => HTMLElement).call(this, name, ...rest);
    } as typeof document.createElement;
    try {
      await run();
    } finally {
      document.createElement = make;
    }
    return n;
  };

  test("Select: opening a 40-option list and moving over it creates no new options", async () => {
    const options = Array.from({ length: 40 }, (_, i) => `"Option ${i + 1}"`).join(", ");
    const s = show(`root = Select("p", "Pick", [${options}])\n`);
    const item = '[data-scope="select"][data-part="item"]';
    await until(() => s.host.querySelector(item) !== null);
    const items = s.$$(item);
    expect(items.length).toBe(40);
    const made = await created("li", async () => {
      const trigger = s.$<HTMLButtonElement>('[data-scope="select"][data-part="trigger"]');
      trigger.focus();
      trigger.click();
      await until(() => s.host.querySelector('[data-scope="select"][data-part="content"][data-state="open"]') !== null);
      for (let i = 0; i < 5; i++) {
        items[i]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
        await until(() => items[i]!.hasAttribute("data-highlighted"));
        // A reused option loses the highlight when it moves on (no attribute is left behind).
        expect(items.map((el) => el.hasAttribute("data-highlighted")).indexOf(true)).toBe(i);
        expect(s.$$(`${item}[data-highlighted]`).length).toBe(1);
      }
    });
    expect(made).toBe(0);
    expect(s.$$(item).every((el, i) => el === items[i])).toBe(true);
    expect(s.$$('[data-gistui="Select"] select option').length).toBe(41);
    items[4]!.click();
    await until(() => s.$('[data-scope="select"][data-part="value-text"]').textContent === "Option 5");
    expect(s.$<HTMLSelectElement>('[data-gistui="Select"] select').value).toBe("Option 5");
    s.done();
  });

  test("Combobox: an option that was filtered out lets go of its listeners", async () => {
    const s = show(`$city = ""\nroot = Combobox("city", "City", ["Berlin", "Bern", "Boston"], bind:$city)\n`);
    const item = '[data-scope="combobox"][data-part="item"]';
    await until(() => s.host.querySelector('[data-scope="combobox"][data-part="input"]') !== null);
    const input = s.$<HTMLInputElement>('[data-scope="combobox"][data-part="input"]');
    const [berlin, , boston] = s.$$(item);
    input.focus();
    type(input, "ber");
    await until(() => s.host.querySelectorAll(item).length === 2);
    expect(same(s.$(item), berlin)).toBe(true);
    expect(boston!.isConnected).toBe(false);
    // The removed option is dead: a click on it picks nothing.
    boston!.click();
    await tick();
    await tick();
    expect(s.host.querySelector('[data-gistui="Combobox"] input[type="hidden"]') === null).toBe(true);
    s.$$(item)[1]!.click();
    await until(() => s.host.querySelector('[data-gistui="Combobox"] input[type="hidden"]') !== null);
    expect(s.$<HTMLInputElement>('[data-gistui="Combobox"] input[type="hidden"]').value).toBe("Bern");
    s.done();
  });

  test("DatePicker: a day cell reused for another month does not keep the old day's attributes", async () => {
    const s = show(`root = DatePicker("d", "Date", value:"2026-10-01")\n`);
    await until(() => s.host.querySelector('[data-scope="date-picker"][data-part="trigger"]') !== null);
    const trigger = s.$<HTMLButtonElement>('[data-scope="date-picker"][data-part="trigger"]');
    trigger.focus();
    trigger.click();
    await until(() => s.host.querySelector('[data-scope="date-picker"][data-part="content"][data-state="open"]') !== null);
    const selected = () => s.$$(".gistui-dp__day[data-selected]").map((e) => e.getAttribute("aria-label"));
    const cell = s.$(".gistui-dp__day[data-selected]");
    expect(selected()).toEqual(["Selected date. Thursday, October 1, 2026"]);
    s.$<HTMLButtonElement>('[data-scope="date-picker"][data-part="next-trigger"]').click();
    await until(() => s.$(".gistui-dp__title").textContent === "November 2026");
    // The same cell now shows a November day, which is not selected.
    expect(cell.isConnected).toBe(true);
    expect(cell.getAttribute("aria-label")).toContain("November");
    expect(selected()).toEqual([]);
    s.done();
  });

  test("zagParts.spread removes an attribute that is no longer in the props", () => {
    const parts = zagParts();
    const li = document.createElement("li");
    let clicks = 0;
    parts.spread(li, { "data-part": "item", "data-highlighted": "", onclick: () => clicks++ });
    parts.spread(li, { "data-part": "item", onclick: () => (clicks += 10) });
    li.click();
    expect([li.hasAttribute("data-highlighted"), li.getAttribute("data-part"), clicks, parts.size]).toEqual([false, "item", 10, 1]);
    parts.clear();
    li.click();
    expect(clicks).toBe(10);
  });

  test("zagParts.forget removes what was applied to an element and drops its entry", () => {
    const parts = zagParts();
    const a = document.createElement("li");
    const b = document.createElement("li");
    let clicks = 0;
    parts.spread(a, { onclick: () => clicks++, "data-part": "item" });
    parts.spread(b, { onclick: () => clicks++ });
    expect(parts.size).toBe(2);
    a.click();
    parts.forget(a);
    a.click();
    b.click();
    expect([clicks, parts.size]).toEqual([2, 1]);
    parts.clear();
    b.click();
    expect([clicks, parts.size]).toEqual([2, 0]);
  });
});

describe("media elements survive a redraw (D12)", () => {
  test("Video: the iframe and the <video> are kept; only a new src changes them", async () => {
    const s = show(`$t = "Demo"\n$clip = "https://example.com/clip.mp4"\nroot = Page(Video("https://www.youtube.com/watch?v=abcdefgh123", title:$t), Video($clip, title:$t, poster:"https://example.com/p.jpg"))\n`, {}, {}, false);
    await until(() => s.host.querySelector("iframe") !== null && s.host.querySelector("video") !== null);
    const iframe = s.$<HTMLIFrameElement>("iframe");
    const video = s.$<HTMLVideoElement>("video");
    expect(iframe.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/abcdefgh123");
    s.set("t", "Launch film");
    await tick();
    expect(s.$$(".gistui-video__title").map((e) => e.textContent)).toEqual(["Launch film", "Launch film"]);
    expect(iframe.getAttribute("title")).toBe("Launch film");
    expect(same(s.$("iframe"), iframe)).toBe(true);
    expect(same(s.$("video"), video)).toBe(true);
    s.set("clip", "https://example.com/other.mp4");
    await tick();
    expect(same(s.$("video"), video)).toBe(true);
    expect(video.getAttribute("src")).toBe("https://example.com/other.mp4");
    // From a file to an embed: another kind of element.
    s.set("clip", "https://vimeo.com/123456");
    await tick();
    expect(s.$$("iframe").length).toBe(2);
    expect(s.$("video") === null).toBe(true);
    s.done();
  });

  test("Avatar, Hero, Gallery and a Slide background keep their pictures (and the Hero its button)", async () => {
    const s = show(
      `$t = "one"\nroot = Page(Avatar("Ada Lovelace", $t, src:"https://example.com/ada.jpg"), Hero("Ship", subtitle:$t, cta:"Start", image:"https://example.com/hero.jpg"), Gallery(["https://example.com/1.jpg", "https://example.com/2.jpg"], captions:[$t, "Two"]), Slides(Slide(Header("One"), image:"https://example.com/bg.jpg", layout:$t == "one" ? "center" : "split")), Pricing(plans, highlight:$t == "one" ? "Free" : "Pro"))\nplans = |Plan|Price\n|Free|$0\n|Pro|$20\n`,
    );
    const sel = [".gistui-avatar img", ".gistui-hero img", ".gistui-hero .gistui-button", ".gistui-gallery__item", ".gistui-gallery__item img", ".gistui-slide__bg img", ".gistui-pricing__plan .gistui-button"];
    await until(() => sel.every((q) => s.host.querySelector(q) !== null));
    const before = sel.map((q) => s.$$(q));
    const cta = s.$<HTMLButtonElement>(".gistui-hero .gistui-button");
    cta.focus();
    s.set("t", "two");
    await tick();
    expect(s.$(".gistui-avatar__sub").textContent).toBe("two");
    expect(s.$(".gistui-hero__subtitle").textContent).toBe("two");
    expect(s.$(".gistui-gallery__caption").textContent).toBe("two");
    expect(s.$(".gistui-slide").getAttribute("data-layout")).toBe("split");
    expect(s.$(".gistui-pricing__plan[data-featured] .gistui-pricing__name").textContent).toBe("Pro");
    sel.forEach((q, i) => expect([q, s.$$(q).length === before[i]!.length && s.$$(q).every((el, j) => el === before[i]![j])]).toEqual([q, true]));
    expect(focused(cta)).toBe(true);
    s.done();
  });
});

describe("image viewer (D21, D3)", () => {
  const gallery = `root = Page(Gallery(["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg"], captions:["One", "Two", "Three"]))\n`;
  const open = async (s: ReturnType<typeof show>, i = 0) => {
    await until(() => s.host.querySelector(".gistui-gallery__item") !== null);
    s.$$<HTMLButtonElement>(".gistui-gallery__item")[i]!.click();
    await until(() => s.host.querySelector("dialog.gistui-lightbox") !== null);
  };

  test("next, previous and the thumbnails are the same buttons after navigating, so focus stays in the dialog", async () => {
    const s = show(gallery);
    await open(s);
    const next = s.$<HTMLButtonElement>('.gistui-lightbox__nav[data-side="end"]');
    const prev = s.$<HTMLButtonElement>('.gistui-lightbox__nav[data-side="start"]');
    const thumbs = s.$$<HTMLButtonElement>(".gistui-lightbox__thumb");
    const thumbImg = thumbs[0]!.querySelector("img");
    expect(thumbs.map((t) => t.getAttribute("aria-current"))).toEqual(["true", "false", "false"]);
    next.focus();
    next.click();
    expect(s.$(".gistui-lightbox__count").textContent).toBe("2 / 3");
    expect(s.$(".gistui-lightbox figcaption").textContent).toBe("Two");
    expect(same(s.$('.gistui-lightbox__nav[data-side="end"]'), next)).toBe(true);
    expect(same(s.$('.gistui-lightbox__nav[data-side="start"]'), prev)).toBe(true);
    expect(focused(next)).toBe(true);
    expect(s.$$(".gistui-lightbox__thumb").every((t, i) => t === thumbs[i])).toBe(true);
    expect(same(thumbs[0]!.querySelector("img"), thumbImg)).toBe(true);
    expect(thumbs.map((t) => t.getAttribute("aria-current"))).toEqual(["false", "true", "false"]);
    // Arrow keys go on working from the focused button.
    next.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(s.$(".gistui-lightbox__count").textContent).toBe("3 / 3");
    expect(focused(next)).toBe(true);
    thumbs[0]!.focus();
    thumbs[0]!.click();
    expect(s.$(".gistui-lightbox__count").textContent).toBe("1 / 3");
    expect(focused(thumbs[0]!)).toBe(true);
    expect(s.$$(".gistui-lightbox__stage > *").map((e) => e.tagName)).toEqual(["FIGURE", "BUTTON", "BUTTON"]);
    s.done();
  });

  test("the page scrolls again when the viewer goes away without its close button", async () => {
    document.body.style.overflow = "";
    // The host is destroyed while the viewer is open.
    let s = show(gallery);
    await open(s);
    expect(document.body.style.overflow).toBe("hidden");
    s.done();
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelector("dialog.gistui-lightbox") === null).toBe(true);
    // The gallery is replaced while the viewer is open.
    s = show(gallery);
    await open(s, 1);
    expect(document.body.style.overflow).toBe("hidden");
    s.view.update({ source: `root = Text("gone")\n` });
    expect(document.body.style.overflow).toBe("");
    expect(s.host.querySelector("dialog.gistui-lightbox") === null).toBe(true);
    s.done();
    // The dialog is closed by the browser (its `close` event), not by the viewer's own button.
    s = show(gallery);
    await open(s);
    const dialog = s.$<HTMLDialogElement>("dialog.gistui-lightbox");
    dialog.dispatchEvent(new Event("close"));
    expect(document.body.style.overflow).toBe("");
    expect(dialog.isConnected).toBe(false);
    // Something else removes the dialog from the page.
    await open(s);
    expect(document.body.style.overflow).toBe("hidden");
    s.$("dialog.gistui-lightbox").remove();
    await tick();
    expect(document.body.style.overflow).toBe("");
    s.done();
  });

  test("a viewer still loading when its picture goes away never opens", async () => {
    document.body.style.overflow = "";
    const s = show(`root = Image("https://example.com/a.jpg", zoom)\n`);
    s.$<HTMLButtonElement>(".gistui-image__zoom").click();
    s.done();
    await tick();
    await tick();
    expect(document.querySelector("dialog.gistui-lightbox") === null).toBe(true);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Carousel arrows (D19)", () => {
  test("arrows:none arriving at the end of the stream takes the arrow buttons away", () => {
    const start = `root = Carousel(Card(Header("a")), Card(Header("b"))`;
    const s = show(start, { streaming: true });
    const wrap = s.$(".gistui-carousel-wrap > .gistui-scroll");
    const view = s.$(".gistui-carousel");
    expect(wrap.getAttribute("data-arrows")).toBe("always");
    expect(s.$$(".gistui-scroll__arrow").length).toBe(2);
    s.view.update({ source: `${start}, arrows:none)\n`, streaming: false });
    expect(same(s.$(".gistui-carousel-wrap > .gistui-scroll"), wrap)).toBe(true);
    expect(same(s.$(".gistui-carousel"), view)).toBe(true);
    expect(wrap.getAttribute("data-arrows")).toBe("none");
    expect(s.$$(".gistui-scroll__arrow").length).toBe(0);
    expect(s.$$(".gistui-carousel .gistui-card").length).toBe(2);
    s.done();
  });

  test("the arrows come back in their place, after the scroller", () => {
    const s = show(`$a = "none"\nroot = Carousel(Card(Header("a")), arrows:$a)\n`);
    expect(s.$$(".gistui-scroll__arrow").length).toBe(0);
    s.set("a", "hover");
    expect(s.$(".gistui-scroll").getAttribute("data-arrows")).toBe("hover");
    expect([...s.$(".gistui-scroll").children].map((e) => e.className)).toEqual(["gistui-scroll__view gistui-carousel", "gistui-scroll__arrow", "gistui-scroll__arrow"]);
    s.done();
  });
});

describe("Tabs edge fade (D24a)", () => {
  test("an overflowing tab list marks the edges that can still scroll", () => {
    const s = show(`root = Tabs(Tab(Text("one"), label:"One"), Tab(Text("two"), label:"Two"))\n`);
    const wrap = s.$(".gistui-tabs > .gistui-scroll");
    const list = s.$('[role="tablist"]');
    // happy-dom has no layout: give the list a width and a scroll position.
    const size = (scrollWidth: number, clientWidth: number, scrollLeft: number) => {
      for (const [k, value] of Object.entries({ scrollWidth, clientWidth, scrollLeft })) Object.defineProperty(list, k, { value, configurable: true });
      list.dispatchEvent(new Event("scroll"));
    };
    expect([wrap.hasAttribute("data-can-start"), wrap.hasAttribute("data-can-end"), wrap.hasAttribute("data-arrows")]).toEqual([false, false, false]);
    size(900, 300, 0);
    expect([wrap.hasAttribute("data-can-start"), wrap.hasAttribute("data-can-end")]).toEqual([false, true]);
    size(900, 300, 200);
    expect([wrap.hasAttribute("data-can-start"), wrap.hasAttribute("data-can-end")]).toEqual([true, true]);
    size(900, 300, 600);
    expect([wrap.hasAttribute("data-can-start"), wrap.hasAttribute("data-can-end")]).toEqual([true, false]);
    size(300, 300, 0);
    expect([wrap.hasAttribute("data-can-start"), wrap.hasAttribute("data-can-end")]).toEqual([false, false]);
    s.done();
  });
});

describe("Code (performance)", () => {
  test("highlights again only when the source or the language changed", async () => {
    const s = show(`$t = "a.ts"\n$code = "const a = 1"\nroot = Code($code, lang:"ts", title:$t, numbered)\n`);
    await until(() => s.host.querySelector(".gistui-code .tok-k") !== null);
    const token = s.$(".gistui-code .tok-k");
    const pre = s.$(".gistui-code pre");
    s.set("t", "b.ts");
    await tick();
    expect(s.$(".gistui-code__bar span").textContent).toBe("b.ts");
    expect(same(s.$(".gistui-code .tok-k"), token)).toBe(true);
    expect(same(s.$(".gistui-code pre"), pre)).toBe(true);
    s.set("code", "let b = 2\nlet c = 3");
    await tick();
    expect(same(s.$(".gistui-code .tok-k"), token)).toBe(false);
    expect(s.$(".gistui-code code").textContent).toBe("let b = 2\nlet c = 3");
    expect(s.$(".gistui-code__lines").textContent).toBe("1\n2\n");
    expect(same(s.$(".gistui-code pre"), pre)).toBe(true);
    s.done();
  });
});

describe("other controls keep their elements too", () => {
  test("Slides: a clicked dot is the same button afterwards", async () => {
    const s = show(`root = Slides(Slide(Header("One")), Slide(Header("Two")), Slide(Header("Three")))\n`);
    await until(() => s.host.querySelectorAll(".gistui-slides__dot").length === 3);
    const dots = s.$$<HTMLButtonElement>(".gistui-slides__dot");
    dots[2]!.focus();
    dots[2]!.click();
    expect(s.$$(".gistui-slides__dot").every((d, i) => d === dots[i])).toBe(true);
    expect(focused(dots[2]!)).toBe(true);
    expect(dots.map((d) => d.getAttribute("aria-current"))).toEqual(["false", "false", "true"]);
    expect(s.$(".gistui-slides__count").textContent).toBe("3 / 3");
    s.done();
  });

  test("Form: Continue, Back and the status keep their elements through the steps", async () => {
    const s = show(`root = Form("w", Step("Account", Input("name", "Name")), Step("Plan", Input("plan", "Plan")), draft:"Save draft")\n`);
    const next = s.$<HTMLButtonElement>("button[data-auto]");
    const draft = s.$<HTMLButtonElement>("button[data-draft]");
    expect(next.textContent).toBe("Continue");
    expect(next.querySelector("svg") !== null).toBe(true);
    next.focus();
    next.click();
    await until(() => s.$(".gistui-form__count").textContent === "Step 2 of 2");
    expect(same(s.$("button[data-auto]"), next)).toBe(true);
    expect(same(s.$("button[data-draft]"), draft)).toBe(true);
    expect(focused(next)).toBe(true);
    expect(next.textContent).toBe("Submit");
    expect(next.querySelector("svg") === null).toBe(true);
    expect(s.$$(".gistui-stepper__item").map((li) => li.getAttribute("data-state"))).toEqual(["done", "current"]);
    const back = s.$$<HTMLButtonElement>(".gistui-form__nav button").find((b) => b.textContent === "Back")!;
    back.click();
    expect(s.$(".gistui-form__count").textContent).toBe("Step 1 of 2");
    expect(s.$$(".gistui-form__nav > *").map((e) => e.className)).toEqual(["gistui-spacer", "gistui-button", "gistui-form__count", "gistui-button"]);
    s.done();
  });

  test("a reset button puts fields with their own value back to the program's", async () => {
    const s = show(`root = Form("f", Switch("news", "Newsletter", checked), CheckboxGroup("addons", "Add-ons", ["SSO", "Audit"], value:["SSO"]), Button("Reset", type:reset))\n`);
    await until(() => s.host.querySelector('input[name="addons"]') !== null);
    const state = () => [s.$<HTMLInputElement>('input[name="news"]').checked, ...s.$$<HTMLInputElement>('input[name="addons"]').map((i) => i.checked)];
    expect(state()).toEqual([true, true, false]);
    s.$<HTMLInputElement>('input[name="news"]').click();
    for (const i of s.$$<HTMLInputElement>('input[name="addons"]')) i.click();
    expect(state()).toEqual([false, false, true]);
    s.$$<HTMLButtonElement>(".gistui-button").find((b) => b.textContent === "Reset")!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(state()).toEqual([true, true, false]);
    expect(s.$('input[name="addons"]').closest("label")!.getAttribute("data-state")).toBe("checked");
    s.done();
  });
});

describe("Slide autofit settles at the shared scale (C1)", () => {
  test("a dense slide: a short search with headless `refit`, then the same scale on every later measurement", async () => {
    // happy-dom has no layout: the slide is 470px tall inside, and its text wraps like a real page
    // (26px lines of 60 characters at full width under a 120px heading; widened content is shorter).
    const page = (chars: number) => (fit: number) => 120 + 26 * Math.ceil((chars * fit) / 60);
    const observers: (() => void)[] = [];
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const s = show(`root = Slides(Slide(Text("Dense")), Slide(Text("Next")))\n`);
      await until(() => s.host.querySelector(".gistui-slide") !== null);
      const slide = s.$(".gistui-slide");
      const content = s.$(".gistui-slide__content");
      const fitNow = () => (content.style.width ? 100 / parseFloat(content.style.width) : 1);
      const need = page(1400);
      Object.defineProperty(slide, "clientHeight", { get: () => 470, configurable: true });
      Object.defineProperty(content, "scrollHeight", { get: () => need(fitNow()), configurable: true });
      const scales: number[] = [];
      for (let i = 0; i < 40; i++) {
        for (const cb of observers) cb();
        scales.push(Math.round(fitNow() * 1000) / 1000);
      }
      const { NO_FIT, refit } = await import("@gistui/headless");
      let state = NO_FIT;
      for (let i = 0; i < 40; i++) state = refit(state, 470, need(state.fit));
      // The scale React settles at, reached at once and kept (the old rule flipped 0.672 ↔ 0.851).
      expect(state.fit).toBeLessThan(1);
      expect(new Set(scales).size).toBe(1);
      expect(scales[0]).toBe(state.fit);
      expect(need(scales[0]!) * scales[0]!).toBeLessThanOrEqual(471);
      expect(slide.hasAttribute("data-fit")).toBe(true);
      expect(content.style.transform).toBe(`scale(${state.fit})`);
      s.done();
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });

  test("the deck leaves keys to the controls inside a slide (X16)", async () => {
    const s = show(`root = Slides(Slide(Input("n", "Name"), Tabs(Tab(Text("a"), label:"A"), Tab(Text("b"), label:"B"))), Slide(Text("Two")))\n`);
    await until(() => s.host.querySelectorAll(".gistui-slide").length === 2);
    const count = () => s.$(".gistui-slides__count").textContent;
    const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    key(s.$('input[name="n"]'), "ArrowRight");
    expect(count()).toBe("1 / 2");
    key(s.$('.gistui-tabs [role="tab"]'), "ArrowRight");
    expect(count()).toBe("1 / 2");
    expect(s.$$('.gistui-tabs [role="tab"]').map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    key(s.$(".gistui-slides"), "ArrowRight");
    expect(count()).toBe("2 / 2");
    s.done();
  });
});

describe("a control's own value follows the program until the user changes it (X1, C2)", () => {
  const controls = `Checkbox("tos", "Accept", checked), Switch("news", "News", checked), Slider("seats", "Seats", min:1, max:50, value:5), RadioGroup("plan", "Plan", ["Free", "Pro"], value:"Pro"), CheckboxGroup("topics", "Topics", ["AI", "Data"], value:["Data"]), TagInput("cc", "CC", value:["a@b.co"]), DatePicker("due", "Due", value:"2026-10-01"), TimePicker("slot", "Time", value:"10:00"), Select("size", "Size", ["S", "M"], value:"M"), Combobox("city", "City", ["Oslo", "Rome"], value:"Rome")`;
  const read = (s: ReturnType<typeof show>) => ({
    tos: s.$<HTMLInputElement>('input[name="tos"]').checked,
    news: s.$<HTMLInputElement>('input[name="news"]').checked,
    seats: s.$<HTMLInputElement>('input[name="seats"]').value,
    plan: s.$$<HTMLInputElement>('input[name="plan"]').map((i) => i.checked),
    topics: s.$$<HTMLInputElement>('input[name="topics"]').map((i) => i.checked),
    cc: s.$$<HTMLInputElement>('input[type="hidden"][name="cc"]').map((i) => i.value),
    due: s.$$<HTMLInputElement>('input[type="hidden"][name="due"]').map((i) => i.value),
    slot: s.$('[data-gistui="TimePicker"] [data-part="value-text"]').textContent,
    size: s.$('[data-gistui="Select"] [data-part="value-text"]').textContent,
    city: s.$$<HTMLInputElement>('input[type="hidden"][name="city"]').map((i) => i.value),
  });
  const initial = { tos: true, news: true, seats: "5", plan: [false, true], topics: [false, true], cc: ["a@b.co"], due: ["2026-10-01"], slot: "10:00 AM", size: "M", city: ["Rome"] };
  const loaded = async (s: ReturnType<typeof show>) => {
    await until(() => ["RadioGroup", "CheckboxGroup", "TagInput", "DatePicker", "TimePicker", "Slider"].every((k) => s.host.querySelector(`[data-gistui="${k}"]`) !== null) && s.host.querySelector('[data-scope="select"][data-part="trigger"]') !== null && s.host.querySelector('[data-scope="combobox"][data-part="input"]') !== null);
  };

  test("`checked` and `value:` arrive after the control mounted (named arguments stream in last)", async () => {
    const src = `root = Form("f", ${controls})\n`;
    // The components' chunks first, so the controls mount while their statement is still partial.
    const warm = show(src);
    await loaded(warm);
    warm.done();
    const s = show("", { streaming: true });
    for (let i = 3; i < src.length; i += 3) s.view.update({ source: src.slice(0, i), streaming: true });
    s.view.update({ source: src, streaming: false });
    await loaded(s);
    await tick();
    expect(read(s)).toEqual(initial);
    s.done();
  });

  test("Select and Combobox `value:` is the initial choice; an option not in the list is ignored; `bind:` wins", async () => {
    const actions: any[] = [];
    const s = show(
      `$s = "S"\nroot = Form("f", Select("size", "Size", ["S", "M"], value:"M"), Select("many", "Many", ["a", "b", "c"], multiple, value:["a", "c", "zz"]), Select("none", "None", ["S", "M"], value:"XL"), Select("bound", "Bound", ["S", "M"], value:"M", bind:$s), Combobox("city", "City", ["Oslo", "Rome"], value:"Rome"), Combobox("cities", "Cities", ["Oslo", "Rome", "Bern"], multiple, value:["Oslo", "Bern", "Zzz"]), Combobox("no", "No", ["Oslo"], value:"Paris"))\n`,
      { onAction: (a) => actions.push(a) },
    );
    await until(() => s.host.querySelectorAll('[data-scope="select"][data-part="trigger"]').length === 4 && s.host.querySelectorAll('[data-scope="combobox"][data-part="input"]').length === 3);
    const text = (n: number) => s.$$('[data-gistui="Select"] [data-part="value-text"]')[n]!.textContent;
    expect([text(0), text(1), text(2), text(3)]).toEqual(["M", "a, c", "Select…", "S"]);
    expect(s.$$<HTMLInputElement>('[data-scope="combobox"][data-part="input"]').map((i) => i.value)).toEqual(["Rome", "", ""]);
    expect(s.$$(".gistui-combobox__chips .gistui-tag").map((t) => t.textContent)).toEqual(["Oslo", "Bern"]);
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => actions.length > 0);
    // (happy-dom's FormData reads one value from a <select multiple>: its options are checked instead.)
    expect(s.$$<HTMLOptionElement>('select[name="many"] option').map((o) => o.selected)).toEqual([true, false, true]);
    expect({ ...actions[0].values, many: null }).toEqual({ size: "M", many: null, bound: "S", city: "Rome", cities: ["Oslo", "Bern"] });
    s.done();
  });

  test("a form reset returns every control to the program's value; typed text and a picked option go", async () => {
    const s = show(`root = Form("f", ${controls}, Button("Reset", v:secondary, type:reset))\n`);
    await loaded(s);
    expect(read(s)).toEqual(initial);
    // The user changes everything.
    s.$<HTMLInputElement>('input[name="tos"]').click();
    s.$<HTMLInputElement>('input[name="news"]').click();
    type(s.$<HTMLInputElement>('input[name="seats"]'), "20");
    s.$$<HTMLInputElement>('input[name="plan"]')[0]!.click();
    s.$$<HTMLInputElement>('input[name="topics"]')[0]!.click();
    const tag = s.$<HTMLInputElement>(".gistui-taginput__input");
    tag.value = "c@d.co";
    tag.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    type(tag, "half-typed");
    const pick = async (kind: string, scope: string, label: string) => {
      const trigger = s.$<HTMLButtonElement>(`[data-gistui="${kind}"] [data-scope="${scope}"][data-part="trigger"]`);
      trigger.focus();
      trigger.click();
      await until(() => s.host.querySelector(`[data-gistui="${kind}"] [data-part="content"][data-state="open"]`) !== null);
      s.$$(`[data-gistui="${kind}"] [data-part="item"]`).find((li) => li.textContent === label)!.click();
      await tick();
    };
    await pick("Select", "select", "S");
    await pick("TimePicker", "select", "11:00 AM");
    await pick("Combobox", "combobox", "Oslo");
    await until(() => read(s).city[0] === "Oslo" && read(s).plan[0] === true);
    expect(read(s)).toEqual({ tos: false, news: false, seats: "20", plan: [true, false], topics: [true, true], cc: ["a@b.co", "c@d.co"], due: ["2026-10-01"], slot: "11:00 AM", size: "S", city: ["Oslo"] });
    s.$$<HTMLButtonElement>(".gistui-button").find((b) => b.textContent === "Reset")!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(read(s)).toEqual(initial);
    expect(tag.value).toBe("");
    expect(s.$<HTMLInputElement>('[data-scope="combobox"][data-part="input"]').value).toBe("Rome");
    // A later redraw keeps it.
    s.view.update({ lockUntil: "ready" });
    expect(read(s)).toEqual(initial);
    s.done();
  });

  test("DatePicker with `time`: a bound value set from elsewhere shows and submits its own time", async () => {
    const actions: any[] = [];
    const s = show(`$at = "2026-10-01T14:30"\nroot = Form("f", DatePicker("at", "Starts", time, bind:$at))\n`, { onAction: (a) => actions.push(a) });
    await until(() => s.host.querySelector(".gistui-dp__time-chip") !== null);
    expect(s.$(".gistui-dp__time-chip").textContent).toBe("2:30 PM");
    // The user picks a time, then the program sets another.
    s.$$<HTMLButtonElement>(".gistui-dp__time").find((b) => b.textContent === "4:00 PM")!.click();
    await tick();
    expect(s.$(".gistui-dp__time-chip").textContent).toBe("4:00 PM");
    s.set("at", "2026-12-24T09:30");
    await tick();
    expect(s.$(".gistui-dp__time-chip").textContent).toBe("9:30 AM");
    expect(s.$<HTMLInputElement>('input[type="hidden"][name="at"]').value).toBe("2026-12-24T09:30");
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => actions.length > 0);
    expect(actions[0].values).toEqual({ at: "2026-12-24T09:30" });
    s.done();
  });
});

describe("Form, as the React renderer (A1, A2, B)", () => {
  test("the form's name is `data-form-name`, not a `name` attribute", () => {
    const s = show(`root = Form("getElementById", Input("a", "A"))\n`);
    const form = s.$("form");
    expect([form.getAttribute("data-form-name"), form.hasAttribute("name")]).toEqual(["getElementById", false]);
    s.done();
  });

  test("a draft button is not a submit button; a click saves a draft (partial: true) and the form stays", async () => {
    const actions: any[] = [];
    const s = show(`root = Form("f", Button("Later", type:draft, v:ghost), Input("email", "Email", type:email, required), Input("team", "Team", required), draft:"Save draft")\n`, { onAction: (a) => actions.push(a) });
    const drafts = s.$$<HTMLButtonElement>("button[data-draft]");
    expect(drafts.map((b) => [b.textContent, b.getAttribute("type"), b.getAttribute("data-draft"), b.hasAttribute("formnovalidate")])).toEqual([
      ["Later", "button", "", false],
      ["Save draft", "button", "", false],
    ]);
    // Enter in a field submits through the form's first submit button: that is not a draft button.
    expect(s.$<HTMLButtonElement>('button[type="submit"]').hasAttribute("data-draft")).toBe(false);
    // What is filled in is still checked.
    type(s.$<HTMLInputElement>('input[name="email"]'), "nope");
    drafts[1]!.click();
    await until(() => s.host.querySelector(".gistui-field__error") !== null);
    expect(s.$$(".gistui-field__error").map((e) => e.textContent)).toEqual(["Enter a valid email address, like name@example.com"]);
    expect(actions).toEqual([]);
    type(s.$<HTMLInputElement>('input[name="email"]'), "ada@example.com");
    for (const b of drafts) {
      b.click();
      await until(() => actions.length > 0);
      const a = actions.pop();
      expect([a.type, a.partial, a.values, a.message.startsWith('Saved a draft of "f"')]).toEqual(["submit", true, { email: "ada@example.com" }, true]);
    }
    expect(s.$(".gistui-form__status").textContent).toContain("Draft saved");
    expect(s.$$(".gistui-field__error").length).toBe(0);
    s.done();
  });

  test("a Switch that is on submits true", async () => {
    const actions: any[] = [];
    const s = show(`root = Form("f", Switch("news", "News", checked), Switch("ads", "Ads"))\n`, { onAction: (a) => actions.push(a) });
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => actions.length > 0);
    expect(actions[0].values).toEqual({ news: true, ads: false });
    s.done();
  });

  test("after Start over the form still validates as you type", async () => {
    const actions: any[] = [];
    const s = show(`root = Form("f", Input("email", "Email", type:email, required), validate:change, success:"Thanks!")\n`, { onAction: (a) => actions.push(a) });
    const email = s.$<HTMLInputElement>('input[name="email"]');
    type(email, "ada@example.com");
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => s.host.querySelector(".gistui-form__done") !== null);
    s.$<HTMLButtonElement>(".gistui-form__done button").click();
    await tick();
    expect(s.$$(".gistui-field__error").length).toBe(0);
    type(s.$<HTMLInputElement>('input[name="email"]'), "nope");
    await until(() => s.host.querySelector(".gistui-field__error") !== null);
    expect(s.$$(".gistui-field__error").map((e) => e.textContent)).toEqual(["Enter a valid email address, like name@example.com"]);
    s.done();
  });

  test("a DatePicker tells the Form when a date is picked: its error clears", async () => {
    const s = show(`root = Form("f", DatePicker("due", "Due", required))\n`);
    await until(() => s.host.querySelector('[data-scope="date-picker"][data-part="trigger"]') !== null);
    expect(s.$('[data-gistui="DatePicker"]').getAttribute("data-field")).toBe("due");
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => s.host.querySelector(".gistui-field__error") !== null);
    const input = s.$('[data-gistui="DatePicker"] .gistui-dp__input');
    expect([s.$(".gistui-field__error").textContent, input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")]).toEqual(["Due is required", "true", s.$(".gistui-field__error").id]);
    s.$$<HTMLButtonElement>(".gistui-dp__link").find((b) => b.textContent === "Today")!.click();
    await until(() => s.host.querySelector(".gistui-field__error") === null);
    expect(s.host.querySelector(".gistui-field__error") === null).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    s.done();
  });

  test("a step form sees fields that have no named control while empty (X5)", async () => {
    const s = show(`root = Form("w", Step("One", TagInput("cc", "CC", required), Combobox("city", "City", ["Oslo", "Rome"], required), DatePicker("due", "Due", required)), Step("Two", Input("n", "Name")))\n`);
    await until(() => s.host.querySelector(".gistui-taginput") !== null && s.host.querySelector('[data-scope="combobox"][data-part="input"]') !== null && s.host.querySelector('[data-scope="date-picker"][data-part="trigger"]') !== null);
    s.$<HTMLButtonElement>("button[data-auto]").click();
    await until(() => s.host.querySelectorAll(".gistui-field__error").length === 3);
    expect(s.$$(".gistui-field__error").map((e) => e.textContent)).toEqual(["Add at least one item", "City is required", "Due is required"]);
    expect(s.$(".gistui-form__count").textContent).toBe("Step 1 of 2");
    s.done();
  });
});

describe("Dialog, as the React renderer (A14, A15, X11, X17)", () => {
  test("an open Dialog is a child of the GistUI root and carries its section's presets", async () => {
    const s = show(`root = Page(Card(Button("Open", opens:d), Dialog("Own", Text("mine"), trigger:"Own trigger"), accent:rose), density:compact, radius:lg)\nd = Dialog("Hi", Text("Body"))\n`);
    const root = s.$(".gistui");
    for (const label of ["Open", "Own trigger"]) {
      s.$$<HTMLButtonElement>(".gistui-button").find((b) => b.textContent === label)!.click();
      const dialog = s.$<HTMLDialogElement>("dialog.gistui-dialog");
      expect(same(dialog.parentElement, root)).toBe(true);
      expect(dialog.open).toBe(true);
      expect(["data-gistui-color", "data-gistui-radius", "data-gistui-density"].map((a) => dialog.getAttribute(a))).toEqual(["rose", "lg", "compact"]);
      s.$<HTMLButtonElement>(".gistui-dialog__close").click();
      expect(dialog.getAttribute("data-closing")).toBe("true");
      await until(() => s.host.querySelector("dialog") === null);
      // Nothing is left at the root: no dialog, no holder.
      expect(root.children.length).toBe(1);
    }
    s.done();
  });

  test("no skeleton beside (or anywhere for) a button whose Dialog has not arrived", () => {
    const start = `root = Stack(b)\nb = Button("Invite", opens:dlg)\n`;
    const s = show(start, { streaming: true });
    expect(s.$$(".gistui-button").length).toBe(1);
    expect(s.$$(".gistui-skeleton").length).toBe(0);
    expect(s.$(".gistui-stack").children.length).toBe(1);
    s.view.update({ source: `${start}dlg = Dialog("Invite", "Hello")\n`, streaming: false });
    s.$<HTMLButtonElement>(".gistui-button").click();
    expect(s.$(".gistui-dialog").textContent).toContain("Hello");
    s.done();
  });

  test("a Dialog opened from inside a Form is its own form scope", async () => {
    const actions: any[] = [];
    const s = show(`root = Form("outer", Input("name", "Name", required), Button("More", v:secondary, opens:dlg), Button("Save"))\ndlg = Dialog("Details", Form("inner", Input("note", "Note", required), Button("Add")), Button("OK"))\n`, { onAction: (a) => actions.push(a) });
    s.$<HTMLButtonElement>('[aria-haspopup="dialog"]').click();
    const dialog = s.$(".gistui-dialog");
    expect(dialog.closest("form") === null).toBe(true);
    // "OK" is a primary button outside the inner form: not a submit button of the outer one.
    expect(Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "OK")!.type).toBe("button");
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await until(() => s.host.querySelector(".gistui-field__error") !== null);
    expect(s.$$(".gistui-field__error").map((e) => e.textContent)).toEqual(["Note is required"]);
    type(dialog.querySelector<HTMLInputElement>('input[name="note"]')!, "hello");
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await until(() => actions.length > 0);
    expect(actions.filter((a) => a.type === "submit").map((a) => a.form)).toEqual(["inner"]);
    expect(s.$$(".gistui-field__error").length).toBe(0);
    s.done();
  });

  test("focus returns to the button that opened a Dialog; the dialog is closed while still in the page", async () => {
    const close = HTMLDialogElement.prototype.close;
    const calls: boolean[] = [];
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, ...args: []) {
      calls.push(this.isConnected);
      return close.apply(this, args);
    };
    try {
      const s = show(`root = Button("Invite", opens:dlg)\ndlg = Dialog("Invite", Input("email", "Email"), Button("Cancel", v:ghost, close))\n`);
      const button = s.$<HTMLButtonElement>('[aria-haspopup="dialog"]');
      button.focus();
      button.click();
      s.$<HTMLInputElement>('.gistui-dialog input[name="email"]').focus();
      s.$$<HTMLButtonElement>(".gistui-dialog button").find((b) => b.textContent === "Cancel")!.click();
      await until(() => s.host.querySelector(".gistui-dialog") === null);
      expect(calls).toEqual([true]);
      expect(focused(button)).toBe(true);
      s.done();
    } finally {
      HTMLDialogElement.prototype.close = close;
    }
  });
});

describe("markup as the React renderer (A3-A13, S18, E)", () => {
  const u = "https://example.com/a.png";

  test("accessible names: a checkbox group is labelled by its label; a carousel is named", async () => {
    const s = show(`root = Stack(CheckboxGroup("topics", "Topics", ["AI", "Data"]), CheckboxGroup("bare", "", ["x"]), Carousel(Card(Header("a")), Card(Header("b"))))\n`);
    await until(() => s.host.querySelectorAll('[role="group"]').length === 2);
    const [group, bare] = s.$$('[role="group"]');
    expect(document.getElementById(group!.getAttribute("aria-labelledby")!)!.textContent).toBe("Topics");
    expect(bare!.hasAttribute("aria-labelledby")).toBe(false);
    expect(s.$('[aria-roledescription="carousel"]').getAttribute("aria-label")).toBe("Carousel");
    s.done();
  });

  test("a password field never asks for saved credentials", () => {
    const s = show(`root = Stack(Input("pw", "Password", type:password), Input("email", "Email", type:email))\n`);
    expect(s.$$("input").map((i) => i.getAttribute("autocomplete"))).toEqual(["new-password", "email"]);
    s.done();
  });

  test("images from program URLs send no referrer (also in the viewer)", async () => {
    const s = show(`root = Stack(Image("${u}"), Media("${u}", "Title"), Tile("T", image:"${u}"), Avatar("Ann", src:"${u}"), Hero("H", image:"${u}"), Gallery(["${u}", "${u}?2"]), RadioGroup("r", "R", ["A"], images:["${u}"], v:cards), CheckboxGroup("c", "C", ["A"], images:["${u}"], v:cards), Slides(Slide("x", image:"${u}"), ratio:"auto"))\n`);
    await until(() => s.host.querySelectorAll("img").length === 10);
    const imgs = s.$$("img");
    expect(imgs.map((i) => i.closest("[data-gistui]")?.getAttribute("data-gistui"))).toEqual(["Image", "Media", "Tile", "Avatar", "Hero", "Gallery", "Gallery", "RadioGroup", "CheckboxGroup", "Slide"]);
    expect(imgs.filter((i) => i.getAttribute("referrerpolicy") !== "no-referrer").map((i) => i.closest("[data-gistui]")?.getAttribute("data-gistui"))).toEqual([]);
    s.$<HTMLButtonElement>(".gistui-gallery__item").click();
    await until(() => s.host.querySelector(".gistui-lightbox") !== null);
    const inViewer = s.$$(".gistui-lightbox img");
    expect(inViewer.length).toBe(3);
    expect(inViewer.every((i) => i.getAttribute("referrerpolicy") === "no-referrer")).toBe(true);
    s.done();
  });

  test("Video: referrer and sandbox; the ratio rule; embeds chosen by the URL's host", async () => {
    const s = show(
      `root = Stack(Video("https://example.com/a.mp4", ratio:"4:3"), Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ", ratio:"nonsense"), Video("https://evil.example/clip.mp4?from=youtube.com/watch?v=dQw4w9WgXcQ"))\n`,
      {},
      {},
      false,
    );
    await until(() => s.host.querySelectorAll(".gistui-video").length === 3);
    expect(s.$$(".gistui-video").map((v) => v.style.getPropertyValue("--gistui-ratio"))).toEqual(["4 / 3", "16 / 9", "16 / 9"]);
    expect(s.$$("video").map((v) => v.getAttribute("referrerpolicy"))).toEqual(["no-referrer", "no-referrer"]);
    const frames = s.$$("iframe");
    expect(frames.map((f) => [f.getAttribute("src"), f.getAttribute("sandbox"), f.getAttribute("referrerpolicy")])).toEqual([["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "allow-scripts allow-same-origin allow-presentation", "strict-origin-when-cross-origin"]]);
    const { embedOf } = await import("../src/ui/extras");
    expect(["https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://vimeo.com/123456", "https://player.vimeo.com/video/123456"].map(embedOf)).toEqual([
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://player.vimeo.com/video/123456?dnt=1",
      "https://player.vimeo.com/video/123456?dnt=1",
    ]);
    expect(["https://notyoutube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://example.com/vimeo.com/123456", "/relative/youtu.be/dQw4w9WgXcQ"].map(embedOf)).toEqual([null, null, null, null]);
    s.done();
  });

  test("program-chosen sizes are clamped: Cell rows, Chart height, KaTeX sizes; a long sparkline draws", async () => {
    const s = show(`root = Stack(Grid(Cell("a", rows:100000, span:2), Cell("b", rows:2)), Chart(t, height:99999), Chart(t, height:1), Math("\\\\rule{500em}{500em}"), Stat("Load", "1", spark:big))\nt = |M|V\n|a|1\n|b|2\nbig = [${Array.from({ length: 2000 }, (_, i) => i % 97).join(",")}]\n`);
    expect(s.$$('[data-gistui="Cell"]').map((c) => c.style.getPropertyValue("--gistui-row-span"))).toEqual(["12", "2"]);
    await until(() => s.host.querySelectorAll(".gistui-chart__svg").length === 2 && s.host.querySelector("math") !== null);
    expect(s.$$(".gistui-chart__svg").map((c) => c.getAttribute("height"))).toEqual(["1200", "80"]);
    const math = s.$('[data-gistui="Math"]').innerHTML;
    expect([math.includes('width="50em"'), math.includes('width="500em"')]).toEqual([true, false]);
    expect(s.host.querySelector(".gistui-stat__spark") !== null).toBe(true);
    s.done();
    // Far more points than an argument list may hold (`Math.min(...values)` would throw).
    const { Stat } = await import("../src/ui/data");
    const values = Array.from({ length: 150_000 }, (_, i) => i % 97);
    const long = show(`root = Stat("Load", "1")\n`, {}, { Stat: (ctx) => Stat({ ...ctx, props: { ...ctx.props, spark: values } }) });
    expect(long.host.querySelector(".gistui-stat__spark") !== null).toBe(true);
    expect(long.host.querySelector(".gistui-error") === null).toBe(true);
    long.done();
  });

  test("an option listed twice renders once; the first position keeps its hint", async () => {
    const s = show(`root = Stack(RadioGroup("r", "R", ["A", "B", "A"], hints:["first", "second", "third"]), CheckboxGroup("c", "C", ["A", "A", "B"]), Select("s", "S", ["A", "A", "B"]), Combobox("k", "K", ["A", "A", "B"]), TagInput("t", "T", options:["A", "A", "B"], value:["x", "x"]))\n`);
    await until(() => s.host.querySelector('[data-gistui="Select"] .gistui-option') !== null && s.host.querySelector('[data-gistui="Combobox"] .gistui-option') !== null && s.host.querySelector('[data-gistui="TagInput"] .gistui-chip') !== null && s.host.querySelector('[data-gistui="RadioGroup"] .gistui-choice__item') !== null);
    const count = (sel: string) => s.$$(sel).length;
    expect([count('[data-gistui="RadioGroup"] .gistui-choice__item'), count('[data-gistui="CheckboxGroup"] .gistui-choice__item'), count('[data-gistui="Select"] .gistui-option'), count('[data-gistui="Select"] select option'), count('[data-gistui="Combobox"] .gistui-option'), count('[data-gistui="TagInput"] .gistui-tag'), count('[data-gistui="TagInput"] .gistui-chip')]).toEqual([2, 2, 2, 3, 2, 1, 2]);
    expect(s.$$('[data-gistui="RadioGroup"] .gistui-choice__hint').map((e) => e.textContent)).toEqual(["first", "second"]);
    s.done();
  });

  test("an error is announced from its control, with ids that do not collide across forms", async () => {
    const form = (n: string) => `Form("${n}", RadioGroup("plan", "Plan", ["Free", "Pro"], required), CheckboxGroup("topics", "Topics", ["AI", "Data"], required), Select("size", "Size", ["S", "M"], required), Combobox("city", "City", ["Oslo", "Rome"], required), TagInput("cc", "CC", required), DatePicker("due", "Due", required), TimePicker("slot", "Time", required), Button("Save"))`;
    const s = show(`root = Stack(a, b)\na = ${form("a")}\nb = ${form("b")}\n`);
    await until(() => s.host.querySelectorAll('[data-scope="select"][data-part="trigger"]').length === 4 && s.host.querySelectorAll('[data-scope="combobox"][data-part="input"]').length === 2 && s.host.querySelectorAll('[data-scope="date-picker"][data-part="trigger"]').length === 2 && s.host.querySelectorAll(".gistui-taginput").length === 2 && s.host.querySelectorAll('[data-scope="radio-group"][data-part="root"]').length === 2);
    for (const b of s.$$<HTMLButtonElement>('button[type="submit"]')) b.click();
    await until(() => s.host.querySelectorAll(".gistui-field__error").length === 14);
    const ids = s.$$(".gistui-field__error").map((e) => e.id);
    expect(ids.length).toBe(14);
    expect(new Set(ids).size).toBe(14);
    // Every error is pointed at by exactly one control, which is marked invalid.
    for (const id of ids) {
      const described = s.$$(`[aria-describedby="${CSS.escape(id)}"]`);
      expect([id, described.length]).toEqual([id, 1]);
      const control = described[0]!;
      expect([id, control.getAttribute("aria-invalid") === "true" || control.querySelector('[aria-invalid="true"]') !== null]).toEqual([id, true]);
    }
    for (const kind of ["Select", "Combobox", "TimePicker", "DatePicker", "TagInput", "RadioGroup", "CheckboxGroup"]) expect([kind, s.$(`[data-gistui="${kind}"]`).getAttribute("data-invalid")]).toEqual([kind, ""]);
    expect(s.$('[data-scope="radio-group"][data-part="root"]').getAttribute("aria-invalid")).toBe("true");
    s.done();
  });

  test("Hero's button is locked while streaming, like Button", async () => {
    const src = `root = Hero("Launch", "Soon", cta:"Notify me")\n`;
    const warm = show(src);
    await until(() => warm.host.querySelector(".gistui-hero") !== null);
    warm.done();
    const s = show(src, { streaming: true });
    const cta = s.$<HTMLButtonElement>(".gistui-hero .gistui-button");
    expect([cta.disabled, cta.getAttribute("data-locked")]).toEqual([true, "true"]);
    s.view.update({ streaming: false });
    expect([cta.disabled, cta.hasAttribute("data-locked")]).toEqual([false, false]);
    s.done();
  });

  test("an image URL assembled from data is not loaded, as a prop or in Markdown (E)", async () => {
    const s = show(`d = {secret: "s3cr3t", img: "https://cdn.shop.example/a.png"}\nroot = Stack(Image("https://evil.example/p.png?d=" + d.secret, alt:"built"), Image(d.img, alt:"data"), Image("https://pics.example/x.png", alt:"static"), Text("![md](https://evil.example/md.png?d=" + d.secret + ")"), Text("![ok](https://pics.example/md.png)"), Callout("![c](https://evil.example/c.png?d=" + d.secret + ")"), Tile("T", body:"![t](https://evil.example/t.png?d=" + d.secret + ")"), Tile("U", body:"![fine](https://pics.example/t.png)"))\n`);
    await new Promise((r) => setTimeout(r, 30));
    await until(() => s.host.querySelector(".gistui-tile") !== null);
    const all = s.$$("img").map((i) => i.getAttribute("src"));
    expect(all.filter((x) => x?.includes("evil.example"))).toEqual([]);
    for (const ok of ["https://cdn.shop.example/a.png", "https://pics.example/x.png", "https://pics.example/md.png", "https://pics.example/t.png"]) expect(all).toContain(ok);
    s.done();
  });
});

describe("more behaviour shared with the React renderer (A4, X10)", () => {
  test("the DatePicker time list is one tab stop, moved with the arrow keys", async () => {
    const s = show(`root = DatePicker("at", "Starts", time, value:"2026-10-01T10:00")\n`);
    await until(() => s.host.querySelectorAll('.gistui-dp__times [role="option"]').length > 10);
    const options = s.$$('.gistui-dp__times [role="option"]');
    const stops = options.filter((o) => o.getAttribute("tabindex") === "0");
    expect(stops.length).toBe(1);
    expect([stops[0]!.textContent, stops[0]!.getAttribute("aria-selected"), stops[0]!.getAttribute("data-selected")]).toEqual(["10:00 AM", "true", "true"]);
    expect(options.filter((o) => o.getAttribute("tabindex") === "-1").length).toBe(options.length - 1);
    stops[0]!.focus();
    const at = options.indexOf(stops[0]!);
    const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    key(stops[0]!, "ArrowDown");
    expect(focused(options[at + 1]!)).toBe(true);
    key(options[at + 1]!, "Home");
    expect(focused(options[0]!)).toBe(true);
    key(options[0]!, "End");
    expect(focused(options.at(-1)!)).toBe(true);
    // No time chosen yet: the default time (9:00 AM) is the tab stop.
    const none = show(`root = DatePicker("at", "Starts", time)\n`);
    await until(() => none.host.querySelectorAll('.gistui-dp__times [role="option"]').length > 0);
    expect(none.$$('.gistui-dp__times [role="option"][tabindex="0"]').map((o) => o.textContent)).toEqual(["9:00 AM"]);
    none.done();
    s.done();
  });

  test("a bound number Input keeps what is typed: 2.05, not 25", async () => {
    const s = show(`$n = 1\nroot = Stack(Input("n", "N", type:number, bind:$n), Text("n=" + $n))\n`);
    const input = s.$<HTMLInputElement>('input[name="n"]');
    // The text typed stands for a number written differently ("2.0" is 2, ".5" is 0.5): it stays
    // while the field has focus, or the next key would land in the wrong place ("2.0" + "5" → "25").
    input.focus();
    for (const text of ["7", "2.0", ".5", "2.0", "2.05"]) {
      type(input, text);
      expect(input.value).toBe(text);
    }
    await tick();
    expect(s.$(".gistui-text").textContent).toContain("n=2.05");
    // A value set from elsewhere still shows.
    s.set("n", 7);
    expect(input.value).toBe("7");
    s.done();
  });
});

describe("the viewer gives focus back (X17)", () => {
  test("Lightbox: closed while still in the page, and the picture that opened it gets focus back", async () => {
    const close = HTMLDialogElement.prototype.close;
    const calls: boolean[] = [];
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, ...args: []) {
      calls.push(this.isConnected);
      return close.apply(this, args);
    };
    try {
      const s = show(`root = Image("https://example.com/a.png", "A", zoom)\n`);
      const opener = s.$<HTMLButtonElement>(".gistui-image__zoom");
      opener.focus();
      opener.click();
      await until(() => s.host.querySelector(".gistui-lightbox") !== null);
      const x = s.$<HTMLButtonElement>('.gistui-lightbox [aria-label="Close"]');
      x.focus();
      x.click();
      expect(s.host.querySelector(".gistui-lightbox") === null).toBe(true);
      expect(calls).toEqual([true]);
      expect(focused(opener)).toBe(true);
      s.done();
    } finally {
      HTMLDialogElement.prototype.close = close;
    }
  });
});

describe("the viewer opens where the React renderer puts it", () => {
  test("in the Image's figure and in the Gallery; for a Media card (a button) at the GistUI root", async () => {
    const u = "https://example.com/a.png";
    const s = show(`root = Stack(Image("${u}", zoom), Gallery(["${u}"]), Media("${u}", title:"M", zoom))\n`);
    await until(() => s.host.querySelector(".gistui-gallery__item") !== null && s.host.querySelector(".gistui-media") !== null);
    const cases: [string, string][] = [
      [".gistui-image__zoom", "gistui-image"],
      [".gistui-gallery__item", "gistui-gallery"],
      [".gistui-media", "gistui"],
    ];
    for (const [opener, parent] of cases) {
      s.$<HTMLButtonElement>(opener).click();
      await until(() => s.host.querySelector(".gistui-lightbox") !== null);
      const viewer = s.$(".gistui-lightbox");
      expect([opener, viewer.parentElement!.classList.contains(parent), viewer.parentElement!.lastElementChild === viewer]).toEqual([opener, true, true]);
      expect(viewer.querySelector("[autofocus]") === null).toBe(true);
      // A redraw of the opener keeps its open viewer.
      s.view.update({ lockUntil: opener === ".gistui-gallery__item" ? "ready" : "done" });
      expect(viewer.isConnected).toBe(true);
      s.$<HTMLButtonElement>('.gistui-lightbox [aria-label="Close"]').click();
      expect(s.host.querySelector(".gistui-lightbox") === null).toBe(true);
    }
    s.done();
  });
});
