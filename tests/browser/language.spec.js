import { expect, test } from "@playwright/test";
import { camera, openMap } from "./helpers.js";

test("a French browser gets the French page", async ({ page }) => {
  await openMap(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("button", { name: "Paramètres" })).toBeVisible();
  await expect(page.locator("#settings-title")).toHaveText("Paramètres");
});

test.describe("in an English browser", () => {
  test.use({ locale: "en-US" });

  test("the page is in English", async ({ page }) => {
    await openMap(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Hodos, a procedural world map generator in your browser.",
    );
  });

  test("the switch changes the language in place and is remembered", async ({ page }) => {
    await openMap(page);
    await page.keyboard.press("ArrowRight");
    const before = await camera(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.locator("#language-select").selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("#settings-title")).toHaveText("Paramètres");
    await expect(page.locator("#project-dialog p i").first()).toHaveText("Hodos");
    expect(await camera(page)).toEqual(before);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
    await expect(page.getByRole("button", { name: "Paramètres" })).toBeVisible();
    await expect(page.locator("#language-select")).toHaveValue("fr");
  });
});
