import { expect, test } from "@playwright/test";
import { CENTER, countColors, openMap } from "./helpers.js";

test("the map renders without errors", async ({ page }) => {
  const errors = await openMap(page);
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await countColors(page, await page.screenshot({ clip: CENTER }))).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test("an empty seed gets a random one, shown in the seed field", async ({ page }) => {
  const errors = await openMap(page, "./?seed=");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  await expect(page.locator("#seed")).toHaveValue(/^\d+$/);
  expect(errors).toEqual([]);
});

test("the site works from a subfolder", async ({ page }) => {
  // Serve the build under /hodos/ by rerouting requests to the root
  await page.route("**/hodos/**", async (route) => {
    const url = route.request().url().replace("/hodos/", "/");
    await route.fulfill({ response: await route.fetch({ url }) });
  });
  const errors = await openMap(page, "/hodos/?seed=12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await countColors(page, await page.screenshot({ clip: CENTER }))).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
