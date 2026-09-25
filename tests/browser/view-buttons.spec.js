import { expect, test } from "@playwright/test";
import { camera, openMap } from "./helpers.js";

test("Recentrer returns to the opening view", async ({ page }) => {
  await openMap(page, "./?seed=12345&x=800&y=-300&z=4");
  await page.getByRole("button", { name: "Recentrer la carte", exact: true }).click();
  expect(await camera(page)).toEqual({ x: 0, y: 0, zoom: 1 });
});

test("the fullscreen button enters and leaves full screen", async ({ page }) => {
  // Headless browsers can't really go full screen: fake the API
  await page.addInitScript(() => {
    let element = null;
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => true });
    Object.defineProperty(Document.prototype, "fullscreenElement", { get: () => element });
    Element.prototype.requestFullscreen = function () {
      element = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = function () {
      element = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
  });
  await openMap(page);
  await page.getByRole("button", { name: "Plein écran", exact: true }).click();
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Quitter le plein écran", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plein écran", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test("the fullscreen button is hidden where full screen is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false });
  });
  await openMap(page);
  await expect(page.locator("#map-fullscreen-button")).toBeHidden();
});
