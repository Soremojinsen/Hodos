import { expect, test } from "@playwright/test";

test("rivers are as wide as riverPixels says, and keep their width when the level switches", async ({
  page,
}) => {
  await page.goto("./?seed=12345");
  await expect(page.locator("html")).toHaveAttribute("data-map", "ready");
  const switches = await page.evaluate(async () => {
    const { TILE_PIXEL_SIZE, WORLD_SIZE } = await import("/src/constants.js");
    const { levelForView } = await import("/src/map/tile-grid.js");
    const { riverCourse, riverPixels } = await import("/src/generation/rivers.js");
    const map = window.hodos;
    const renderer = map.renderer;
    const { sites, from, flow, mouth } = map.sampler.rivers;
    const side = 64;

    // The width in pixels of the river through a point, drawn at a zoom: the shortest chord
    // through the point, in 16 directions, counting the water pixels. On plains the blue minus
    // red of the Parchemin colours is -43.6 whatever the altitude, and 63 in water.
    const widthAt = async (x, y, zoom) => {
      const pixelsPerUnit = (TILE_PIXEL_SIZE * 2 ** zoom) / WORLD_SIZE;
      const view = { centerX: x, centerY: y, pixelsPerUnit, width: side, height: side };
      const level = levelForView(view);
      const release = await renderer.ensureTiles(view, level);
      let pixels;
      try {
        pixels = renderer.renderToPixels(view, level, "default");
      } finally {
        release();
      }
      const water = (px, py) => {
        const i = 4 * (py * side + px);
        return Math.min(Math.max((pixels[i + 2] - pixels[i] + 43.6) / (63 + 43.6), 0), 1);
      };
      let shortest = Infinity;
      for (let k = 0; k < 16; k++) {
        const angle = (k * Math.PI) / 16;
        let sum = 0;
        for (let t = -8; t <= 8; t += 0.25) {
          const px = Math.floor(side / 2 + t * Math.cos(angle));
          const py = Math.floor(side / 2 + t * Math.sin(angle));
          sum += 0.25 * water(px, py);
        }
        shortest = Math.min(shortest, sum);
      }
      return shortest;
    };

    // Rivers drawn at every level whose source is inland: land all around, at every level
    const inland = [];
    for (let k = 0; k < flow.length && flow[k] >= 256; k++) {
      const [x, y] = [sites[2 * from[k]], sites[2 * from[k] + 1]];
      let land = !mouth[k];
      for (let a = 0; a < 16 && land; a++) {
        const angle = (a * Math.PI) / 8;
        const [px, py] = [x + 150 * Math.cos(angle), y + 150 * Math.sin(angle)];
        if ([0, 3, 7].some((z) => !map.sampler.sampleAt(px, py, z).land)) land = false;
      }
      if (land) inland.push(k);
    }

    // Where the level switches while zooming in to level L. The inner points of a course at
    // level L - 1 are on its course at level L too, and away from the joins with other rivers.
    const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const result = [];
    for (let level = 4; level <= 7; level++) {
      const zoom = level - 0.5;
      const ratios = [];
      const errors = [];
      for (const k of inland) {
        const course = riverCourse(map.sampler, k, level - 1);
        for (let i = 2; i + 2 < course.length; i += 2) {
          const [x, y] = [course[i], course[i + 1]];
          const before = await widthAt(x, y, zoom - 0.01);
          const after = await widthAt(x, y, zoom + 0.01);
          ratios.push(after / before);
          errors.push(Math.abs(before - riverPixels(flow[k], zoom)));
        }
      }
      result.push({ level, points: ratios.length, ratio: median(ratios), error: median(errors) });
    }
    return result;
  });
  for (const { points, ratio, error } of switches) {
    expect(points).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
    expect(error).toBeLessThan(1);
  }
});
