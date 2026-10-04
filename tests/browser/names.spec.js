import { readFile } from "node:fs/promises";
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

const pickOcean = async (page) => {
  await openPanel(page);
  const root = await page.evaluate(
    () => window.hodosEdits.labels.find((l) => l.kind === "ocean").name.root,
  );
  await page.locator("#names-search").fill(root);
  await page.locator("#names-list .names-entry").click();
  await expect(page.locator("#names-editor")).toBeVisible();
};

test("picking a name in the list flies to it and edits it as you type", async ({ page }) => {
  await openMap(page, "./?seed=12345&x=-2329&y=686&z=6");
  await pickOcean(page);
  const zoom = await page.evaluate(() => window.hodos.camera.zoom);
  expect(zoom).toBeGreaterThanOrEqual(1);
  expect(zoom).toBeLessThanOrEqual(3);
  const field = page.locator("#names-input");
  await field.pressSequentially("Mirewater");
  await expect(field).toHaveValue("Mirewater");
  await expect.poll(() => placedTexts(page)).toContain("OCÉAN MIREWATER");
  await expect(page.locator("#names-before")).toHaveText("Océan ");
});

test("a full name replaces the kind's word, and hiding keeps it faded while selected", async ({
  page,
}) => {
  await openMap(page);
  await pickOcean(page);
  await page.getByLabel("Nom complet").check();
  await page.locator("#names-input").fill("La Grande Bleue");
  await expect.poll(() => placedTexts(page)).toContain("LA GRANDE BLEUE");
  await page.getByLabel("Masquer ce nom").check();
  // Still drawn, faded, while selected
  await expect.poll(() => placedTexts(page)).toContain("LA GRANDE BLEUE");
  await page.locator("#names-close").click();
  await expect.poll(() => placedTexts(page)).not.toContain("LA GRANDE BLEUE");
  await openPanel(page);
  // The search still holds the generated root, which the full name no longer matches
  await page.locator("#names-search").fill("");
  await expect(page.locator("#names-list")).toContainText("⊘");
});

test("back to the generated name forgets the edits of a name", async ({ page }) => {
  await openMap(page);
  await pickOcean(page);
  await page.locator("#names-input").fill("Mirewater");
  await page.getByLabel("Masquer ce nom").check();
  await page.getByRole("button", { name: "Revenir au nom généré" }).click();
  expect(await page.evaluate(() => window.hodosEdits.edits)).toEqual({
    names: {},
    hidden: [],
    kinds: {},
  });
  await expect(page.locator("#names-input")).toHaveValue("");
});

test("a click on a name on the map selects it, and the hover panel shows the new name", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("hodos.hover", "on"));
  await openMap(page);
  await expect.poll(() => placedTexts(page)).toContainEqual(expect.stringMatching(/^OCÉAN /));
  const point = await page.evaluate(() => {
    const ocean = window.hodosLabels.placed.find((p) => p.label.kind === "ocean");
    const rect = window.hodos.renderer.canvas.getBoundingClientRect();
    return { x: rect.left + ocean.center.x, y: rect.top + ocean.center.y };
  });
  await openPanel(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#names-editor")).toBeVisible();
  await page.locator("#names-input").fill("Mirewater");
  await page.mouse.move(point.x, point.y + 30);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#hover-info")).toContainText("Océan Mirewater");
});

test("a drag on the map pans and does not select", async ({ page }) => {
  await openMap(page);
  await openPanel(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#names-editor")).toBeHidden();
});

const namesFile = (seed, edits) => ({
  name: `hodos-${seed}.json`,
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ hodos: 1, seed, edits })),
});

test("saving names downloads them and quiets the reminder", async ({ page }) => {
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await openPanel(page);
  await expect(page.locator("#names-unfiled")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Enregistrer les noms…" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("hodos-12345.json");
  const saved = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(saved).toMatchObject({
    hodos: 1,
    seed: "12345",
    edits: { names: { ocean: { root: "Mirewater" } } },
  });
  await expect(page.locator("#names-unfiled")).toBeHidden();
});

test("opening a file for this map asks before replacing other names", async ({ page }) => {
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await openPanel(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("12345", { names: { ocean: { full: "Grand Bleu" } } }));
  await expect
    .poll(() => page.evaluate(() => window.hodosEdits.edits.names.ocean))
    .toEqual({ full: "Grand Bleu" });
  await expect(page.locator("#names-unfiled")).toBeHidden();
});

test("opening a file for another seed opens that map with its names", async ({ page }) => {
  await openMap(page);
  await openPanel(page);
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("54321", { kinds: { river: false } }));
  await expect(page).toHaveURL(/seed=54321/);
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready", { timeout: 30_000 });
  expect(await page.evaluate(() => window.hodosEdits.edits.kinds)).toEqual({ river: false });
});

test("a file that is not a names file changes nothing", async ({ page }) => {
  await openMap(page);
  await openPanel(page);
  await page.locator("#names-file-input").setInputFiles({
    name: "package.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"name": "x"}'),
  });
  await expect(page.locator("#notice")).toContainText("n’est pas un fichier de noms");
  expect(await page.evaluate(() => window.hodosEdits.edits)).toEqual({
    names: {},
    hidden: [],
    kinds: {},
  });
});

test("without browser storage, a file for another seed does not leave this map", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
  });
  await openMap(page);
  await openPanel(page);
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("54321", { kinds: { river: false } }));
  await expect(page.locator("#notice")).toContainText("ne peut pas garder");
  expect(page.url()).toContain("seed=12345");
});
