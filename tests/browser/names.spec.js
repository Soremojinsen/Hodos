import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { countDifferentPixels, openMap, waitForTiles } from "./helpers.js";

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

test("copying the link of a renamed map says the link shows the generated names, long enough to read", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.locator("#notice")).toContainText(
    "Lien copié ! Il montre les noms générés, pas les vôtres. Pour les partager, envoyez aussi le fichier des noms.",
  );
  // Past the 2 s of a short notice
  await page.waitForTimeout(3000);
  await expect(page.locator("#notice")).toBeVisible();
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
  // The name being edited stays listed whatever the search
  await page.locator("#names-search").fill("dragon");
  await expect(page.locator('#names-list .names-entry[aria-current="true"]')).toContainText(
    "Océan Mirewater",
  );
});

// Picks a label from the list by id, in its kind's group, and waits for the map to settle
const pickFromList = async (page, id) => {
  await page.locator("#names-search").fill("");
  const selector = `.names-entry[data-id="${id}"]`;
  const entry = page.locator(`#names-list ${selector}`);
  if (!(await entry.isVisible())) {
    const group = page.locator("#names-list details", { has: page.locator(selector) });
    await group.locator("summary").click();
  }
  await entry.click();
  await waitForTiles(page);
};

const openGroups = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#names-list details")]
      .filter((details) => details.open)
      .map((details) => details.querySelector("summary").textContent),
  );

// A label picked by its root in the search, the search then cleared
const pickBySearch = async (page, label) => {
  await page.locator("#names-search").fill(label.root);
  await page.locator(`#names-list .names-entry[data-id="${label.id}"]`).click();
  await page.locator("#names-search").fill("");
};

test("a group opened by the user stays open, one opened for the selection closes after it", async ({
  page,
}) => {
  await openMap(page);
  await openPanel(page);
  const [lake, ocean] = await page.evaluate(() =>
    ["lake", "ocean"].map((kind) => {
      const label = window.hodosEdits.labels.find((l) => l.kind === kind && l.name.root);
      return { id: label.id, root: label.name.root };
    }),
  );
  await page.locator("#names-list summary", { hasText: /^Îles / }).click();
  await pickBySearch(page, lake);
  await expect
    .poll(() => openGroups(page))
    .toEqual([expect.stringMatching(/^Îles /), expect.stringMatching(/^Lacs /)]);
  await pickBySearch(page, ocean);
  await expect
    .poll(() => openGroups(page))
    .toEqual([expect.stringMatching(/^Océan /), expect.stringMatching(/^Îles /)]);
});

// Whether the selected label is drawn on the map, all its letters clear of the panel and of what
// else is over the map: the footer, the logo and the map's buttons
const selectedInSight = (page) =>
  page.evaluate(() => {
    const canvas = window.hodos.renderer.canvas.getBoundingClientRect();
    const covers = ["#names-panel", ".map-settings", ".logo img", ".map-controls"].map((s) =>
      document.querySelector(s).getBoundingClientRect(),
    );
    const selected = window.hodosLabels.placed.filter((p) => p.selected);
    return selected.some(({ boxes }) =>
      boxes.every(
        (b) =>
          b.minX + canvas.left >= 0 &&
          b.minY + canvas.top >= 0 &&
          b.maxX + canvas.left <= canvas.right &&
          b.maxY + canvas.top <= canvas.bottom &&
          covers.every(
            (c) =>
              b.maxX + canvas.left <= c.left ||
              b.minX + canvas.left >= c.right ||
              b.maxY + canvas.top <= c.top ||
              b.minY + canvas.top >= c.bottom,
          ),
      ),
    );
  });

// A desktop, phones held upright, and phones held sideways
const VIEWPORTS = [
  { width: 1000, height: 700 },
  { width: 400, height: 800 },
  { width: 320, height: 568 },
  { width: 568, height: 320 },
  { width: 667, height: 375 },
];

for (const viewport of VIEWPORTS) {
  test(`picking rivers, lakes and the ocean in the list shows their names in sight at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors = await openMap(page);
    await openPanel(page);
    const ids = await page.evaluate(() => {
      const labels = window.hodosEdits.labels;
      const rivers = labels.filter((l) => l.kind === "river");
      // The ocean, two lakes, and the atlas's first and last rivers
      return [
        labels.find((l) => l.kind === "ocean").id,
        ...labels
          .filter((l) => l.kind === "lake")
          .slice(0, 2)
          .map((l) => l.id),
        ...rivers.slice(0, 3).map((l) => l.id),
        ...rivers.slice(-3).map((l) => l.id),
      ];
    });
    for (const id of ids) {
      await pickFromList(page, id);
      await expect.poll(() => selectedInSight(page), { message: id }).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

// Whether an element shows whole within the part of the panel scrolled into view
const inPanelView = (page, selector) =>
  page.evaluate((selector) => {
    const panel = document.getElementById("names-panel").getBoundingClientRect();
    const box = document.querySelector(selector).getBoundingClientRect();
    return box.top >= panel.top && box.bottom <= panel.bottom;
  }, selector);

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const viewport of VIEWPORTS.slice(1)) {
  test(`on a phone, the panel leaves the map's buttons clear and shows the picked name's editor at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMap(page);
    await openPanel(page);
    const panel = await page.locator("#names-panel").boundingBox();
    for (const button of await page.locator(".map-controls button:visible").all())
      expect(overlaps(panel, await button.boundingBox())).toBe(false);
    // The kinds within the panel, scrolled sideways rather than wider
    const kinds = await page.locator("#names-kinds").boundingBox();
    expect(kinds.x + kinds.width).toBeLessThanOrEqual(panel.x + panel.width);
    // Enough of the list to choose from
    expect((await page.locator("#names-list").boundingBox()).height).toBeGreaterThanOrEqual(100);
    // A name picked in the list, then on the map
    await pickFromList(page, await oceanId(page));
    await expect.poll(() => inPanelView(page, "#names-input")).toBe(true);
    await expect.poll(() => inPanelView(page, "#names-reset")).toBe(true);
    // Big enough for a finger, and the file buttons each on one line
    const close = await page.locator("#names-close").boundingBox();
    expect(close.width).toBeGreaterThanOrEqual(40);
    expect(close.height).toBeGreaterThanOrEqual(40);
    const save = await page.locator("#names-save").boundingBox();
    const open = await page.locator("#names-open").boundingBox();
    expect(save.height).toBe(open.height);
    expect(save.y).toBe(open.y);
    expect(save.height).toBeLessThan(40);
  });
}

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
  // The search still holds the generated root, which finds the renamed ocean
  await expect(page.locator("#names-list .names-entry")).toHaveCount(1);
  await expect(page.locator("#names-list")).toContainText("La Grande Bleue");
  await expect(page.locator("#names-list")).toContainText("⊘");
});

test("the full name typed comes back when Full name is checked again", async ({ page }) => {
  await openMap(page);
  await pickOcean(page);
  const fullName = page.getByLabel("Nom complet");
  await fullName.check();
  await page.locator("#names-input").fill("La Grande Bleue");
  await fullName.uncheck();
  await expect(page.locator("#names-input")).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.hodosEdits.edits.names)).toEqual({});
  await fullName.check();
  await expect(page.locator("#names-input")).toHaveValue("La Grande Bleue");
  expect(await page.evaluate(() => window.hodosEdits.edits.names)).toEqual({
    ocean: { full: "La Grande Bleue" },
  });
});

test("Full name on a name left as generated changes nothing, and keeps a new root", async ({
  page,
}) => {
  await openMap(page);
  await pickOcean(page);
  const fullName = page.getByLabel("Nom complet");
  await fullName.check();
  expect(await page.evaluate(() => window.hodosEdits.edits)).toEqual({
    names: {},
    hidden: [],
    kinds: {},
  });
  await fullName.uncheck();
  await page.locator("#names-input").fill("Mirewater");
  await fullName.check();
  await expect(page.locator("#names-input")).toHaveValue("Océan Mirewater");
  await fullName.uncheck();
  await expect(page.locator("#names-input")).toHaveValue("Mirewater");
  expect(await page.evaluate(() => window.hodosEdits.edits.names)).toEqual({
    ocean: { root: "Mirewater" },
  });
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
  // In the panel's own font, as its other buttons
  const fonts = await page.evaluate(() =>
    ["names-panel", "names-reset", "names-save"].map(
      (id) => getComputedStyle(document.getElementById(id)).font,
    ),
  );
  expect(fonts[1]).toBe(fonts[0]);
  expect(fonts[2]).toBe(fonts[0]);
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

test("a right click on a name on the map does not select it", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => placedTexts(page)).toContainEqual(expect.stringMatching(/^OCÉAN /));
  const point = await page.evaluate(() => {
    const ocean = window.hodosLabels.placed.find((p) => p.label.kind === "ocean");
    const rect = window.hodos.renderer.canvas.getBoundingClientRect();
    return { x: rect.left + ocean.center.x, y: rect.top + ocean.center.y };
  });
  await openPanel(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.mouse.click(point.x, point.y, { button: "middle" });
  await expect(page.locator("#names-editor")).toBeHidden();
  // A left click there does
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#names-editor")).toBeVisible();
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

// Answers the next dialog, and tells whether one was shown
const answerDialog = (page, accept) => {
  const shown = { value: false };
  page.once("dialog", (dialog) => {
    shown.value = true;
    return accept ? dialog.accept() : dialog.dismiss();
  });
  return shown;
};

test("opening a file for this map asks before replacing other names", async ({ page }) => {
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await openPanel(page);
  const asked = answerDialog(page, true);
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("12345", { names: { ocean: { full: "Grand Bleu" } } }));
  await expect
    .poll(() => page.evaluate(() => window.hodosEdits.edits.names.ocean))
    .toEqual({ full: "Grand Bleu" });
  expect(asked.value).toBe(true);
  await expect(page.locator("#names-unfiled")).toBeHidden();
});

test("declining to replace this map's names keeps them", async ({ page }) => {
  await openMap(page);
  await rename(page, await oceanId(page), { root: "Mirewater" });
  await openPanel(page);
  const asked = answerDialog(page, false);
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("12345", { names: { ocean: { full: "Grand Bleu" } } }));
  await expect.poll(() => asked.value).toBe(true);
  expect(await page.evaluate(() => window.hodosEdits.edits)).toEqual({
    names: { ocean: { root: "Mirewater" } },
    hidden: [],
    kinds: {},
  });
});

test("declining to replace another map's names stays on this map", async ({ page }) => {
  await openMap(page);
  const kept = JSON.stringify({ edits: { names: {}, hidden: [], kinds: { lake: false } } });
  await page.evaluate((kept) => localStorage.setItem("hodos.edits.54321", kept), kept);
  await openPanel(page);
  const asked = answerDialog(page, false);
  await page
    .locator("#names-file-input")
    .setInputFiles(namesFile("54321", { kinds: { river: false } }));
  await expect.poll(() => asked.value).toBe(true);
  expect(page.url()).toContain("seed=12345");
  expect(await page.evaluate(() => localStorage.getItem("hodos.edits.54321"))).toBe(kept);
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

const exportView = async (page) => {
  await page.locator("#screenshot").click();
  await page.locator('input[name="export-area"][value="view"]').check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-download").click(),
  ]);
  await page.keyboard.press("Escape");
  return readFile(await download.path());
};

test("an export shows the map's own names", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => placedTexts(page)).toContainEqual(expect.stringMatching(/^OCÉAN /));
  const before = await exportView(page);
  await rename(page, await oceanId(page), { full: "La Grande Bleue" });
  await expect.poll(() => placedTexts(page)).toContain("LA GRANDE BLEUE");
  const after = await exportView(page);
  expect(await countDifferentPixels(page, before, after)).toBeGreaterThan(50);
});

// A capital that is on the map: not every settlement of the world fits the first view
const capitalOf = async (page) => {
  await expect
    .poll(() =>
      page.evaluate(() => window.hodosLabels.placed.some((p) => p.label.kind === "capital")),
    )
    .toBe(true);
  return page.evaluate(() => {
    const id = window.hodosLabels.placed.find((p) => p.label.kind === "capital").label.id;
    return window.hodosEdits.labels.find((l) => l.id === id);
  });
};

test("a renamed settlement shows on the map, and a hidden one leaves it with its symbol", async ({
  page,
}) => {
  await openMap(page);
  const capital = await capitalOf(page);
  await expect
    .poll(() =>
      page.evaluate((id) => window.hodosLabels.placed.some((p) => p.label.id === id), capital.id),
    )
    .toBe(true);
  await rename(page, capital.id, { root: "Calvenne" });
  await expect.poll(() => placedTexts(page)).toContain("CALVENNE");
  await page.reload();
  await expect.poll(() => placedTexts(page)).toContain("CALVENNE");
  await page.evaluate(
    (id) => window.hodosEdits.update((e) => ({ ...e, hidden: [...e.hidden, id] })),
    capital.id,
  );
  await expect
    .poll(() =>
      page.evaluate((id) => window.hodosLabels.placed.some((p) => p.label.id === id), capital.id),
    )
    .toBe(false);
});

test("the panel lists settlements, turns a kind off, and has no Full name switch for them", async ({
  page,
}) => {
  await openMap(page);
  await openPanel(page);
  await expect(page.locator("#names-list")).toContainText("Capitales");
  const capital = await capitalOf(page);
  await page.locator("#names-search").fill(capital.name.root);
  await page.locator("#names-list").getByText(capital.name.root, { exact: true }).first().click();
  await expect(page.locator("#names-editor")).toBeVisible();
  await expect(page.locator("#names-full")).toBeHidden();
  await page.locator("#names-kinds").getByLabel("Capitales").uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.hodosLabels.placed.filter((p) => p.label.kind === "capital" && !p.selected).length,
      ),
    )
    .toBe(0);
});

test("a click on a settlement's symbol selects it", async ({ page }) => {
  await openMap(page);
  await openPanel(page);
  await capitalOf(page);
  const { id, x, y } = await page.evaluate(() => {
    const rect = window.hodos.renderer.canvas.getBoundingClientRect();
    // One the open panel does not cover
    const panel = document.getElementById("names-panel").getBoundingClientRect();
    const capital = window.hodosLabels.placed.find((p) => {
      const [x, y] = [rect.left + p.symbol?.x, rect.top + p.symbol?.y];
      const covered =
        x > panel.left - 10 && x < panel.right + 10 && y > panel.top - 10 && y < panel.bottom + 10;
      return p.label.kind === "capital" && !covered;
    });
    return {
      id: capital.label.id,
      x: rect.left + capital.symbol.x,
      y: rect.top + capital.symbol.y,
    };
  });
  await page.mouse.click(x, y);
  await expect(page.locator("#names-editor")).toBeVisible();
  expect(await page.evaluate(() => window.hodosLabels.selected)).toBe(id);
});
