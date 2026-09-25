import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { countColors, openMap } from "./helpers.js";

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

test("the screenshot downloads the drawn map as a PNG", async ({ page }) => {
  await openMap(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#screenshot")]);
  expect(download.suggestedFilename()).toMatch(/^hodos-12345-\d+x\d+\.png$/);
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(await countColors(page, png)).toBeGreaterThan(20);
});
