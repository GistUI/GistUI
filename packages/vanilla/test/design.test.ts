/** The design mapping is its own chunk: a failed load must not leave styled nodes hidden for good. */
import { expect, test } from "bun:test";
import { design } from "../src/design";
import { mount } from "../src/index";
import { ui } from "../src/ui";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test("a styled node whose mapping cannot be loaded shows unstyled, and gets its style once a load works", async () => {
  // The chunk as a test controls it: every load fails until `online`.
  const { load, current } = design;
  let online = false;
  let loads = 0;
  design.current = null;
  design.load = () => (loads++, online ? load().then((m) => (design.current = m)) : Promise.reject(new Error("offline")));
  try {
    const host = document.createElement("div");
    const view = mount(host, { library: ui, source: `root = Card(Header("Styled"), style:{pad:"lg"})\n` });
    const card = host.querySelector<HTMLElement>(".gistui-card")!;
    // Loading: the node keeps its space but is not shown yet.
    expect([card.style.visibility, card.hasAttribute("data-style-pending")]).toEqual(["hidden", true]);
    await tick(20);
    // It could not be loaded: shown without the style, and no load after load in a loop.
    expect([card.style.visibility, card.hasAttribute("data-style-pending"), card.hasAttribute("data-styled")]).toEqual(["", false, false]);
    expect(loads).toBe(2);
    // The next time the node renders, the chunk is asked for again; this time it arrives.
    online = true;
    view.update({ classNames: { Card: "p-8" } });
    for (let i = 0; i < 200 && !card.hasAttribute("data-styled"); i++) await tick(5);
    expect([card.style.visibility, card.hasAttribute("data-styled")]).toEqual(["", true]);
    expect(host.querySelector(".gistui-card")).toBe(card);
    view.destroy();
  } finally {
    design.load = load;
    if (!design.current) design.current = current;
  }
});
