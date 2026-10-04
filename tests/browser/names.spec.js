import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

const placedTexts = (page) => page.evaluate(() => window.hodosLabels.placed.map((p) => p.text));

const oceanId = (page) =>
  page.evaluate(() => window.hodosEdits.labels.find((l) => l.kind === "ocean").id);

const rename = (page, id, name) =>
  page.evaluate(
    ([id, name]) => window.hodosEdits.update((e) => ({ ...e, names: { ...e.names, [id]: name } })),
    [id, name],
  );

test("a renamed ocean shows on the map and after a reload, and not on another seed", async ({
  page,
}) => {
  const errors = await openMap(page);
  await expect.poll(async () => (await placedTexts(page)).length).toBeGreaterThan(0);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await expect.poll(() => placedTexts(page)).toContain("OCÉAN MIREWATER");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready", { timeout: 30_000 });
  await expect.poll(() => placedTexts(page)).toContain("OCÉAN MIREWATER");
  await openMap(page, "./?seed=54321");
  expect(await page.evaluate(() => window.hodosEdits.edits)).toEqual({
    names: {},
    hidden: [],
    kinds: {},
  });
  expect(errors).toEqual([]);
});

test("a kind turned off leaves the map", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => placedTexts(page)).toContainEqual(expect.stringMatching(/^OCÉAN /));
  await page.evaluate(() => window.hodosEdits.update((e) => ({ ...e, kinds: { ocean: false } })));
  await expect
    .poll(async () => (await placedTexts(page)).some((t) => t.startsWith("OCÉAN ")))
    .toBe(false);
});

test("an edit in another tab reaches this one", async ({ page, context }) => {
  await openMap(page);
  const other = await context.newPage();
  await openMap(other);
  await rename(other, await oceanId(other), { full: "La Grande Bleue" });
  await expect.poll(() => placedTexts(page)).toContain("LA GRANDE BLEUE");
});

test("copying the link of a renamed map says the link carries the generated names", async ({
  page,
}) => {
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.locator("#notice")).toContainText("noms générés");
});

const openPanel = async (page) => {
  await page.getByRole("button", { name: "Noms", exact: true }).click();
  await expect(page.locator("#names-panel")).toBeVisible();
};

test("the names panel lists the names by kind and finds them without accents", async ({ page }) => {
  const errors = await openMap(page);
  await openPanel(page);
  await expect(page.locator("#names-list")).toContainText("Océan (1)");
  const root = await page.evaluate(
    () => window.hodosEdits.labels.find((l) => l.kind === "ocean").name.root,
  );
  await page.locator("#names-search").fill(root.toLowerCase());
  await expect(page.locator("#names-list .names-entry")).toHaveCount(1);
  await expect(page.locator("#names-list .names-entry")).toContainText(root);
  await page.keyboard.press("Escape");
  await expect(page.locator("#names-panel")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the panel's kind checkboxes turn kinds off on the map", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => placedTexts(page)).toContainEqual(expect.stringMatching(/^OCÉAN /));
  await openPanel(page);
  await page.locator("#names-kinds").getByLabel("Océan").uncheck();
  await expect
    .poll(async () => (await placedTexts(page)).some((t) => t.startsWith("OCÉAN ")))
    .toBe(false);
  expect(await page.evaluate(() => window.hodosEdits.edits.kinds)).toEqual({ ocean: false });
});

test("the panel leaves the map usable", async ({ page }) => {
  await openMap(page);
  await openPanel(page);
  const before = await page.evaluate(() => window.hodos.camera.zoom);
  await page.getByRole("button", { name: "Zoom avant" }).click();
  await expect.poll(() => page.evaluate(() => window.hodos.camera.zoom)).toBeGreaterThan(before);
});
