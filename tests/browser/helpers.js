import { expect } from "@playwright/test";

export const SEED_URL = "./?seed=12345";

/**
 * A screen area in the middle of the map, clear of the logo, buttons and footer.
 */
export const CENTER = { x: 250, y: 200, width: 500, height: 300 };

/**
 * The width and height of a PNG image, read from its header.
 */
export const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/**
 * Opens the map and waits until it has loaded (or failed to).
 *
 * @returns {string[]} page errors and console errors, collected while the page lives
 */
export async function openMap(page, url = SEED_URL) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-map", /^(ready|error)$/);
  return errors;
}

export const camera = (page) =>
  page.evaluate(() => {
    const c = window.hodos.camera;
    return { x: c.posX, y: c.posY, zoom: c.zoom };
  });

/**
 * Decodes a base64 PNG into its RGBA pixel data (decoding an image needs a DOM, so this runs in
 * the page). Shared by countColors and countDifferentPixels so the decode exists in one place.
 */
function decodePng(page, png) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      data: context.getImageData(0, 0, image.width, image.height).data,
    };
  }, png.toString("base64"));
}

/**
 * Counts the distinct colors of a PNG image (every 97th pixel), decoding it in the page.
 */
export async function countColors(page, png) {
  const { data } = await decodePng(page, png);
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4 * 97) {
    colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return colors.size;
}

/**
 * Counts the pixels that clearly differ between two PNG images of the same size, decoding them in the page.
 */
export async function countDifferentPixels(page, pngA, pngB) {
  const [a, b] = await Promise.all([decodePng(page, pngA), decodePng(page, pngB)]);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `countDifferentPixels: images have different sizes (${a.width}x${a.height} vs ${b.width}x${b.height})`,
    );
  }
  const { data: dataA } = a;
  const { data: dataB } = b;
  let count = 0;
  for (let i = 0; i < dataA.length; i += 4) {
    const delta =
      Math.abs(dataA[i] - dataB[i]) +
      Math.abs(dataA[i + 1] - dataB[i + 1]) +
      Math.abs(dataA[i + 2] - dataB[i + 2]);
    if (delta > 30) count++;
  }
  return count;
}

/**
 * Dispatches touch pointer events on the map.
 *
 * @param type      "pointerdown", "pointermove" or "pointerup"
 * @param pointers  a list of [pointerId, clientX, clientY]
 */
export function touch(page, type, pointers) {
  return page.evaluate(
    ([type, pointers]) => {
      const map = document.getElementById("map");
      for (const [id, x, y] of pointers) {
        map.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            isPrimary: id === 1,
          }),
        );
      }
    },
    [type, pointers],
  );
}
