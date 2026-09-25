import { expect, test } from "@playwright/test";

test("an element translated at runtime follows a language switch", async ({ page }) => {
  await page.goto("./?seed=12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  const texts = await page.evaluate(async () => {
    const { applyTranslations, switchLanguage } = await import("/src/ui/language.js");
    const element = document.createElement("p");
    element.dataset.i18n = "footer.settings";
    document.body.append(element);
    applyTranslations(element);
    const before = element.textContent;
    switchLanguage("en");
    return [before, element.textContent];
  });
  expect(texts).toEqual(["Paramètres", "Settings"]);
});
