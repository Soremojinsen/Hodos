import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { countColors, countDifferentPixels, openMap, pngSize } from "./helpers.js";

const openExport = (page) => page.getByRole("button", { name: "Exporter la carte" }).click();

const download = async (page) => {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-download").click(),
  ]);
  return { name: file.suggestedFilename(), png: await readFile(await file.path()) };
};

test("the whole world exports as a square PNG of the chosen size", async ({ page }) => {
  await openMap(page);
  await openExport(page);
  await expect(page.locator("#export-size")).toHaveValue("2048");
  await page.locator("#export-size").selectOption("1024");
  const { name, png } = await download(page);
  expect(name).toBe("hodos-12345-1024x1024.png");
  expect(pngSize(png)).toEqual({ width: 1024, height: 1024 });
  expect(await countColors(page, png)).toBeGreaterThan(20);
});

test("the grid is in the export only when asked", async ({ page }) => {
  await openMap(page, "./?seed=12345&grid=square&go=100");
  await openExport(page);
  await page.locator("#export-size").selectOption("1024");
  await expect(page.locator("#export-grid")).toBeChecked();
  const withGrid = (await download(page)).png;
  await page.locator("#export-grid").uncheck();
  const withoutGrid = (await download(page)).png;
  const again = (await download(page)).png;
  expect(await countDifferentPixels(page, withGrid, withoutGrid)).toBeGreaterThan(5000);
  expect(await countDifferentPixels(page, withoutGrid, again)).toBe(0);
});

test("the grid option is disabled without a grid", async ({ page }) => {
  await openMap(page);
  await openExport(page);
  await expect(page.locator("#export-grid")).toBeDisabled();
});

test("view sizes follow the window", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await openMap(page);
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator('#export-size option[value="1"]')).toHaveText("×1 (900 × 600 px)");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 800, height: 500 });
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator('#export-size option[value="1"]')).toHaveText("×1 (800 × 500 px)");
});

test("sizes too large for browsers are disabled", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 700 });
  await openMap(page);
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator('#export-size option[value="4"]')).toBeDisabled();
  await expect(page.locator('#export-size option[value="4"]')).toContainText(
    "trop grand pour ce navigateur",
  );
});

test("a failed export says so and can be retried", async ({ page }) => {
  const errors = await openMap(page);
  await page.evaluate(() => {
    window.hodos.renderer.renderToPixels = () => {
      throw new Error("simulated failure");
    };
  });
  await openExport(page);
  await page.locator("#export-download").click();
  await expect(page.locator("#export-status")).toHaveText("L'export a échoué.");
  await expect(page.locator("#export-download")).toBeEnabled();
  expect(errors.some((e) => e.includes("simulated failure"))).toBe(true);
});
