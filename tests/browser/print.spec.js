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

test("Ctrl+P without a print in progress still shows the map", async ({ page }) => {
  await openMap(page);
  await expect(page.locator("#print-container")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".hodos-canvas")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("a failing page mid-print revokes the URLs made so far and leaves no container", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.printCount = (window.printCount ?? 0) + 1;
    };
    window.createdUrls = [];
    window.revokedUrls = [];
    const realCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = realCreate(blob);
      window.createdUrls.push(url);
      return url;
    };
    const realRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      window.revokedUrls.push(url);
      realRevoke(url);
    };
    // Of the four pieces a 2×2 print makes, fail the second one's encoding: the first piece's
    // URL must then be cleaned up even though it was never used.
    let calls = 0;
    const realToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      calls++;
      if (calls === 2) {
        callback(null);
        return;
      }
      realToBlob.call(this, callback, ...args);
    };
  });
  await openMap(page);
  await page.getByRole("button", { name: "Exporter la carte" }).click();
  await page.locator("#print-pages").selectOption("2");
  await page.locator("#print-button").click();

  await expect(page.locator("#export-status")).toHaveText("L'export a échoué.");
  await expect(page.locator("#print-container")).toHaveCount(0);
  await expect(page.locator("#print-button")).toBeEnabled();
  expect(await page.evaluate(() => window.printCount ?? 0)).toBe(0);

  const [created, revoked] = await page.evaluate(() => [
    window.createdUrls.length,
    window.revokedUrls.length,
  ]);
  expect(created).toBeGreaterThan(0);
  expect(revoked).toBe(created);
});
