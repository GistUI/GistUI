import { describe, expect, test } from "bun:test";
import { libraryOf, mount } from "../src/index";
import { ui } from "../src/ui";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("mount", () => {
  test("renders a program with the same markup as the React renderer", () => {
    const host = document.createElement("div");
    const view = mount(host, { library: ui, source: `root = Page(head, Card(Header("Revenue", subtitle:"Last 30 days")), gap:lg)\nhead = Header("Overview")\n` });
    const page = host.querySelector(".gistui > .gistui-page")!;
    expect(page.getAttribute("data-gistui")).toBe("Page");
    expect(page.getAttribute("data-gap")).toBe("lg");
    expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Overview");
    expect(host.querySelector(".gistui-card .gistui-header__subtitle")!.textContent).toBe("Last 30 days");
    view.destroy();
    expect(host.children.length).toBe(0);
  });

  test("streams: appended text updates in place; elements are reused, not recreated", () => {
    const host = document.createElement("div");
    const src = `root = Page(a, b)\na = Card(Header("One"))\n`;
    const view = mount(host, { library: ui, source: src, streaming: true });
    const card = host.querySelector(".gistui-card");
    expect(card).not.toBeNull();
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBe("true");
    view.update({ source: `${src}b = Card(Header("Two"))\n`, streaming: false });
    expect(host.querySelectorAll(".gistui-card").length).toBe(2);
    expect(host.querySelector(".gistui-card")).toBe(card);
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    view.destroy();
  });

  test("tabs: labels from the Tab children, selection by click and through bind:$var", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const states: unknown[] = [];
    const view = mount(host, {
      library: ui,
      source: `$tab = "Two"\nroot = Tabs(Tab(Header("first"), label:"One"), Tab(Header("second"), label:"Two"), bind:$tab)\n`,
      onStateChange: (n, v) => states.push([n, v]),
    });
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["One", "Two"]);
    const panels = [...host.querySelectorAll('[role="tabpanel"]')];
    expect(panels.map((p) => p.hasAttribute("hidden"))).toEqual([true, false]);
    (tabs[0] as HTMLElement).click();
    await tick();
    expect([...host.querySelectorAll('[role="tabpanel"]')].map((p) => p.hasAttribute("hidden"))).toEqual([false, true]);
    expect(states).toContainEqual(["tab", "One"]);
    view.destroy();
    host.remove();
  });

  test("theme, colour and classNames on the root and components", () => {
    const host = document.createElement("div");
    const view = mount(host, { library: ui, source: `root = Card(Header("x"))\n`, theme: "dark", color: "teal", classNames: { Card: "rounded-3xl shadow" } });
    const root = host.querySelector(".gistui")!;
    expect(root.getAttribute("data-gistui-theme")).toBe("dark");
    expect(root.getAttribute("data-gistui-color")).toBe("teal");
    expect(host.querySelector(".gistui-card")!.className).toBe("gistui-card rounded-3xl shadow");
    view.update({ classNames: { Card: "p-8" } });
    expect(host.querySelector(".gistui-card")!.className).toBe("gistui-card p-8");
    view.destroy();
  });

  test("a component not ported yet renders its children in a plain box", () => {
    const host = document.createElement("div");
    const view = mount(host, { library: libraryOf(ui.core, new Map()), source: `root = Page(Header("Body"))\n` });
    expect(host.querySelector(".gistui-unknown")).not.toBeNull();
    view.destroy();
  });
});

describe("content", () => {
  test("Text renders Markdown; Callout, Tag, Icon, FollowUps match the React markup", async () => {
    const host = document.createElement("div");
    const actions: unknown[] = [];
    const view = mount(host, {
      library: ui,
      onAction: (a) => actions.push(a),
      source: `root = Page("## Hello **world**", Callout("Check the *numbers*", title:"Heads up", tone:warning), Tag("Live", tone:success, icon:check, pill), Icon(sun, plain), FollowUps(["More detail", "Compare"]))\n`,
    });
    await tick();
    expect(host.querySelector(".gistui-text h2")!.textContent).toBe("Hello world");
    expect(host.querySelector(".gistui-callout")!.getAttribute("data-tone")).toBe("warning");
    expect(host.querySelector(".gistui-callout__title")!.textContent).toBe("Heads up");
    expect(host.querySelector(".gistui-callout em")!.textContent).toBe("numbers");
    const tag = host.querySelector(".gistui-tag")!;
    expect([tag.getAttribute("data-tone"), tag.getAttribute("data-shape"), tag.textContent]).toEqual(["success", "pill", "Live"]);
    expect(tag.querySelector("svg.gistui-icon")).not.toBeNull();
    expect(host.querySelector(".gistui-icon-plain svg")).not.toBeNull();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".gistui-followup")];
    expect(buttons.map((b) => b.textContent)).toEqual(["More detail", "Compare"]);
    buttons[1]!.click();
    expect(actions).toEqual([{ type: "send", message: "Compare", nodeId: expect.any(String) }]);
    view.destroy();
  });
});

describe("data", () => {
  test("Table from a pipe table: sort, tags and paging; Stat and Stats; Progress", async () => {
    const host = document.createElement("div");
    const rows = Array.from({ length: 14 }, (_, i) => `|Item ${i + 1}|${(i * 7) % 10}|${i % 2 ? "Healthy" : "At risk"}`).join("\n");
    const view = mount(host, {
      library: ui,
      source: `root = Page(t, Stat("Revenue", "$1.2M", delta:"+8%"), Stats(kpis), Progress("Done", value:30, max:60))\nt = Table(rows, sort, tags:["Status"])\nrows = |Name|Score|Status\n${rows}\nkpis = |Label|Value|Delta\n|Users|3,941|+2%\n|Churn|1.2%|-0.3%\n`,
    });
    await tick();
    const table = host.querySelector(".gistui-table")!;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Name", "Score", "Status"]);
    expect(table.querySelectorAll("tbody tr").length).toBe(10);
    expect(table.querySelector(".gistui-table__pager span")!.textContent).toBe("1–10 of 14");
    expect(table.querySelector("td .gistui-tag")!.getAttribute("data-tone")).toBe("danger");
    // Sort by Score, then go to page 2.
    (table.querySelectorAll<HTMLButtonElement>(".gistui-table__sort")[1]!).click();
    expect(table.querySelector("th[aria-sort]")!.getAttribute("aria-sort")).toBe("ascending");
    [...table.querySelectorAll<HTMLButtonElement>(".gistui-page-btn")].find((b) => b.textContent === "2")!.click();
    expect(table.querySelector(".gistui-table__pager span")!.textContent).toBe("11–14 of 14");
    const stat = host.querySelector(".gistui-stat")!;
    expect(stat.querySelector(".gistui-stat__value")!.textContent).toBe("$1.2M");
    expect(stat.querySelector(".gistui-stat__delta")!.getAttribute("data-trend")).toBe("up");
    expect([...host.querySelectorAll(".gistui-stats .gistui-stat__label")].map((x) => x.textContent)).toEqual(["Users", "Churn"]);
    expect(host.querySelector<HTMLElement>(".gistui-progress__bar")!.style.width).toBe("50%");
    view.destroy();
  });

  test("Chart loads its engine lazily and draws an SVG", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: `root = Chart(sales, type:bar, title:"Sales")\nsales = |Month|Revenue\n|Jan|10\n|Feb|14\n` });
    expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Sales");
    await new Promise((r) => setTimeout(r, 50));
    expect(host.querySelector("[data-gistui='Chart'] svg")).not.toBeNull();
    view.destroy();
    host.remove();
  });
});

describe("forms", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };

  test("validation on submit, errors under fields, then a typed submit action with schema and ids", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: any[] = [];
    const view = mount(host, {
      library: ui,
      onAction: (a) => actions.push(a),
      source: `root = Form("signup", Input("email", "Email", type:email, required), Input("seats", "Seats", type:number, min:1), Checkbox("terms", "I agree", required))\n`,
    });
    const form = host.querySelector("form")!;
    // No submit button in the program: the form adds one.
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"][data-auto]')!;
    expect(submit.textContent).toBe("Submit");
    submit.click();
    await until(() => host.querySelectorAll(".gistui-field__error").length > 0);
    expect([...host.querySelectorAll(".gistui-field__error")].map((e) => e.textContent)).toEqual(["Email is required", "This must be checked to continue"]);
    expect(actions).toEqual([]);
    const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
    email.value = "ada@example.com";
    form.querySelector<HTMLInputElement>('input[name="seats"]')!.value = "3";
    form.querySelector<HTMLInputElement>('input[name="terms"]')!.click();
    submit.click();
    await until(() => actions.length > 0);
    const a = actions[0];
    expect(a.type).toBe("submit");
    expect(a.form).toBe("signup");
    expect(a.values).toEqual({ email: "ada@example.com", seats: 3, terms: true });
    expect(a.formId).toMatch(/^form_/);
    expect(a.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.schema.properties.email.format).toBe("email");
    expect(a.message).toContain('Submitted "signup"');
    view.destroy();
    host.remove();
  });

  test("a step form validates each step; a Button with opens: controls its Dialog; close closes it", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, {
      library: ui,
      source: `root = Page(wiz, Button("Invite", opens:invite))\nwiz = Form("w", Step("Account", Input("name", "Name", required)), Step("Plan", Input("plan", "Plan")))\ninvite = Dialog("Invite", Text("Who?"), Button("Cancel", v:ghost, close))\n`,
    });
    const wizard = host.querySelector('form[data-wizard]')!;
    expect([...wizard.querySelectorAll(".gistui-stepper__label")].map((e) => e.textContent)).toEqual(["Account", "Plan"]);
    const next = wizard.querySelector<HTMLButtonElement>("button[data-auto]")!;
    expect(next.textContent).toBe("Continue");
    next.click();
    await until(() => host.querySelector(".gistui-field__error") !== null);
    expect(wizard.querySelector('[data-step="0"]')!.hasAttribute("hidden")).toBe(false);
    wizard.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Ada";
    next.click();
    await until(() => !wizard.querySelector('[data-step="1"]')!.hasAttribute("hidden"));
    expect(wizard.querySelector(".gistui-form__count")!.textContent).toBe("Step 2 of 2");
    // The dialog is closed until its button opens it.
    expect(host.querySelector("dialog")).toBeNull();
    [...host.querySelectorAll<HTMLButtonElement>(".gistui-button")].find((b) => b.textContent === "Invite")!.click();
    expect(host.querySelector("dialog .gistui-dialog__title")!.textContent).toBe("Invite");
    [...host.querySelectorAll<HTMLButtonElement>("dialog .gistui-button")].find((b) => b.textContent === "Cancel")!.click();
    expect(host.querySelector("dialog")!.hasAttribute("data-closing")).toBe(true);
    view.destroy();
    host.remove();
  });

  test("bind:$var keeps an Input and the program's text in sync; a plain Button sends its label", async () => {
    const host = document.createElement("div");
    const actions: any[] = [];
    const view = mount(host, { library: ui, onAction: (a) => actions.push(a), source: `$who = "Ada"\nroot = Page(Input("who", "Name", bind:$who), Text("Hello " + $who), Button("Ping"))\n` });
    const input = host.querySelector<HTMLInputElement>('input[name="who"]')!;
    expect(input.value).toBe("Ada");
    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(host.querySelector(".gistui-text")!.textContent).toContain("Hello Grace");
    host.querySelector<HTMLButtonElement>(".gistui-button")!.click();
    expect(actions).toEqual([{ type: "send", message: "Ping", nodeId: expect.any(String) }]);
    view.destroy();
  });
});

describe("select (Zag, lazy)", () => {
  test("a look-alike shows first, then Zag's select: open, pick, bound value and form value", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: any[] = [];
    const view = mount(host, { library: ui, onAction: (a) => actions.push(a), source: `$plan = "Pro"\nroot = Form("f", Select("plan", "Plan", ["Free", "Pro", "Team"], bind:$plan), Text("You picked " + $plan))\n` });
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
    };
    await until(() => host.querySelector('[data-scope="select"][data-part="trigger"]') !== null);
    const trigger = host.querySelector<HTMLButtonElement>('[data-scope="select"][data-part="trigger"]')!;
    expect(host.querySelector('[data-scope="select"][data-part="value-text"]')!.textContent).toBe("Pro");
    trigger.click();
    await until(() => host.querySelector('[data-scope="select"][data-part="content"][data-state="open"]') !== null);
    const team = [...host.querySelectorAll<HTMLElement>('[data-scope="select"][data-part="item"]')].find((li) => li.textContent === "Team")!;
    team.click();
    await until(() => host.querySelector(".gistui-text")!.textContent!.includes("Team"));
    expect(host.querySelector(".gistui-text")!.textContent).toContain("You picked Team");
    host.querySelector<HTMLButtonElement>("button[data-auto]")!.click();
    await until(() => actions.length > 0);
    expect(actions[0].values).toEqual({ plan: "Team" });
    view.destroy();
    host.remove();
  });
});

describe("choices", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };

  test("RadioGroup (Zag), CheckboxGroup and TagInput submit typed values", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: any[] = [];
    const view = mount(host, {
      library: ui,
      onAction: (a) => actions.push(a),
      source: `root = Form("f", RadioGroup("plan", "Plan", ["Free", "Pro"], value:"Pro", v:cards), CheckboxGroup("addons", "Add-ons", ["SSO", "Audit", "SLA"], v:chips), TagInput("emails", "Invite", type:email))\n`,
    });
    await until(() => host.querySelector('[data-scope="radio-group"][data-part="item"]') !== null && host.querySelector(".gistui-taginput") !== null);
    const items = [...host.querySelectorAll<HTMLElement>('[data-scope="radio-group"][data-part="item"]')];
    expect(items.map((i) => i.textContent)).toEqual(["Free", "Pro"]);
    expect(items[1]!.getAttribute("data-state")).toBe("checked");
    host.querySelectorAll<HTMLInputElement>('input[name="addons"]')[2]!.click();
    const tagInput = host.querySelector<HTMLInputElement>(".gistui-taginput__input")!;
    tagInput.value = "nope";
    tagInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(host.querySelector('[data-gistui="TagInput"] .gistui-field__error')!.textContent).toContain("not a valid email");
    tagInput.value = "ada@example.com";
    tagInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect([...host.querySelectorAll(".gistui-taginput .gistui-tag")].map((t) => t.textContent)).toEqual(["ada@example.com"]);
    host.querySelector<HTMLButtonElement>("button[data-auto]")!.click();
    await until(() => actions.length > 0);
    expect(actions[0].values).toEqual({ plan: "Pro", addons: ["SLA"], emails: ["ada@example.com"] });
    view.destroy();
    host.remove();
  });

  test("Combobox (Zag) filters as you type and picks a value", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: `$city = ""\nroot = Page(Combobox("city", "City", ["Berlin", "Bern", "Boston"], bind:$city), Text("City: " + $city))\n` });
    await until(() => host.querySelector('[data-scope="combobox"][data-part="input"]') !== null);
    const input = host.querySelector<HTMLInputElement>('[data-scope="combobox"][data-part="input"]')!;
    input.focus();
    input.value = "ber";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await until(() => host.querySelectorAll('[data-scope="combobox"][data-part="item"]').length === 2);
    expect([...host.querySelectorAll('[data-scope="combobox"][data-part="item"]')].map((i) => i.textContent)).toEqual(["Berlin", "Bern"]);
    host.querySelectorAll<HTMLElement>('[data-scope="combobox"][data-part="item"]')[1]!.click();
    await until(() => host.querySelector(".gistui-text")!.textContent!.includes("Bern"));
    expect(host.querySelector(".gistui-text")!.textContent).toContain("City: Bern");
    view.destroy();
    host.remove();
  });
});

describe("extras", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  test("Slider, Code, Math, Avatar, KeyValue, Pricing, Hero render like React's", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const actions: any[] = [];
    const view = mount(host, {
      library: ui,
      onAction: (a) => actions.push(a),
      source: `root = Page(Slider("seats", "Seats", min:1, max:50, value:5), Code("const a = 1", lang:"ts"), Math("x^2"), Avatar("Ada Lovelace", "Engineer"), KeyValue(specs), Pricing(plans, highlight:"Pro"), Hero("Ship faster", subtitle:"Generative UI", cta:"Start"))\nspecs = |Key|Value\n|Weight|1.2 kg\n|Battery|20 h\nplans = |Plan|Price|Features\n|Free|$0|1 project\n|Pro|$20|Unlimited; SSO\n`,
    });
    await until(() => host.querySelector(".gistui-hero") !== null && host.querySelector(".gistui-math math") !== null);
    expect(host.querySelector(".gistui-slider__value")!.textContent).toBe("5");
    expect(host.querySelector(".gistui-code .tok-k")!.textContent).toBe("const");
    expect(host.querySelector(".gistui-math math")).not.toBeNull();
    expect(host.querySelector(".gistui-avatar__pic")!.textContent).toBe("AL");
    expect([...host.querySelectorAll(".gistui-kv dt")].map((d) => d.textContent)).toEqual(["Weight", "Battery"]);
    expect(host.querySelector('.gistui-pricing__plan[data-featured] .gistui-pricing__name')!.textContent).toBe("Pro");
    expect([...host.querySelectorAll(".gistui-pricing__features li")].map((li) => li.textContent)).toEqual(["1 project", "Unlimited", "SSO"]);
    host.querySelector<HTMLButtonElement>(".gistui-hero .gistui-button")!.click();
    expect(actions).toEqual([{ type: "send", message: "Start", nodeId: expect.any(String) }]);
    view.destroy();
    host.remove();
  });
});

describe("rich, accordion, gallery", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  test("Tile, Media, Source, Timeline; Accordion opens items; Gallery opens the viewer", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, {
      library: ui,
      source: `root = Page(Tile("Revenue", value:"+12%", icon:dollar), Media("https://example.com/a.jpg", title:"Kyoto"), Source("https://www.nature.com/x", title:"A study"), Timeline(steps), acc, Gallery(["https://example.com/1.jpg", "https://example.com/2.jpg"], captions:["One", "Two"]))\nacc = Accordion(Item("First", Text("one"), open), Item("Second", Text("two")))\nsteps = |Title|Detail|Meta|State\n|Ordered|Paid|Mon|done\n|Shipped|UPS|Tue|current\n`,
    });
    await until(() => host.querySelector(".gistui-gallery__item") !== null && host.querySelector('[data-scope="accordion"][data-part="item-trigger"]') !== null && host.querySelector(".gistui-timeline") !== null);
    expect(host.querySelector('.gistui-tile[data-gistui="Tile"] .gistui-tile__value')!.getAttribute("data-trend")).toBe("up");
    expect(host.querySelector(".gistui-media__title")!.textContent).toBe("Kyoto");
    expect(host.querySelector('[data-gistui="Source"] .gistui-tile__title')!.textContent).toBe("nature.com");
    expect([...host.querySelectorAll(".gistui-timeline__item")].map((li) => li.getAttribute("data-state"))).toEqual(["done", "current"]);
    const triggers = [...host.querySelectorAll<HTMLButtonElement>('[data-scope="accordion"][data-part="item-trigger"]')];
    expect(triggers.map((t) => t.textContent)).toEqual(["First", "Second"]);
    const contents = () => [...host.querySelectorAll('[data-scope="accordion"][data-part="item-content"]')].map((c) => c.getAttribute("data-state"));
    expect(contents()).toEqual(["open", "closed"]);
    // A real click focuses the button first (Zag relies on it); happy-dom's click() does not.
    triggers[1]!.focus();
    triggers[1]!.click();
    await until(() => contents()[1] === "open");
    expect(contents()).toEqual(["closed", "open"]);
    host.querySelectorAll<HTMLButtonElement>(".gistui-gallery__item")[1]!.click();
    await until(() => host.querySelector("dialog.gistui-lightbox") !== null);
    expect(host.querySelector(".gistui-lightbox__count")!.textContent).toBe("2 / 2");
    expect(host.querySelector(".gistui-lightbox figcaption")!.textContent).toBe("Two");
    host.querySelector<HTMLButtonElement>('.gistui-lightbox__nav[data-side="end"]')!.click();
    expect(host.querySelector(".gistui-lightbox__count")!.textContent).toBe("1 / 2");
    host.querySelector<HTMLButtonElement>('.gistui-lightbox__btn[aria-label="Close"]')!.click();
    expect(host.querySelector("dialog.gistui-lightbox")).toBeNull();
    view.destroy();
    host.remove();
  });
});

describe("slides and reports", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  test("Slides (deck): one slide active, next/previous, dots and arrow keys", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: `root = Slides(Slide(Header("One"), layout:center, bg:inverse), Slide(Header("Two")), Slide(Header("Three")), title:"Pitch")\n` });
    await until(() => host.querySelectorAll(".gistui-slide").length === 3);
    const deck = host.querySelector<HTMLElement>('.gistui-slides[data-gistui="Slides"]')!;
    expect(deck.getAttribute("aria-label")).toBe("Pitch");
    const states = () => [...host.querySelectorAll(".gistui-slide")].map((s) => s.getAttribute("data-state"));
    expect(states()).toEqual(["active", "after", "after"]);
    expect(host.querySelector(".gistui-slide")!.getAttribute("data-bg")).toBe("inverse");
    expect(host.querySelector(".gistui-slides__count")!.textContent).toBe("1 / 3");
    expect(host.querySelectorAll(".gistui-slides__dot").length).toBe(3);
    host.querySelector<HTMLButtonElement>('[aria-label="Next slide"]')!.click();
    expect(states()).toEqual(["before", "active", "after"]);
    expect(host.querySelector(".gistui-slides__count")!.textContent).toBe("2 / 3");
    deck.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(states()).toEqual(["before", "before", "active"]);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Next slide"]')!.disabled).toBe(true);
    host.querySelectorAll<HTMLButtonElement>(".gistui-slides__dot")[0]!.click();
    expect(states()).toEqual(["active", "after", "after"]);
    expect(host.querySelector(".gistui-slide[aria-hidden]")).not.toBeNull();
    view.destroy();
    host.remove();
  });

  test("Report: thumbnails are copies, all pages shown, footers, page navigation and zoom", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const view = mount(host, { library: ui, source: `root = Report(Sheet(Header("Cover"), layout:center), Sheet(Header("Results")), title:"Q3 review")\n` });
    await until(() => host.querySelector(".gistui-viewer__thumb .gistui-slide") !== null);
    const viewer = host.querySelector('.gistui-viewer[data-gistui="Report"]')!;
    expect(host.querySelector(".gistui-viewer__title")!.textContent).toBe("Q3 review");
    expect(viewer.hasAttribute("data-all")).toBe(true);
    // Two thumbnails (static copies) plus two main pages.
    expect(host.querySelectorAll(".gistui-viewer__thumb .gistui-slide").length).toBe(2);
    expect([...host.querySelectorAll(".gistui-viewer__thumb .gistui-slide")].map((s) => s.getAttribute("data-static"))).toEqual(["thumb", "thumb"]);
    const pages = [...host.querySelectorAll(".gistui-viewer__pages .gistui-slide")];
    expect(pages.map((s) => s.getAttribute("data-static"))).toEqual(["page", "page"]);
    expect(pages.map((s) => s.querySelector(".gistui-slide__foot")?.textContent)).toEqual(["Q3 review1 / 2", "Q3 review2 / 2"]);
    expect(host.querySelector(".gistui-viewer__count")!.textContent).toBe("1 / 2");
    host.querySelector<HTMLElement>('.gistui-viewer__thumb[aria-label="Page 2"]')!.click();
    expect(host.querySelector(".gistui-viewer__count")!.textContent).toBe("2 / 2");
    expect(host.querySelector('.gistui-viewer__thumb[aria-label="Page 2"]')!.getAttribute("aria-current")).toBe("true");
    host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();
    expect(host.querySelector(".gistui-viewer__zoom")!.textContent).toBe("110%");
    // "Show all" off: only the current page.
    const toggle = host.querySelector<HTMLInputElement>(".gistui-viewer__toggle input")!;
    toggle.click();
    expect(host.querySelectorAll(".gistui-viewer__pages .gistui-viewer__frame").length).toBe(1);
    expect(host.querySelector(".gistui-viewer__pages .gistui-header__title")!.textContent).toBe("Results");
    view.destroy();
    host.remove();
  });

  test("Slides(v:viewer) streams new slides into the rail", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const src = `root = Slides(a, b, v:viewer)\na = Slide(Header("A"))\n`;
    const view = mount(host, { library: ui, source: src, streaming: true });
    await until(() => host.querySelector(".gistui-viewer__thumb .gistui-slide") !== null);
    expect(host.querySelector('.gistui-viewer[data-gistui="Slides"]')!.hasAttribute("data-all")).toBe(false);
    view.update({ source: `${src}b = Slide(Header("B"))\n`, streaming: false });
    await until(() => host.querySelectorAll(".gistui-viewer__thumb .gistui-slide").length === 2);
    expect([...host.querySelectorAll(".gistui-viewer__thumb .gistui-header__title")].map((t) => t.textContent)).toEqual(["A", "B"]);
    expect(host.querySelector(".gistui-viewer__count")!.textContent).toBe("1 / 2");
    view.destroy();
    host.remove();
  });
});

describe("date and time pickers", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  test("DatePicker (Zag): calendar, pick a day, bound value; range shows two months; TimePicker picks a time", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const states: [string, unknown][] = [];
    const view = mount(host, {
      library: ui,
      source: `$due = "2026-10-01"\nroot = Stack(DatePicker("due", "Due date", bind:$due), DatePicker("trip", "Trip", range, presets), TimePicker("slot", "Time", step:60, min:"09:00", max:"12:00"))\n`,
      onStateChange: (n, v) => states.push([n, v]),
    });
    await until(() => host.querySelectorAll('[data-scope="date-picker"][data-part="trigger"]').length === 2 && host.querySelector('[data-gistui="TimePicker"] [data-part="trigger"]') !== null);
    const [single, range] = [...host.querySelectorAll<HTMLElement>('[data-gistui="DatePicker"]')];
    expect(single!.querySelector<HTMLInputElement>('[data-part="input"]')!.value).toBe("10/01/2026");
    expect(single!.querySelector(".gistui-dp__title")!.textContent).toBe("October 2026");
    expect(single!.querySelectorAll(".gistui-dp__table").length).toBe(1);
    expect(single!.querySelectorAll(".gistui-dp__table tbody tr").length).toBe(6);
    expect(range!.querySelectorAll(".gistui-dp__table").length).toBe(2);
    expect(range!.querySelectorAll(".gistui-dp__preset").length).toBe(7);
    expect(range!.querySelectorAll(".gistui-dp__input").length).toBe(2);
    // Pick the 15th.
    single!.querySelector<HTMLElement>('[data-part="trigger"]')!.click();
    const day15 = [...single!.querySelectorAll<HTMLElement>(".gistui-dp__day")].find((d) => d.textContent === "15" && !d.hasAttribute("data-outside-range"))!;
    day15.click();
    await until(() => states.length > 0);
    expect(states.at(-1)).toEqual(["due", "2026-10-15"]);
    expect(single!.querySelector<HTMLInputElement>('input[type="hidden"][name="due"]')!.value).toBe("2026-10-15");
    // TimePicker: hourly between 09:00 and 12:00.
    const tp = host.querySelector<HTMLElement>('[data-gistui="TimePicker"]')!;
    expect([...tp.querySelectorAll(".gistui-option")].map((o) => o.textContent)).toEqual(["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM"]);
    tp.querySelector<HTMLElement>('[data-part="trigger"]')!.click();
    await until(() => tp.querySelector('[data-part="content"][data-state="open"]') !== null);
    tp.querySelectorAll<HTMLElement>(".gistui-option")[1]!.click();
    await until(() => tp.querySelector('[data-part="value-text"]')!.textContent === "10:00 AM");
    expect(tp.querySelector<HTMLSelectElement>("select")!.value).toBe("10:00");
    view.destroy();
    host.remove();
  });
});

describe("autofix", () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };
  // An unknown prop, a misspelled component, a reference to nothing, and a statement never placed.
  const BROKEN = `root = Page(Card(Header("Hi"), colour:"red"), Txt("hello"), missing)\nnote = Callout("Placed by autofix")\n`;

  test("a program that ends with mistakes is repaired in code and shown repaired", async () => {
    const host = document.createElement("div");
    const fixes: { changes: string[] }[] = [];
    const errors: unknown[][] = [];
    const view = mount(host, { library: ui, source: BROKEN, onAutofix: (r) => fixes.push(r), onError: (e) => errors.push(e) });
    const card = host.querySelector(".gistui-card");
    await until(() => fixes.length > 0);
    // Repaired in place: what the repair did not touch keeps its element.
    expect(host.querySelector(".gistui-card")).toBe(card);
    expect(fixes[0]!.changes.length).toBeGreaterThan(0);
    expect(host.querySelector(".gistui-callout")?.textContent).toContain("Placed by autofix");
    expect(host.querySelector(".gistui-text")?.textContent).toBe("hello");
    expect(errors).toEqual([[]]);
    // The same source again does not start over.
    const callout = host.querySelector(".gistui-callout");
    view.update({ source: BROKEN });
    expect(host.querySelector(".gistui-callout")).toBe(callout);
    view.destroy();
  });

  test("a streamed response is repaired when it ends", async () => {
    const host = document.createElement("div");
    const fixes: unknown[] = [];
    const stream = new ReadableStream<string>({
      start(c) {
        for (let i = 0; i < BROKEN.length; i += 10) c.enqueue(BROKEN.slice(i, i + 10));
        c.close();
      },
    });
    const view = mount(host, { library: ui, stream, onAutofix: (r) => fixes.push(r) });
    await until(() => fixes.length > 0);
    expect(host.querySelector(".gistui-callout")?.textContent).toContain("Placed by autofix");
    expect(host.querySelector(".gistui")!.getAttribute("aria-busy")).toBeNull();
    view.destroy();
  });

  test("autofix: false keeps the program as written and reports its errors", async () => {
    const host = document.createElement("div");
    const errors: { code: string }[][] = [];
    const view = mount(host, { library: ui, source: BROKEN, autofix: false, onError: (e) => errors.push(e) });
    await new Promise((r) => setTimeout(r, 50));
    expect(host.querySelector(".gistui-callout")).toBeNull();
    expect(errors[0]!.map((e) => e.code)).toEqual(expect.arrayContaining(["unknown-prop", "unresolved-ref", "unreachable"]));
    view.destroy();
  });
});
