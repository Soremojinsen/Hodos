import { expect, test } from "@playwright/test";
import { openMap } from "./helpers.js";

test("the IM Fell font is loaded", async ({ page }) => {
  await openMap(page);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes("IM Fell") && f.status === "loaded");
  });
  expect(loaded).toBe(true);
});
