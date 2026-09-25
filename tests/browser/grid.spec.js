import { expect, test } from "@playwright/test";
import { camera, openMap } from "./helpers.js";

const overlayInk = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector(".hodos-overlay");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  });
const overlayImage = (page) =>
  page.evaluate(() => document.querySelector(".hodos-overlay").toDataURL());

test("there is no grid by default", async ({ page }) => {
  await openMap(page);
  await page.waitForTimeout(300);
  expect(await overlayInk(page)).toBe(0);
});

test("choosing hexagons draws a grid and saves it in the link", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await expect(page.locator("#grid-size")).toBeDisabled();
  await page.getByLabel("Hexagones").check();
  await expect(page.locator("#grid-size")).toBeEnabled();
  await expect.poll(() => overlayInk(page)).toBeGreaterThan(1000);
  await expect(page).toHaveURL(/grid=hex/);
});

test("the grid moves with the map", async ({ page }) => {
  await openMap(page, "./?seed=12345&grid=square");
  await expect.poll(() => overlayInk(page)).toBeGreaterThan(1000);
  const before = await overlayImage(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => overlayImage(page)).not.toBe(before);
});

test("size and opacity come from the link and set the sliders", async ({ page }) => {
  await openMap(page, "./?seed=12345&grid=square&gs=500&go=100");
  await expect(page.locator("#grid-size")).toHaveValue("500");
  await expect(page.locator("#grid-opacity")).toHaveValue("100");
  await expect(page.getByLabel("Carrés")).toBeChecked();
});

test("moving a slider updates the grid and the link", async ({ page }) => {
  await openMap(page, "./?seed=12345&grid=square");
  await page.getByRole("button", { name: "Paramètres" }).click();
  await page.locator("#grid-size").fill("600");
  await expect(page).toHaveURL(/gs=600/);
});

test("the grid doesn't stop the map from being dragged", async ({ page }) => {
  await openMap(page, "./?seed=12345&grid=hex");
  const before = await camera(page);
  await page.mouse.move(500, 350);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 5 });
  await page.mouse.up();
  expect((await camera(page)).x).toBeGreaterThan(before.x);
});

test("an opacity from the link that isn't a multiple of 5 survives moving another slider", async ({
  page,
}) => {
  await openMap(page, "./?seed=12345&grid=square&go=37");
  await expect(page).toHaveURL(/go=37/);
  await page.getByRole("button", { name: "Paramètres" }).click();
  await expect(page.locator("#grid-opacity")).toHaveValue("37");
  await page.locator("#grid-size").fill("600");
  await expect(page).toHaveURL(/gs=600/);
  await expect(page).toHaveURL(/go=37/);
});
