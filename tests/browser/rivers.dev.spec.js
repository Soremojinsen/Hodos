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
    // through the point, in 16 directions, counting the water pixels.
    //
    // A pixel's water fraction f: the Parchemin plains colour at any altitude a is
    // (0.529, 0.556, 0.364) - a / 5, which the hill shading and the vegetation marks multiply by
    // some s. So its green minus red and blue minus red, (0.027, -0.165) * s, point the same way
    // whatever a and s, while water's, from its exact colour (0.278, 0.470, 0.525), point
    // elsewhere. Floodplains blend that towards the parchment green (0.4, 0.55, 0.28), whose
    // direction (0.15, -0.12) lies between the plains' and away from water's: measured against it,
    // any mix of the two comes out 0 or negative. Splitting a pixel's (g - r, b - r) into f times water's plus some multiple of
    // the plains' gives f, 0 on any plains pixel however lit or marked. Beach, mountain and snow
    // colours come out negative, so 0 too.
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
        const [dx, dy] = [pixels[i + 1] - pixels[i], pixels[i + 2] - pixels[i]];
        const [wx, wy] = [(0.47 - 0.278) * 255, (0.525 - 0.278) * 255];
        // The floodplains' ground direction, the plains tinted towards the parchment green
        const [lx, ly] = [0.55 - 0.4, 0.28 - 0.4];
        return Math.min(Math.max((dx * ly - dy * lx) / (wx * ly - wy * lx), 0), 1);
      };
      let shortest = Infinity;
      for (let k = 0; k < 16; k++) {
        const angle = (k * Math.PI) / 16;
        let sum = 0;
        for (let t = -20; t <= 20; t += 0.25) {
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
    expect(points).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
    expect(error).toBeLessThan(1);
  }
});
