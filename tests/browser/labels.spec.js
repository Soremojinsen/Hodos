import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

const placedTexts = (page) => page.evaluate(() => window.hodosLabels.placed.map((p) => p.text));

test("place names are drawn at zoom 1, in the page's language", async ({ page }) => {
  const errors = await openMap(page);
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  expect((await placedTexts(page)).some((t) => t.startsWith("OCÉAN "))).toBe(true);
  expect(errors).toEqual([]);
});

test("switching the language rewrites the place names", async ({ page }) => {
  await openMap(page);
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#language-select").selectOption("en");
  await expect
    .poll(async () => (await placedTexts(page)).some((t) => t.endsWith(" OCEAN")))
    .toBe(true);
  expect((await placedTexts(page)).some((t) => t.startsWith("OCÉAN "))).toBe(false);
});

test("zooming in brings the names of smaller features", async ({ page }) => {
  // The centre of the seed's map is open sea at this zoom: look over a continent instead
  await openMap(page, "./?seed=12345&x=-2329&y=686&z=4");
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  const kinds = await page.evaluate(() => window.hodosLabels.placed.map((p) => p.label.kind));
  expect(kinds).not.toContain("ocean");
  expect(kinds.some((k) => ["sea", "range", "island", "lake", "river"].includes(k))).toBe(true);
});

test("debug mode has no place names", async ({ page }) => {
  await openMap(page, "./?seed=12345");
  // Positive control: the labels are there before the mode changes
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => {
    const input = document.querySelector('#mode-form input[value="debug"]');
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page).toHaveURL(/mode=debug/);
  await expect.poll(async () => await placedTexts(page)).toEqual([]);
});

test("the setting and labels=off hide the place names", async ({ page }) => {
  await openMap(page, "./?seed=12345&labels=off");
  await page.waitForTimeout(500);
  expect(await placedTexts(page)).toEqual([]);
  await page.getByRole("button", { name: "Paramètres" }).click();
  const toggle = page.getByRole("checkbox", { name: "Noms de lieux", exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  await expect.poll(() => page.url()).not.toContain("labels=off");
});
