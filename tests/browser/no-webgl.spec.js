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
