import { expect, test } from "@playwright/test";
import { camera, openMap } from "./helpers.js";

test.describe("on a computer", () => {
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

  test("clicking the map after the link is shown to copy by hand gives the keys back to the map", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined });
    });
    await openMap(page);
    await page.getByRole("button", { name: "Copier le lien" }).click();
    await expect(page.locator("#notice .notice-link")).toBeFocused();

    await page.mouse.click(500, 350);
    await page.keyboard.press("ArrowRight");
    expect((await camera(page)).x).toBeGreaterThan(0);
  });
});
