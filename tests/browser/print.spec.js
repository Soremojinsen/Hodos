import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

test("printing on 2×2 pages prints four captioned pages, then removes them", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.print = () => {
      window.printCount = (window.printCount ?? 0) + 1;
    };
  });
  await openMap(page);
  await page.getByRole("button", { name: "Exporter la carte" }).click();
  await page.locator("#print-pages").selectOption("2");
  await page.locator("#print-button").click();
  await expect.poll(() => page.evaluate(() => window.printCount ?? 0), { timeout: 60_000 }).toBe(1);

  const pages = page.locator("#print-container .print-page");
  await expect(pages).toHaveCount(4);
  await expect(pages.nth(1)).toContainText("Hodos · seed 12345 · page 2/4 (ligne 1, colonne 2)");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".main-content")).toBeHidden();
  await expect(pages.first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#print-container")).toHaveCount(0);
});
