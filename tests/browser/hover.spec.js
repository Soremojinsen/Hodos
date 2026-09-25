import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

/**
 * The page position of the continent land closest to the middle of the screen.
 */
const landPoint = (page) =>
  page.evaluate(() => {
    const map = window.hodos;
    const rect = map.renderer.canvas.getBoundingClientRect();
    const view = map.camera.view;
    const candidates = [];
    for (let px = 0; px < view.width; px += 10) {
      for (let py = 0; py < view.height; py += 10) {
        candidates.push({ px, py, distance: Math.hypot(px - 500, py - 350) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { px, py, distance } of candidates) {
      const x = view.centerX + (px - view.width / 2) / view.pixelsPerUnit;
      const y = view.centerY + (view.height / 2 - py) / view.pixelsPerUnit;
      if (map.inspect(x, y)?.landmass?.type === "continent") {
        return { x: rect.left + px, y: rect.top + py, distance };
      }
    }
    return null;
  });

const enableHoverInfo = async (page) => {
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.getByLabel("Infos au survol").check();
  await page.keyboard.press("Escape");
  // The closing dialog's backdrop can otherwise swallow the next mouse move
  await expect(page.locator("#settings-dialog")).toBeHidden();
};

test("hover info is off by default", async ({ page }) => {
  await openMap(page);
  const point = await landPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(200);
  await expect(page.locator("#hover-info")).toBeHidden();
});

test("with hover info on, the panel names the land under the pointer", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  const point = await landPoint(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#hover-info")).toBeVisible();
  await expect(page.locator("#hover-land")).toContainText("Continent n°");
  await expect(page.locator("#hover-biome")).not.toBeEmpty();
  await expect(page.locator("#hover-relief")).not.toBeEmpty();

  // At zoom 1 the world is 512 px wide in the middle of the screen: x = 100 is outside
  await page.mouse.move(100, 350);
  await expect(page.locator("#hover-info")).toBeHidden();
});

test("hover info hides if the pointer leaves before its queued lookup runs", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  const point = await landPoint(page);
  // Dispatched synchronously, back to back, so the lookup the first move queues for the next
  // animation frame is still pending when the second (a leave) is handled.
  await page.evaluate(
    ([x, y]) => {
      const map = document.getElementById("map");
      const options = { clientX: x, clientY: y, bubbles: true, pointerType: "mouse" };
      map.dispatchEvent(new PointerEvent("pointermove", options));
      map.dispatchEvent(new PointerEvent("pointerleave", options));
    },
    [point.x, point.y],
  );
  // Give the browser a couple of frames to run any queued (and now stale) lookup
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator("#hover-info")).toBeHidden();
});

test("the hover info choice is remembered", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  await expect(page.locator("#hover-toggle")).toBeChecked();
});

test("the hover panel follows a language switch", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  const point = await landPoint(page);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#hover-land")).toContainText("Continent n°");
  // Switch without moving the pointer, so the panel stays up
  await page.evaluate(() => {
    const select = document.getElementById("language-select");
    select.value = "en";
    select.dispatchEvent(new Event("change"));
  });
  await expect(page.locator("#hover-land")).toContainText("Continent #");
  await expect(page.locator("#hover-info")).toContainText("Relief:");
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("tapping a land point on a touch device shows the panel and keeps it up", async ({
    page,
  }) => {
    await openMap(page);
    await enableHoverInfo(page);
    const point = await landPoint(page);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator("#hover-info")).toBeVisible();
    await expect(page.locator("#hover-biome")).not.toBeEmpty();
  });
});
