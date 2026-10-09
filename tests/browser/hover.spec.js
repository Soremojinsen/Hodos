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
  await expect(page.locator("#hover-land")).toContainText("Continent : ");
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

/**
 * The translation key of the biome under a page position, at the current camera.
 */
const biomeKeyAt = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const map = window.hodos;
      const rect = map.renderer.canvas.getBoundingClientRect();
      const view = map.camera.view;
      const info = map.inspect(
        view.centerX + (x - rect.left - view.width / 2) / view.pixelsPerUnit,
        view.centerY + (view.height / 2 - (y - rect.top)) / view.pixelsPerUnit,
      );
      return info && `biome.${info.biome}`;
    },
    [x, y],
  );

test("the panel follows the map when it zooms under a still pointer", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  // A point whose biome at zoom 1 differs from the one three zoom steps in
  const point = await page.evaluate(() => {
    const map = window.hodos;
    const biomeAt = (px, py, zoom) => {
      map.controller.setView(0, 0, zoom);
      const view = map.camera.view;
      return map.inspect(
        view.centerX + (px - view.width / 2) / view.pixelsPerUnit,
        view.centerY + (view.height / 2 - py) / view.pixelsPerUnit,
      )?.biome;
    };
    for (let px = 300; px < 700; px += 10) {
      for (let py = 150; py < 550; py += 10) {
        const before = biomeAt(px, py, 1);
        const after = biomeAt(px, py, 4);
        if (before && after && before !== after) {
          map.controller.setView(0, 0, 1);
          const rect = map.renderer.canvas.getBoundingClientRect();
          return { x: rect.left + px, y: rect.top + py };
        }
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#hover-info")).toBeVisible();
  const before = await page.locator("#hover-biome").getAttribute("data-i18n");

  for (let i = 0; i < 3; i++) await page.keyboard.press("+");
  const expected = await biomeKeyAt(page, point.x, point.y);
  expect(expected).not.toBe(before);
  await expect(page.locator("#hover-biome")).toHaveAttribute("data-i18n", expected);
});

test("the panel shows up when a zoom brings the world under a still pointer", async ({ page }) => {
  await openMap(page);
  await enableHoverInfo(page);
  // At zoom 1 the world is 512 px wide in the middle of the screen: x = 200 is outside
  await page.mouse.move(200, 350);
  await page.waitForTimeout(100);
  await expect(page.locator("#hover-info")).toBeHidden();
  for (let i = 0; i < 3; i++) await page.keyboard.press("+");
  await expect(page.locator("#hover-info")).toBeVisible();
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
  await expect(page.locator("#hover-land")).toContainText("Continent : ");
  // Switch without moving the pointer, so the panel stays up
  await page.evaluate(() => {
    const select = document.getElementById("language-select");
    select.value = "en";
    select.dispatchEvent(new Event("change"));
  });
  await expect(page.locator("#hover-land")).toContainText("Continent: ");
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

  test("tapping a map button does not show the panel", async ({ page }) => {
    await openMap(page);
    await enableHoverInfo(page);
    // Zoomed in, so the world (not the outside, which hides the panel anyway) is under the button
    await page.evaluate(() => window.hodos.controller.setView(0, 0, 4));
    const box = await page.locator("#map-zoom-in-button").boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => window.hodos.camera.zoom)).toBe(5);
    await expect(page.locator("#hover-info")).toBeHidden();
  });

  test("the still finger of a pinch does not count as a tap", async ({ page }) => {
    await openMap(page);
    await enableHoverInfo(page);
    await page.evaluate(() => window.hodos.controller.setView(0, 0, 4));
    // Playwright taps with one finger only: the pinch is made of pointer events
    await page.evaluate(() => {
      const touch = (type, pointerId, clientX) =>
        document.elementFromPoint(clientX, 350).dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId,
            pointerType: "touch",
            clientX,
            clientY: 350,
          }),
        );
      touch("pointerdown", 1, 500);
      touch("pointerdown", 2, 550);
      for (let x = 560; x <= 700; x += 20) touch("pointermove", 2, x);
      touch("pointerup", 2, 700);
      touch("pointerup", 1, 500);
    });
    expect(await page.evaluate(() => window.hodos.camera.zoom)).toBeGreaterThan(4);
    await expect(page.locator("#hover-info")).toBeHidden();
  });
});

test("over a settlement, the panel gives its name and size, in the page's language", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("hodos.hover", "on"));
  await openMap(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.hodosLabels.placed.some((p) => p.label.kind === "capital")),
    )
    .toBe(true);
  const point = await page.evaluate(() => {
    const capital = window.hodosLabels.placed.find((p) => p.label.kind === "capital");
    const rect = window.hodos.renderer.canvas.getBoundingClientRect();
    return { x: rect.left + capital.symbol.x, y: rect.top + capital.symbol.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator("#hover-name")).toHaveText(/, capitale$/);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#language-select").selectOption("en");
  await page.keyboard.press("Escape");
  await page.mouse.move(point.x, point.y + 1);
  await expect(page.locator("#hover-name")).toHaveText(/, capital$/);
});
