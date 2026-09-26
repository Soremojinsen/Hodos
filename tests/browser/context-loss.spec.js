import { expect, test } from "@playwright/test";
import { camera, openMap, waitForTiles } from "./helpers.js";

test("a lost WebGL context shows a message, then the same map comes back once restored", async ({
  page,
}) => {
  await openMap(page, "./?seed=12345&x=500&y=-300&z=3&mode=biomes");
  await page.keyboard.press("ArrowRight");
  const before = await camera(page);

  await page.evaluate(() => {
    const gl = window.hodos.renderer.canvas.getContext("webgl");
    window.loseContext = gl.getExtension("WEBGL_lose_context");
    window.loseContext.loseContext();
  });
  await expect(page.locator(".hodos-error")).toContainText("carte");

  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => window.loseContext.restoreContext());
  await reloaded;
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  await waitForTiles(page);

  // The pan made just before the loss is kept (to the unit, as links round it), as are the mode
  // and the zoom
  expect(await camera(page)).toEqual({
    x: Math.round(before.x),
    y: Math.round(before.y),
    zoom: before.zoom,
  });
  expect(await page.evaluate(() => window.hodos.renderer.renderingMode)).toBe("biomes");
  await expect(page.locator(".hodos-error")).toHaveCount(0);
});
