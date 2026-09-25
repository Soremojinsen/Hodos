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

test("a coast drawn at level 5 differs from the same view drawn at level 3", async ({ page }) => {
  await openMap(page);
  const different = await page.evaluate(async () => {
    const map = window.hodos;
    // A coast point: east from the world's centre until land and sea change
    const land = (x) => map.sampler.sampleAt(x, 5000, 5).land;
    let x = 5000;
    while (x < 10000 && land(x) === land(5000)) x += 10;
    const view = {
      centerX: x,
      centerY: 5000,
      pixelsPerUnit: (256 * 2 ** 5) / 10000,
      width: 256,
      height: 256,
    };
    const render = async (level) => {
      const release = await map.renderer.ensureTiles(view, level);
      try {
        return map.renderer.renderToPixels(view, level);
      } finally {
        release();
      }
    };
    const [shallow, deep] = [await render(3), await render(5)];
    let count = 0;
    for (let i = 0; i < deep.length; i += 4) {
      const delta =
        Math.abs(deep[i] - shallow[i]) +
        Math.abs(deep[i + 1] - shallow[i + 1]) +
        Math.abs(deep[i + 2] - shallow[i + 2]);
      if (delta > 30) count++;
    }
    return count / (deep.length / 4);
  });
  expect(different).toBeGreaterThan(0.01);
});
