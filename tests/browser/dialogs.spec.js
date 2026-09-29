import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

const isOpen = (page, id) => page.evaluate((id) => document.getElementById(id).open, id);

test("Escape closes the settings dialog", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  expect(await isOpen(page, "settings-dialog")).toBe(true);
  await page.keyboard.press("Escape");
  expect(await isOpen(page, "settings-dialog")).toBe(false);
});

test("Retour and a click outside close a dialog, and only one is open at a time", async ({
  page,
}) => {
  await openMap(page);
  await page.getByRole("button", { name: "Projet" }).click();
  expect(await isOpen(page, "project-dialog")).toBe(true);
  await page.locator("#project-dialog").getByRole("button", { name: "Retour" }).click();
  expect(await isOpen(page, "project-dialog")).toBe(false);

  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.mouse.click(40, 40);
  expect(await isOpen(page, "settings-dialog")).toBe(false);

  await page.getByRole("button", { name: "Projet" }).click();
  expect(await isOpen(page, "project-dialog")).toBe(true);
  expect(await isOpen(page, "settings-dialog")).toBe(false);
});

test("the footer buttons are reachable with Tab", async ({ page }) => {
  await openMap(page);
  const focused = new Set();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    focused.add(await page.evaluate(() => document.activeElement.textContent.trim()));
  }
  expect(focused).toContain("Paramètres");
  expect(focused).toContain("Projet");
});

test("map buttons have accessible names", async ({ page }) => {
  await openMap(page);
  for (const name of ["Zoom avant", "Zoom arrière", "Exporter la carte", "Recentrer la carte"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});

test("a drag from inside a dialog that ends outside leaves it open", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  // Selecting the seed past the field's end
  const field = await page.locator("#seed").boundingBox();
  await page.mouse.move(field.x + 5, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(40, 40, { steps: 5 });
  await page.mouse.up();
  expect(await isOpen(page, "settings-dialog")).toBe(true);
});

for (const [name, viewport] of [
  ["upright", { width: 360, height: 640 }],
  ["sideways", { width: 844, height: 390 }],
]) {
  test(`on a phone held ${name}, the dialogs fit between the screen's top and the footer`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMap(page);
    const footerTop = (await page.locator(".map-settings").boundingBox()).y;
    for (const [button, id] of [
      ["Projet", "project-dialog"],
      ["Paramètres", "settings-dialog"],
      ["Exporter la carte", "export-dialog"],
    ]) {
      await page.getByRole("button", { name: button }).click();
      const dialog = page.locator(`#${id}`);
      // Once its opening transition is over
      await expect(async () => {
        const box = await dialog.locator(".inner").boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(footerTop);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }).toPass();
      await dialog.getByRole("button", { name: "Retour" }).click();
    }
  });
}

test("on a phone, the project text scrolls to the GitHub link", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openMap(page);
  await page.getByRole("button", { name: "Projet" }).click();
  const link = page.locator("#project-dialog .github-link");
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await expect(page.locator("#project-title")).toBeInViewport();
});
