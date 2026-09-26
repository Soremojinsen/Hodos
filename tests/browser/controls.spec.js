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

test("keys don't move the map while a dialog is open", async ({ page }) => {
  await openMap(page);
  // The project dialog has no input, its first link gets the focus
  await page.locator(".map-settings").getByText("Projet").click();
  const before = await camera(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  expect(await camera(page)).toEqual(before);
});

test("browser zoom shortcuts don't zoom the map", async ({ page }) => {
  await openMap(page);
  const before = await camera(page);
  await page.keyboard.press("Control+-");
  await page.keyboard.press("Meta+-");
  expect(await camera(page)).toEqual(before);
});

test("the mouse wheel zooms, a horizontal scroll doesn't", async ({ page }) => {
  await openMap(page);
  const before = await camera(page);
  await page.mouse.move(500, 350);
  await page.mouse.wheel(120, 0);
  expect(await camera(page)).toEqual(before);
  await page.mouse.wheel(0, -120);
  expect((await camera(page)).zoom).toBeGreaterThan(before.zoom);
});

test("the wheel zooms by how far it scrolls, so a trackpad's many small steps don't race", async ({
  page,
}) => {
  await openMap(page);
  await page.mouse.move(500, 350);
  // A trackpad: 80 px of scroll in 20 small events
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -4);
  const trackpad = (await camera(page)).zoom;
  await page.evaluate(() => window.hodos.controller.setView(0, 0, 1));
  // A mouse: the same 80 px in one event
  await page.mouse.wheel(0, -80);
  expect(trackpad).toBeCloseTo((await camera(page)).zoom, 5);
  expect(trackpad).toBeLessThan(2);
});

test("a wheel scrolling by lines (Firefox) zooms like one scrolling by pixels", async ({
  page,
}) => {
  await openMap(page);
  const wheel = (deltaY, deltaMode) =>
    page.evaluate(
      ([deltaY, deltaMode]) =>
        document
          .getElementById("map")
          .dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode, cancelable: true })),
      [deltaY, deltaMode],
    );
  // One notch: 3 lines (deltaMode 1, DOM_DELTA_LINE), or 100 px in Chrome
  await wheel(-3, 1);
  const lines = (await camera(page)).zoom;
  await page.evaluate(() => window.hodos.controller.setView(0, 0, 1));
  await wheel(-100, 0);
  expect(lines).toBeCloseTo((await camera(page)).zoom, 5);
  expect(lines).toBeGreaterThan(1.3);
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

test("a mode chosen while the map is generating is the one drawn", async ({ page }) => {
  // Delays WorldMap#load so the mode is chosen before data-map="ready"
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
  await page.evaluate(() => {
    const input = document.querySelector('#mode-form input[value="biomes"]');
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-map", "ready");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await page.evaluate(() => window.hodos.renderer.renderingMode)).toBe("biomes");
  await expect(page).toHaveURL(/mode=biomes/);
});
