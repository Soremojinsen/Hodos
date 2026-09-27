import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

test.use({
  launchOptions: {
    env: { ...process.env, WAYLAND_DISPLAY: "" },
    args: ["--ozone-platform=headless", "--disable-3d-apis", "--disable-webgl"],
  },
});

test("without WebGL, a message is shown and nothing else fails", async ({ page }) => {
  const errors = await openMap(page);
  await expect(page.locator("html")).toHaveAttribute("data-map", "error");
  await expect(page.locator(".hodos-error")).toContainText("WebGL");

  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(200, 200);
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await page.keyboard.press("ArrowLeft");
  await page.click("#map-zoom-in-button");
  await page.setViewportSize({ width: 900, height: 650 });

  expect(errors.filter((e) => !e.includes("WebGL is unavailable"))).toEqual([]);
});

test("without WebGL the export dialog offers no download, and opens with no page error", async ({
  page,
}) => {
  const errors = await openMap(page);

  await page.click("#screenshot");
  await expect(page.locator("#export-download")).toBeDisabled();
  await expect(page.locator("#print-button")).toBeDisabled();

  expect(errors.filter((e) => !e.includes("WebGL is unavailable"))).toEqual([]);
});

test("showError does not add a second message once one is already shown", async ({ page }) => {
  await openMap(page);
  await expect(page.locator(".hodos-error")).toHaveCount(1);
  // A failing load can call showError from two paths (see renderer.js); simulate the second call
  await page.evaluate(() => window.hodos.renderer.showError("error.render"));
  await expect(page.locator(".hodos-error")).toHaveCount(1);
});
