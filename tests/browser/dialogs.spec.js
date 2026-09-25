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
  for (const name of ["Zoom avant", "Zoom arrière", "Télécharger la carte"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});
