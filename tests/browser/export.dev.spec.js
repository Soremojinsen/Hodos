import { expect, test } from "@playwright/test";

const openDevMap = async (page) => {
  await page.goto("./?seed=12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
};

test("the world renders offscreen, the same in chunks, without moving the camera", async ({
  page,
}) => {
  await openDevMap(page);
  const result = await page.evaluate(async () => {
    const { exportView, renderImage } = await import("/src/export/export.js");
    const map = window.hodos;
    const before = { x: map.camera.posX, y: map.camera.posY, zoom: map.camera.zoom };
    const view = exportView("world", 1024, map.camera.view);
    const renderer = map.renderer;
    // Small chunks, to exercise the seams
    const chunked = {
      maxChunkSize: 300,
      ensureTiles: (v, level) => renderer.ensureTiles(v, level),
      renderToPixels: (v, level) => renderer.renderToPixels(v, level),
    };
    const pixelsOf = (canvas) => canvas.getContext("2d").getImageData(0, 0, 1024, 1024).data;
    const whole = pixelsOf(await renderImage(renderer, view, null));
    const pieces = pixelsOf(await renderImage(chunked, view, null));
    let different = 0;
    for (let i = 0; i < whole.length; i += 4) {
      const delta =
        Math.abs(whole[i] - pieces[i]) +
        Math.abs(whole[i + 1] - pieces[i + 1]) +
        Math.abs(whole[i + 2] - pieces[i + 2]);
      // Lower threshold than helpers.js's countDifferentPixels (30): this compares the same
      // render tiled two ways, where only faint seam antialiasing should differ, not two
      // independently drawn PNGs with more legitimate pixel-level variation.
      if (delta > 24) different++;
    }
    const colors = new Set();
    for (let i = 0; i < whole.length; i += 4 * 101) {
      colors.add((whole[i] << 16) | (whole[i + 1] << 8) | whole[i + 2]);
    }
    const after = { x: map.camera.posX, y: map.camera.posY, zoom: map.camera.zoom };
    return { different, colors: colors.size, before, after };
  });
  expect(result.colors).toBeGreaterThan(20);
  expect(result.different).toBeLessThan(1024 * 1024 * 0.001);
  expect(result.after).toEqual(result.before);
});

test("a failing render leaves the map working", async ({ page }) => {
  await openDevMap(page);
  const result = await page.evaluate(async () => {
    const { exportView, renderImage } = await import("/src/export/export.js");
    const map = window.hodos;
    const canvas = map.renderer.canvas;
    const gl = canvas.getContext("webgl");
    const readPixels = gl.readPixels;
    gl.readPixels = () => {
      throw new Error("simulated failure");
    };
    let threw = false;
    try {
      await renderImage(map.renderer, exportView("world", 512, map.camera.view), null);
    } catch {
      threw = true;
    } finally {
      gl.readPixels = readPixels;
    }
    return {
      threw,
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
      viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
      size: [canvas.width, canvas.height],
      frames: map.renderer.frameCount,
    };
  });
  expect(result.threw).toBe(true);
  expect(result.framebuffer).toBeNull();
  expect(result.viewport).toEqual([0, 0, ...result.size]);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => page.evaluate(() => window.hodos.renderer.frameCount))
    .toBeGreaterThan(result.frames);
});

test("an export draws every chunk from its own level's tiles, loaded first", async ({ page }) => {
  await openDevMap(page);
  const result = await page.evaluate(async () => {
    const { exportView, renderImage, chunkRects } = await import("/src/export/export.js");
    const { tilesInView, levelForView, tileKey } = await import("/src/map/tile-grid.js");
    const { subView } = await import("/src/map/view.js");
    const renderer = window.hodos.renderer;
    const drawn = [];
    const spy = {
      maxChunkSize: 512,
      ensureTiles: (v, level) => renderer.ensureTiles(v, level),
      renderToPixels: (v, level) => {
        const pixels = renderer.renderToPixels(v, level);
        drawn.push([...renderer.drawnTiles]);
        return pixels;
      },
    };
    // 1024 px for the whole world is level 2: 16 tiles, 4 of its own per 512 px chunk (padding
    // for neighbour tiles' overhanging cells may draw a few more)
    const view = exportView("world", 1024, window.hodos.camera.view);
    const level = levelForView(view);
    const ownTilesPerChunk = chunkRects(view.width, view.height, 512).map((rect) =>
      tilesInView(subView(view, rect), level).map(({ z, x, y }) => tileKey(z, x, y)),
    );
    await renderImage(spy, view, null);
    return { drawn, ownTilesPerChunk };
  });
  expect(result.drawn).toHaveLength(4);
  result.drawn.forEach((keys, i) => {
    for (const key of keys) expect(key.startsWith("2/")).toBe(true);
    for (const ownKey of result.ownTilesPerChunk[i]) expect(keys).toContain(ownKey);
  });
});

test("a 1024px world export renders identically whole and in 256px chunks landing on tile edges", async ({
  page,
}) => {
  await openDevMap(page);
  const result = await page.evaluate(async () => {
    const { exportView, renderImage } = await import("/src/export/export.js");
    const map = window.hodos;
    const view = exportView("world", 1024, map.camera.view);
    const renderer = map.renderer;
    // 256 px chunks: at level 2 (1024 px world / 4 tiles per side) tile edges land exactly on
    // chunk edges, so a tile whose neighbours' overhanging cells are not drawn there shows a
    // clear-colour notch, rather than the sub-tile antialiasing noise a misaligned chunk size
    // (like the 300 px chunks above) would blur it into.
    const chunked = {
      maxChunkSize: 256,
      ensureTiles: (v, level) => renderer.ensureTiles(v, level),
      renderToPixels: (v, level) => renderer.renderToPixels(v, level),
    };
    const pixelsOf = (canvas) => canvas.getContext("2d").getImageData(0, 0, 1024, 1024).data;
    const whole = pixelsOf(await renderImage(renderer, view, null));
    const pieces = pixelsOf(await renderImage(chunked, view, null));
    let different = 0;
    for (let i = 0; i < whole.length; i++) {
      if (whole[i] !== pieces[i]) different++;
    }
    return { different };
  });
  expect(result.different).toBe(0);
});
