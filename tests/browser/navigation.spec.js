import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

const mapSeed = (page) => page.evaluate(() => window.hodos.generator.seed);

test("Nouvelle carte opens another map and Back returns to the previous one", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Nouvelle carte" }).click();
  await page.waitForURL((url) => url.searchParams.get("seed") !== "12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await mapSeed(page)).not.toBe("12345");

  await page.goBack();
  await expect(page).toHaveURL(/\?seed=12345$/);
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await mapSeed(page)).toBe("12345");
});

test("the last pan is saved even when leaving right away for a new map", async ({ page }) => {
  await openMap(page);
  await page.keyboard.press("ArrowRight");
  // No time for the debounced address-bar sync to run before navigating away
  await page.getByRole("button", { name: "Nouvelle carte" }).click();
  await page.waitForURL((url) => url.searchParams.get("seed") !== "12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");

  await page.goBack();
  await expect(page).toHaveURL(/\?seed=12345&x=195$/);
});

test("a new map keeps the mode and resets the view", async ({ page }) => {
  await openMap(page, "./?seed=12345&x=500&z=3&mode=biomes");
  await page.getByRole("button", { name: "Nouvelle carte" }).click();
  await page.waitForURL((url) => url.searchParams.get("seed") !== "12345");
  const params = new URL(page.url()).searchParams;
  expect(params.get("mode")).toBe("biomes");
  expect(params.has("x")).toBe(false);
  expect(params.has("z")).toBe(false);
});

test("the seed field opens that seed, special characters included", async ({ page }) => {
  const seed = "Terre du Milieu & co #1 é+";
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#seed").fill(seed);
  await page.getByRole("button", { name: "Changer" }).click();
  await page.waitForURL((url) => url.searchParams.get("seed") === seed);
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await mapSeed(page)).toBe(seed);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  expect(await mapSeed(page)).toBe(seed);
});

test("a seed longer than 200 characters is refused", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#seed").fill("a".repeat(201));
  await page.getByRole("button", { name: "Changer" }).click();
  await page.waitForTimeout(300);
  expect(new URL(page.url()).searchParams.get("seed")).toBe("12345");
  expect(await page.locator("#seed").evaluate((input) => input.validationMessage)).toContain(
    "trop longue",
  );
});

test("Copier le lien copies the link of the map as shown", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openMap(page);
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.locator("#notice")).toContainText("Lien copié !");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  expect(copied).toContain("x=195");
});

test("copying the link while the map is still generating uses the link's own view and mode", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Delays WorldMap#load so the click below lands during generation, before data-map="ready":
  // the camera and rendering mode the real map object exposes are still their construction
  // defaults at that point (zoom 0, mode "default"), not what the link asked for.
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
  await page.goto("./?seed=12345&x=500&z=3&mode=biomes");
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-map", "ready");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const params = new URL(copied).searchParams;
  expect(params.get("x")).toBe("500");
  expect(params.get("z")).toBe("3");
  expect(params.get("mode")).toBe("biomes");
});

test("without clipboard access the link is shown to copy by hand", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined });
  });
  await openMap(page);
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.locator("#notice")).toContainText("Copiez ce lien :");
  await expect(page.locator("#notice .notice-link")).toHaveValue(page.url());
});
