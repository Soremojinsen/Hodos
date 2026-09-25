import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

/**
 * The page position of the continent cell centre closest to the middle of the screen.
 */
const landPoint = (page) =>
  page.evaluate(() => {
    const map = window.hodos;
    const rect = map.renderer.canvas.getBoundingClientRect();
    let best = null;
    for (const cell of map.generator.cells) {
      if (cell.continentNumber === 0) continue;
      const p = map.toScreen(cell.center.x, cell.center.y);
      const distance = Math.hypot(p.x - 500, p.y - 350);
      if (!best || distance < best.distance)
        best = { x: rect.left + p.x, y: rect.top + p.y, distance };
    }
    return best;
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
