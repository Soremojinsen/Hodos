import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { riverAt } from "../../src/generation/rivers.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";
import { countColors, openMap, waitForTiles } from "./helpers.js";

const frameCount = (page) => page.evaluate(() => window.hodos.renderer.frameCount);

test("the map is not redrawn while idle", async ({ page }) => {
  await openMap(page);
  await page.waitForTimeout(300);
  const before = await frameCount(page);
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(await frameCount(page)).toBe(before);
});

test("moving, resizing and switching mode redraw the map", async ({ page }) => {
  await openMap(page);
  await expect.poll(() => frameCount(page)).toBeGreaterThan(0);
  let count = await frameCount(page);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
  count = await frameCount(page);

  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
  expect(await page.evaluate(() => window.hodos.renderer.canvas.width)).toBe(800);
  count = await frameCount(page);

  await page.locator(".map-settings").getByText("Paramètres").click();
  await page.locator("#biomes-toggle").check();
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
});

test.describe("on a high-density screen", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the map and the grid have a device pixel per screen pixel", async ({ page }) => {
    await openMap(page);
    const sizes = await page.evaluate(() => {
      const map = window.hodos;
      const overlay = document.querySelector(".hodos-overlay");
      return {
        canvas: [map.renderer.canvas.width, map.renderer.canvas.height],
        overlay: [overlay.width, overlay.height],
        shown: [map.renderer.canvas.clientWidth, overlay.clientWidth],
        view: [map.camera.view.width, map.camera.view.height],
      };
    });
    expect(sizes.canvas).toEqual([2000, 1400]);
    expect(sizes.overlay).toEqual([2000, 1400]);
    expect(sizes.shown).toEqual([1000, 1000]);
    // The camera's view, used by the pointer, the grid and exports, stays in CSS pixels
    expect(sizes.view).toEqual([1000, 700]);
  });
});

test("exporting the current view at ×1 downloads the drawn map as a PNG", async ({ page }) => {
  await openMap(page);
  await page.click("#screenshot");
  await page.getByLabel("Vue actuelle").check();
  await page.locator("#export-size").selectOption("1");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-download"),
  ]);
  expect(download.suggestedFilename()).toBe("hodos-12345-1000x700.png");
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(await countColors(page, png)).toBeGreaterThan(20);
});

test("zooming in draws the tiles of the new level once they are loaded", async ({ page }) => {
  await openMap(page);
  expect(await page.evaluate(() => window.hodos.renderer.drawnTiles)).not.toHaveLength(0);
  await page.click("#map-zoom-in-button");
  await waitForTiles(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const drawn = await page.evaluate(() => window.hodos.renderer.drawnTiles);
  expect(drawn.length).toBeGreaterThan(0);
  for (const key of drawn) expect(key.startsWith("2/")).toBe(true);
});

test("a coast drawn at level 5 differs from the same view drawn at level 3", async ({ page }) => {
  await openMap(page);
  const different = await page.evaluate(async () => {
    const map = window.hodos;
    // A coast point: east from the world's centre until land and sea change
    const land = (x) => map.sampler.sampleAt(x, 5000, 5).land;
    let x = 5000;
    while (x < 10000 && land(x) === land(5000)) x += 10;
    const view = {
      centerX: x,
      centerY: 5000,
      pixelsPerUnit: (256 * 2 ** 5) / 10000,
      width: 256,
      height: 256,
    };
    const render = async (level) => {
      const release = await map.renderer.ensureTiles(view, level);
      try {
        return map.renderer.renderToPixels(view, level);
      } finally {
        release();
      }
    };
    const [shallow, deep] = [await render(3), await render(5)];
    let count = 0;
    for (let i = 0; i < deep.length; i += 4) {
      const delta =
        Math.abs(deep[i] - shallow[i]) +
        Math.abs(deep[i + 1] - shallow[i + 1]) +
        Math.abs(deep[i + 2] - shallow[i + 2]);
      if (delta > 30) count++;
    }
    return count / (deep.length / 4);
  });
  expect(different).toBeGreaterThan(0.01);
});

test("rivers are drawn as water in the Parchemin rendering, not in debug mode", async ({
  page,
}) => {
  // The source of the largest river whose both ends are land at level 5: a point of its course
  const sampler = new WorldSampler(withWater(generateWorld("12345")));
  const { sites, from, to } = sampler.rivers;
  const land = (i) => sampler.sampleAt(sites[2 * i], sites[2 * i + 1], 5).land;
  const k = from.findIndex((a, j) => land(a) && land(to[j]));
  const [x, y] = [sites[2 * from[k]], sites[2 * from[k] + 1]];

  await openMap(page);
  const centre = (mode) =>
    page.evaluate(
      async ([x, y, mode]) => {
        const renderer = window.hodos.renderer;
        const view = { centerX: x, centerY: y, pixelsPerUnit: (256 * 2 ** 5) / 10000 };
        Object.assign(view, { width: 16, height: 16 });
        const release = await renderer.ensureTiles(view, 5);
        try {
          const pixels = renderer.renderToPixels(view, 5, mode);
          const i = 4 * (8 * 16 + 8);
          return [pixels[i], pixels[i + 1], pixels[i + 2]];
        } finally {
          release();
        }
      },
      [x, y, mode],
    );
  // The water color of shaders/world_default.frag
  const water = [0.278, 0.47, 0.525].map((c) => Math.round(c * 255));
  const near = (color) => color.every((c, i) => Math.abs(c - water[i]) <= 2);
  expect(near(await centre("default"))).toBe(true);
  expect(near(await centre("debug"))).toBe(false);
});

/**
 * The mean brightness (r + g + b) of the pixel at each world point, drawn at a level in a mode.
 */
const brightness = (page, points, level, mode) =>
  page.evaluate(
    async ([points, level, mode]) => {
      const renderer = window.hodos.renderer;
      let sum = 0;
      for (const [x, y] of points) {
        const view = { centerX: x, centerY: y, pixelsPerUnit: (256 * 2 ** level) / 10000 };
        Object.assign(view, { width: 16, height: 16 });
        const release = await renderer.ensureTiles(view, level);
        try {
          const pixels = renderer.renderToPixels(view, level, mode);
          const i = 4 * (8 * 16 + 8);
          sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
        } finally {
          release();
        }
      }
      return sum / points.length;
    },
    [points, level, mode],
  );

test("hills are lit from the north-west in the Parchemin and Biomes renderings, not in debug mode", async ({
  page,
}) => {
  // Steep plain points at level 4 (plains have no marks), away from rivers, whose ground falls
  // towards the light (it faces it) or away from it
  const sampler = new WorldSampler(withWater(generateWorld("12345")));
  const plain = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "Plain");
  const light = [-Math.SQRT1_2, Math.SQRT1_2];
  const random = aleaPRNG("hills");
  const [lit, shaded] = [[], []];
  for (let n = 0; n < 200_000 && (lit.length < 20 || shaded.length < 20); n++) {
    const [x, y] = [random() * 10000, random() * 10000];
    const sample = sampler.sampleAt(x, y, 4);
    if (sample.biome !== plain || sample.altitude < 0.2 || sample.altitude > 0.5) continue;
    const [dx, dy] = sampler.slopeAt(x, y, 4);
    const steepness = Math.hypot(dx, dy);
    if (steepness < 2e-3 || riverAt(sampler, x, y, 4, { margin: 30 })) continue;
    const facing = -(dx * light[0] + dy * light[1]) / steepness;
    if (facing > 0.8 && lit.length < 20) lit.push([x, y]);
    if (facing < -0.8 && shaded.length < 20) shaded.push([x, y]);
  }
  expect(lit).toHaveLength(20);
  expect(shaded).toHaveLength(20);

  await openMap(page);
  for (const mode of ["default", "biomes"]) {
    const [bright, dark] = [
      await brightness(page, lit, 4, mode),
      await brightness(page, shaded, 4, mode),
    ];
    expect(bright).toBeGreaterThan(dark + 30);
  }
  // Every plain has the same debug color
  expect(await brightness(page, lit, 4, "debug")).toBe(await brightness(page, shaded, 4, "debug"));
});

/**
 * A level-5 point of a biome whose 64-px square around it is all that biome, away from rivers
 * and at altitudes that the relief noise cannot push into the beach or mountain colours.
 */
const uniformArea = (sampler, name, seed) => {
  const biome = BIOME_DEFINITIONS.findIndex((definition) => definition.name === name);
  const half = (32 * 10000) / (256 * 2 ** 5);
  const random = aleaPRNG(seed);
  for (let n = 0; n < 500_000; n++) {
    const [x, y] = [half + random() * (10000 - 2 * half), half + random() * (10000 - 2 * half)];
    let uniform = true;
    for (const dx of [-half, 0, half]) {
      for (const dy of [-half, 0, half]) {
        const sample = sampler.sampleAt(x + dx, y + dy, 5);
        if (sample.biome !== biome || sample.altitude < 0.25 || sample.altitude > 0.5)
          uniform = false;
      }
    }
    if (uniform && !riverAt(sampler, x, y, 5, { margin: 2 * half })) return [x, y];
  }
  throw new Error(`No uniform ${name} area`);
};

/**
 * The share of the pixels of a 64-px view much darker than one of the pixels 4 px around them:
 * small dark marks, not the gradual hill shading.
 */
const markShare = (page, [x, y], mode) =>
  page.evaluate(
    async ([x, y, mode]) => {
      const renderer = window.hodos.renderer;
      const view = { centerX: x, centerY: y, pixelsPerUnit: (256 * 2 ** 5) / 10000 };
      Object.assign(view, { width: 64, height: 64 });
      const release = await renderer.ensureTiles(view, 5);
      let pixels;
      try {
        pixels = renderer.renderToPixels(view, 5, mode);
      } finally {
        release();
      }
      const b = (px, py) => {
        const i = 4 * (py * 64 + px);
        return pixels[i] + pixels[i + 1] + pixels[i + 2];
      };
      let dark = 0;
      let total = 0;
      for (let py = 4; py < 60; py++) {
        for (let px = 4; px < 60; px++) {
          const around = Math.max(b(px - 4, py), b(px + 4, py), b(px, py - 4), b(px, py + 4));
          if (b(px, py) < 0.85 * around) dark++;
          total++;
        }
      }
      return dark / total;
    },
    [x, y, mode],
  );

test("forests are drawn with marks, plains are not, and debug mode has none", async ({ page }) => {
  const sampler = new WorldSampler(withWater(generateWorld("12345")));
  const forest = uniformArea(sampler, "Forest", "forest");
  const plain = uniformArea(sampler, "Plain", "plain");
  await openMap(page);
  for (const mode of ["default", "biomes"]) {
    expect(await markShare(page, forest, mode)).toBeGreaterThan(0.05);
    expect(await markShare(page, plain, mode)).toBeLessThan(0.02);
  }
  expect(await markShare(page, forest, "debug")).toBe(0);
});
