import { expect, test } from "@playwright/test";
import { camera, openMap } from "./helpers.js";

test("a link without a seed gets its random seed in the address bar", async ({ page }) => {
  await openMap(page, "./");
  await expect(page).toHaveURL(/\?seed=\d+$/);
  const seed = new URL(page.url()).searchParams.get("seed");
  await expect(page.locator("#seed")).toHaveValue(seed);
});

test("an untouched map keeps a seed-only link", async ({ page }) => {
  await openMap(page);
  await page.waitForTimeout(600);
  expect(new URL(page.url()).search).toBe("?seed=12345");
});

test("panning and zooming are saved in the link and restored on reload", async ({ page }) => {
  await openMap(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  // ArrowRight at zoom 1 moves by 10 / (256 * 2) * 10000 = 195.3125 world units
  await expect(page).toHaveURL(/\?seed=12345&x=195&z=2$/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await camera(page)).toEqual({ x: 195, y: 0, zoom: 2 });
});

test("the rendering mode is saved in the link", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#biomes-toggle").check();
  await expect(page).toHaveURL(/mode=biomes/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  await expect(page.locator("#biomes-toggle")).toBeChecked();
  expect(await page.evaluate(() => window.hodos.renderer.renderingMode)).toBe("biomes");
});

test("a hand-edited link with bad values still opens the map", async ({ page }) => {
  const errors = await openMap(
    page,
    "./?seed=12345&x=abc&y=99999&z=99&mode=satellite&grid=triangle&gs=7",
  );
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await camera(page)).toEqual({ x: 0, y: 5000, zoom: 7 });
  await expect(page.locator("#default-toggle")).toBeChecked();
  expect(errors).toEqual([]);
});
