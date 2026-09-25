import { expect, test } from "@playwright/test";
import { camera, openMap, touch } from "./helpers.js";

test("arrow keys move the camera and + zooms in", async ({ page }) => {
  await openMap(page);
  const before = await camera(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("+");
  const after = await camera(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  expect(after.zoom).toBeGreaterThan(before.zoom);
});

test("keys typed in the seed field don't move the map", async ({ page }) => {
  await openMap(page);
  await page.locator(".map-settings").getByText("Paramètres").click();
  await page.locator("#seed").focus();
  const before = await camera(page);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("-");
  expect(await camera(page)).toEqual(before);
});

test("mouse drag pans the map", async ({ page }) => {
  await openMap(page);
  const before = await camera(page);
  await page.mouse.move(500, 350);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 5 });
  await page.mouse.up();
  const after = await camera(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeLessThan(before.y);
});

test("zoom buttons zoom without panning", async ({ page }) => {
  await openMap(page);
  const before = await camera(page);
  await page.click("#map-zoom-in-button");
  await page.click("#map-zoom-in-button");
  await page.click("#map-zoom-out-button");
  expect(await camera(page)).toEqual({ ...before, zoom: before.zoom + 1 });
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 800 } });

  test("one-finger drag pans the map", async ({ page }) => {
    await openMap(page);
    const before = await camera(page);
    await touch(page, "pointerdown", [[1, 200, 400]]);
    for (let i = 1; i <= 5; i++) await touch(page, "pointermove", [[1, 200 - 20 * i, 400]]);
    await touch(page, "pointerup", [[1, 100, 400]]);
    expect((await camera(page)).x).toBeGreaterThan(before.x);
  });

  test("two-finger pinch zooms in without panning", async ({ page }) => {
    await openMap(page);
    const before = await camera(page);
    await touch(page, "pointerdown", [
      [1, 180, 400],
      [2, 220, 400],
    ]);
    for (let i = 1; i <= 5; i++) {
      await touch(page, "pointermove", [
        [1, 180 - 20 * i, 400],
        [2, 220 + 20 * i, 400],
      ]);
    }
    await touch(page, "pointerup", [
      [1, 80, 400],
      [2, 320, 400],
    ]);
    const after = await camera(page);
    // 40px to 240px apart: log2(6) levels
    expect(after.zoom).toBeCloseTo(before.zoom + Math.log2(6), 5);
    expect(after.x).toBe(before.x);
  });
});
