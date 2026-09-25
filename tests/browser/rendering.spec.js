import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { countColors, openMap, waitForTiles } from "./helpers.js";

const frameCount = (page) => page.evaluate(() => window.hodos.renderer.frameCount);

test("the map is not redrawn while idle", async ({ page }) => {
  await openMap(page);
  await page.waitForTimeout(300);
  const before = await frameCount(page);
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(await frameCount(page)).toBe(before);
});

test("moving, resizing and switching mode redraw the map", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => frameCount(page)).toBeGreaterThan(0);
  let count = await frameCount(page);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
  count = await frameCount(page);

  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
  expect(await page.evaluate(() => window.hodos.renderer.canvas.width)).toBe(800);
  count = await frameCount(page);

  await page.locator(".map-settings").getByText("Paramètres").click();
  await page.locator("#biomes-toggle").check();
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
});

test("exporting the current view at ×1 downloads the drawn map as a PNG", async ({ page }) => {
  await openMap(page);
  await page.click("#screenshot");
  await page.getByLabel("Vue actuelle").check();
  await page.locator("#export-size").selectOption("1");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-download"),
  ]);
  expect(download.suggestedFilename()).toBe("hodos-12345-1000x700.png");
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(await countColors(page, png)).toBeGreaterThan(20);
});

test("zooming in draws the tiles of the new level once they are loaded", async ({ page }) => {
  await openMap(page);
  expect(await page.evaluate(() => window.hodos.renderer.drawnTiles)).not.toHaveLength(0);
  await page.click("#map-zoom-in-button");
  await waitForTiles(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const drawn = await page.evaluate(() => window.hodos.renderer.drawnTiles);
  expect(drawn.length).toBeGreaterThan(0);
  for (const key of drawn) expect(key.startsWith("2/")).toBe(true);
});
