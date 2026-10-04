import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

test("the IM Fell and Alegreya fonts are loaded", async ({ page }) => {
  await openMap(page);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return ["IM Fell", "Alegreya"].map((family) =>
      [...document.fonts].some((f) => f.family.includes(family) && f.status === "loaded"),
    );
  });
  expect(loaded).toEqual([true, true]);
});
