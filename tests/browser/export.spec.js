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

test("comparing images of different sizes is refused rather than silently under-counted", async ({
  page,
}) => {
  await openMap(page);
  await openExport(page);
  await page.locator("#export-size").selectOption("1024");
  const small = (await download(page)).png;
  await page.locator("#export-size").selectOption("2048");
  const big = (await download(page)).png;
  await expect(countDifferentPixels(page, small, big)).rejects.toThrow();
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

test("sizes opened while the map is generating follow the map once it is ready", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1300, height: 700 });
  // Delays WorldMap#load so the dialog opens during generation, while the map canvas still has
  // its default size and the camera its construction zoom
  await page.addInitScript(() => {
    Object.defineProperty(window, "hodos", {
      configurable: true,
      set(worldMap) {
        const originalLoad = worldMap.load.bind(worldMap);
        worldMap.load = () =>
          new Promise((resolve) => setTimeout(() => resolve(originalLoad()), 500));
        Object.defineProperty(window, "hodos", {
          value: worldMap,
          writable: true,
          configurable: true,
        });
      },
    });
  });
  await page.goto("./?seed=12345");
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator("html")).not.toHaveAttribute("data-map", "ready");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  await expect(page.locator('#export-size option[value="1"]')).toHaveText("×1 (1300 × 700 px)");
  await expect(page.locator('#export-size option[value="4"]')).toBeDisabled();
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

test("no enabled view size disables the download and print buttons", async ({ page }) => {
  await page.setViewportSize({ width: 4200, height: 700 });
  await openMap(page);
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator("#export-size option:enabled")).toHaveCount(0);
  await expect(page.locator("#export-download")).toBeDisabled();
  await expect(page.locator("#print-button")).toBeDisabled();
  // Back to a size that exists re-enables them
  await page.getByLabel("Monde entier").check();
  await expect(page.locator("#export-download")).toBeEnabled();
  await expect(page.locator("#print-button")).toBeEnabled();
});

test("the size list rebuilds while the dialog stays open across a resize", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await openMap(page);
  await openExport(page);
  await page.getByLabel("Vue actuelle").check();
  await expect(page.locator('#export-size option[value="1"]')).toHaveText("×1 (900 × 600 px)");
  await page.setViewportSize({ width: 800, height: 500 });
  await expect(page.locator('#export-size option[value="1"]')).toHaveText("×1 (800 × 500 px)");
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

test("reopening the dialog during an export keeps it busy, so a second one cannot start", async ({
  page,
}) => {
  await openMap(page);
  // Holds the export on its tiles until released
  await page.evaluate(() => {
    const renderer = window.hodos.renderer;
    const ensureTiles = renderer.ensureTiles.bind(renderer);
    const gate = new Promise((resolve) => (window.releaseExport = resolve));
    renderer.ensureTiles = async (...args) => {
      await gate;
      return ensureTiles(...args);
    };
  });
  const downloads = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await openExport(page);
  await page.locator("#export-size").selectOption("1024");
  await page.locator("#export-download").click();
  await expect(page.locator("#export-download")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#export-dialog")).not.toHaveAttribute("open");
  await openExport(page);
  await expect(page.locator("#export-download")).toBeDisabled();
  await expect(page.locator("#print-button")).toBeDisabled();
  await expect(page.locator("#export-status")).toHaveText("Préparation…");
  await page.evaluate(() => window.releaseExport());
  await expect(page.locator("#export-download")).toBeEnabled();
  await expect(page.locator("#export-status")).toHaveText("");
  expect(downloads).toEqual(["hodos-12345-1024x1024.png"]);
});
