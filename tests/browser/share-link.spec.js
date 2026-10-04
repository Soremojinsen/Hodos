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

/**
 * Replaces the share sheet with a fake that records what it is given in window.shared, then
 * resolves, or rejects with a DOMException named failure.
 */
const fakeShare = (page, failure = null) =>
  page.addInitScript((failure) => {
    window.shared = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.shared.push(data);
        if (failure) throw new DOMException("", failure);
      },
    });
  }, failure);

const shared = (page) => page.evaluate(() => window.shared);

const renameOcean = (page) =>
  page.evaluate(() => {
    const id = window.hodosEdits.labels.find((l) => l.kind === "ocean").id;
    window.hodosEdits.update((e) => ({ ...e, names: { ...e.names, [id]: { root: "Mirewater" } } }));
  });

test.describe("on a phone", () => {
  test.use({ isMobile: true, hasTouch: true });

  test("Partager shares the link of the map as shown", async ({ page }) => {
    await fakeShare(page);
    await openMap(page);
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Partager" }).click();
    await expect.poll(() => shared(page)).toEqual([{ url: page.url() }]);
    expect(page.url()).toContain("x=195");
    await expect(page.locator("#notice")).toBeHidden();
  });

  test("sharing a renamed map says the link shows the generated names", async ({ page }) => {
    await fakeShare(page);
    await openMap(page);
    await renameOcean(page);
    await page.getByRole("button", { name: "Partager" }).click();
    await expect(page.locator("#notice")).toContainText(
      "Le lien montre les noms générés, pas les vôtres. Pour les partager, envoyez aussi le fichier des noms.",
    );
  });

  test("closing the share sheet does nothing", async ({ page }) => {
    await fakeShare(page, "AbortError");
    await page.addInitScript(() => {
      window.copied = [];
      navigator.clipboard.writeText = async (text) => window.copied.push(text);
    });
    await openMap(page);
    await page.getByRole("button", { name: "Partager" }).click();
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    await expect(page.locator("#notice")).toBeHidden();
    expect(await page.evaluate(() => window.copied)).toEqual([]);
  });

  test("a share that fails copies the link instead", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await fakeShare(page, "NotAllowedError");
    await openMap(page);
    await page.getByRole("button", { name: "Partager" }).click();
    await expect(page.locator("#notice")).toContainText("Lien copié !");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });

  test("the share button follows the language", async ({ page }) => {
    await fakeShare(page);
    await openMap(page);
    await page.getByRole("button", { name: "Paramètres" }).click();
    await page.locator("#language-select").selectOption("en");
    await expect(page.locator("#copy-link-button")).toHaveText("Share");
  });
});

test("a computer that can share still copies", async ({ page }) => {
  await fakeShare(page);
  await openMap(page);
  await expect(page.locator("#copy-link-button")).toHaveText("Copier le lien");
});
