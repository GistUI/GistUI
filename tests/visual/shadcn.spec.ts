/**
 * Your own components plugged into GistUI behave like the built-in ones: the same program
 * (`examples/react-shadcn/src/program.ts`) rendered with GistUI's components and with shadcn/ui
 * (through `useGistField` / `useGistButton`), driven by the same user actions, must show the same
 * errors and submit the same values. Screenshots of both go to `tests/visual/.output/shadcn`.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

type UI = "builtin" | "shadcn";
type Action = { type: string; partial?: boolean; values?: Record<string, unknown> };
const OUT = fileURLToPath(new URL("./.output/shadcn", import.meta.url));
mkdirSync(OUT, { recursive: true });

async function open(page: Page, ui: UI) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/check.html?ui=${ui}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  return errors;
}
const actions = (page: Page) => page.evaluate(() => (window as unknown as { __actions: Action[] }).__actions);
const errorTexts = (page: Page) => page.locator('form [role="alert"]').allTextContents();

async function pickPlan(page: Page, ui: UI, plan: string) {
  // Zag's trigger (built-in) and Radix's (shadcn) differ; the options are role="option" in both.
  await page.locator(ui === "shadcn" ? '[data-slot="select-trigger"]' : '[data-scope="select"][data-part="trigger"]').click();
  await page.getByRole("option", { name: plan }).click();
}

async function fill(page: Page, ui: UI) {
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Work email").fill("ada@example.com");
  await pickPlan(page, ui, "Team");
  // Click the label, as a user does (the built-in checkbox draws its own box over the input).
  await page.getByText("I agree to the terms", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "I agree to the terms" })).toBeChecked();
}

/** Runs `scenario` on both renderings and returns both results. */
async function both<T>(page: Page, scenario: (ui: UI) => Promise<T>): Promise<Record<UI, T>> {
  const out = {} as Record<UI, T>;
  for (const ui of ["builtin", "shadcn"] as const) {
    const pageErrors = await open(page, ui);
    out[ui] = await scenario(ui);
    expect(pageErrors, `${ui}: page errors`).toEqual([]);
  }
  return out;
}

test("an empty submit shows the same errors and sends nothing", async ({ page }) => {
  const r = await both(page, async (ui) => {
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator('form [role="alert"]').first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/errors-${ui}.png`, fullPage: true });
    return { errors: await errorTexts(page), submits: (await actions(page)).filter((a) => a.type === "submit").length };
  });
  expect(r.builtin.errors.length).toBeGreaterThan(0);
  expect(r.shadcn).toEqual(r.builtin);
});

test("filled in, both submit the same typed values and clear their errors", async ({ page }) => {
  const r = await both(page, async (ui) => {
    await page.getByRole("button", { name: "Create account" }).click();
    await fill(page, ui);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect.poll(async () => (await actions(page)).some((a) => a.type === "submit")).toBe(true);
    await page.screenshot({ path: `${OUT}/submitted-${ui}.png`, fullPage: true });
    const submit = (await actions(page)).find((a) => a.type === "submit")!;
    return { values: submit.values, partial: submit.partial, errors: await errorTexts(page) };
  });
  expect(r.builtin).toEqual({ values: { name: "Ada Lovelace", email: "ada@example.com", plan: "Team", terms: true }, partial: false, errors: [] });
  expect(r.shadcn).toEqual(r.builtin);
});

test("a too-short name and a bad email show the same messages", async ({ page }) => {
  const r = await both(page, async () => {
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator('form [role="alert"]').first()).toBeVisible();
    return errorTexts(page);
  });
  expect(r.builtin.length).toBeGreaterThan(0);
  expect(r.shadcn).toEqual(r.builtin);
});

test("Save draft submits a partial draft without requiring fields", async ({ page }) => {
  const r = await both(page, async () => {
    await page.getByLabel("Full name").fill("Ada");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect.poll(async () => (await actions(page)).some((a) => a.type === "submit")).toBe(true);
    const submit = (await actions(page)).find((a) => a.type === "submit")!;
    return { partial: submit.partial, values: submit.values };
  });
  expect(r.builtin.partial).toBe(true);
  expect(r.shadcn).toEqual(r.builtin);
});

test("a Button with opens: opens its Dialog; close closes it", async ({ page }) => {
  const r = await both(page, async (ui) => {
    await page.getByRole("button", { name: "Compare plans" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${OUT}/dialog-${ui}.png` });
    const text = await dialog.textContent();
    await dialog.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return text?.includes("Enterprise adds self-hosting");
  });
  expect(r).toEqual({ builtin: true, shadcn: true });
});
