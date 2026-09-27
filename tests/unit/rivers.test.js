import { expect, test } from "vitest";
import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../../src/constants.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import {
  BEND_WIDTHS,
  MAX_SEGMENT_PX,
  MAX_WIDTH_PX,
  TRUE_WIDTH,
  TRUE_WIDTH_FLOW,
  MEANDER,
  MIN_WIDTH_PX,
  buildRivers,
  deepWater,
  maxHalfWidth,
  meander,
  pixelSize,
  nearestWater,
  riverAt,
  riverCourse,
  riverThreshold,
  riverPixels,
  riverWidth,
  riverWidthUniform,
  trueWidth,
} from "../../src/generation/rivers.js";
import { siteAt } from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";

const sampler = new WorldSampler(withWater(generateWorld("12345")));
const rivers = sampler.rivers;

// The vertices of river triangles where the shaders draw them at a zoom
const placed = ({ positions, shapes }, zoom) =>
  positions.map((value, i) => {
    if (i % 3 === 2) return value;
    const v = Math.floor(i / 3);
    return value + (shapes[i] * riverWidth(2 ** shapes[3 * v + 2], zoom)) / 2;
  });

// Whether (px, py) is inside one of the triangles, drawn at a zoom
const covered = (triangles, px, py, zoom) => {
  const positions = placed(triangles, zoom);
  const { indices } = triangles;
  const at = (i) => [positions[3 * i], positions[3 * i + 1]];
  const side = ([ax, ay], [bx, by]) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [at(indices[i]), at(indices[i + 1]), at(indices[i + 2])];
    const [s1, s2, s3] = [side(a, b), side(b, c), side(c, a)];
    if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return true;
  }
  return false;
};

test("each level shows rivers half as large as the level above, down to the smallest", () => {
  for (let z = 1; z <= 7; z++) {
    expect(riverThreshold(z)).toBeLessThanOrEqual(riverThreshold(z - 1));
  }
  expect(riverThreshold(0)).toBeGreaterThan(riverThreshold(1));
});

test("far out, rivers are lines 1 to 5 px wide, a pixel wider per doubling of the flow", () => {
  for (const z of [0, 2, 3]) {
    const threshold = riverThreshold(z);
    expect(riverPixels(threshold, z)).toBeCloseTo(MIN_WIDTH_PX, 2);
    expect(riverPixels(4 * threshold, z)).toBeCloseTo(MIN_WIDTH_PX + 2, 2);
  }
  expect(riverPixels(1024, 0)).toBeCloseTo(MAX_WIDTH_PX - 2, 2);
  expect(riverPixels(4096, 1)).toBeCloseTo(MAX_WIDTH_PX, 2);
});

test("up close, rivers are their real width, as the square root of their flow", () => {
  expect(trueWidth(TRUE_WIDTH_FLOW)).toBe(TRUE_WIDTH);
  expect(trueWidth(TRUE_WIDTH_FLOW / 4)).toBeCloseTo(TRUE_WIDTH / 2, 9);
  expect(riverWidth(TRUE_WIDTH_FLOW, 7)).toBeCloseTo(TRUE_WIDTH, 1);
  expect(riverWidth(TRUE_WIDTH_FLOW / 4, 7)).toBeCloseTo(TRUE_WIDTH / 2, 1);
  // Never narrower than either width
  for (const f of [4, 30, 256, 1000]) {
    for (const zoom of [0, 2.5, 5, 7]) {
      expect(riverWidth(f, zoom)).toBeGreaterThanOrEqual(trueWidth(f));
      expect(riverPixels(f, zoom)).toBeGreaterThanOrEqual(MIN_WIDTH_PX);
    }
  }
});

test("zooming in only ever widens a river on screen, gradually", () => {
  for (const f of [4, 30, 256, 1000]) {
    for (let zoom = 0; zoom < 7; zoom += 0.05) {
      const [before, after] = [riverPixels(f, zoom), riverPixels(f, zoom + 0.05)];
      expect(after).toBeGreaterThanOrEqual(before);
      // At most a pixel per level for a line, twice as wide per level for a real width
      expect(after).toBeLessThanOrEqual(before * 2 ** 0.05 + 0.05 + 1e-9);
    }
  }
});

test("a level's rivers are never wider than tiles expect, at any zoom it is drawn at", () => {
  for (const f of [4, 5, 6, 30, 256, 1000]) {
    for (let z = 0; z <= 7; z++) {
      for (let zoom = z - 0.5; zoom <= z + 0.5; zoom += 0.01) {
        expect(riverWidth(f, zoom) / 2).toBeLessThanOrEqual(maxHalfWidth(f, z) + 1e-9);
      }
    }
  }
});

test("the shaders get what they need to compute riverPixels", () => {
  for (const zoom of [0, 1.49, 1.51, 4.2, 7]) {
    const view = { pixelsPerUnit: (TILE_PIXEL_SIZE * 2 ** zoom) / WORLD_SIZE };
    const { line, real } = riverWidthUniform(view);
    const [logThreshold, min, max, unitsPerPixel] = line;
    const [unitPixels, blend] = real;
    expect(unitsPerPixel).toBeCloseTo(pixelSize(zoom), 9);
    for (const f of [4, 30, 256, 1000]) {
      // As in world_default.vert
      const linePixels = Math.min(Math.max(min + Math.log2(f) - logThreshold, min), max);
      const realPixels = unitPixels * 2 ** (0.5 * Math.log2(f));
      const pixels = (linePixels ** blend + realPixels ** blend) ** (1 / blend);
      expect(pixels).toBeCloseTo(riverPixels(f, zoom), 9);
    }
  }
});

test("river vertices sit on their course, moved by a unit direction, or none at a join's centre", () => {
  const a = rivers.from[0];
  const [x, y] = [rivers.sites[2 * a], rivers.sites[2 * a + 1]];
  const { positions, shapes, indices } = buildRivers(sampler, 3, [
    x - 500,
    y - 500,
    x + 500,
    y + 500,
  ]);
  expect(indices.length).toBeGreaterThan(0);
  expect(shapes).toHaveLength(positions.length);
  const flows = new Set(Array.from(rivers.flow, (f) => Math.log2(f)));
  for (let v = 0; v < positions.length / 3; v++) {
    const length = Math.hypot(shapes[3 * v], shapes[3 * v + 1]);
    expect(length === 0 || Math.abs(length - 1) < 1e-9).toBe(true);
    expect(flows.has(shapes[3 * v + 2])).toBe(true);
    expect(positions[3 * v + 2]).toBe(-0.1);
  }
});

test("a meander keeps its ends, stays near its edge, and has short segments", () => {
  const [ax, ay, bx, by] = [1000, 1000, 1040, 1030];
  const length = Math.hypot(bx - ax, by - ay);
  for (const z of [0, 4, 7]) {
    const points = meander(ax, ay, bx, by, "key", z);
    expect(points.slice(0, 2)).toEqual([ax, ay]);
    expect(points.slice(-2)).toEqual([bx, by]);
    for (let i = 0; i < points.length; i += 2) {
      // Distance to the segment's middle: within half its length, plus the bends
      const distance = Math.hypot(points[i] - (ax + bx) / 2, points[i + 1] - (ay + by) / 2);
      expect(distance).toBeLessThanOrEqual(length / 2 + 2 * MEANDER * length);
    }
    for (let i = 0; i + 3 < points.length; i += 2) {
      const segment = Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1]);
      // Bends lengthen segments by at most a factor √(1 + (2 MEANDER)²) per round
      expect(segment / pixelSize(z)).toBeLessThanOrEqual(2 * MAX_SEGMENT_PX);
    }
  }
});

test("a wide river bends no tighter than its width", () => {
  const [ax, ay, bx, by] = [1000, 1000, 1040, 1030];
  for (const width of [2, 7.5, 20]) {
    const points = meander(ax, ay, bx, by, "key", 7, width);
    for (let i = 0; i + 3 < points.length; i += 2) {
      const segment = Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1]);
      expect(segment).toBeGreaterThanOrEqual(BEND_WIDTHS * width);
    }
  }
  expect(meander(ax, ay, bx, by, "key", 7, 60)).toEqual([ax, ay, bx, by]);
});

test("a river is no wider in the world at a deeper level, so its course only gains bends", () => {
  for (const f of [4, 30, 256, 1000, 4096]) {
    for (let z = 1; z <= 7; z++) {
      expect(riverWidth(f, z)).toBeLessThanOrEqual(riverWidth(f, z - 1) + 1e-9);
    }
  }
  for (let k = 0; k < rivers.flow.length; k += 97) {
    for (let z = 1; z <= 7; z++) {
      const [shallow, deep] = [riverCourse(sampler, k, z - 1), riverCourse(sampler, k, z)];
      // Without the reach to the sea, which each level finds for itself
      const ends = (course) => {
        const b = rivers.to[k];
        const i = course.findIndex(
          (v, j) =>
            j % 2 === 0 && v === rivers.sites[2 * b] && course[j + 1] === rivers.sites[2 * b + 1],
        );
        return course.slice(0, i + 2);
      };
      const [s, d] = [ends(shallow), ends(deep)];
      for (let i = 0; i < s.length; i += 2) {
        const found = d.some((v, j) => j % 2 === 0 && v === s[i] && d[j + 1] === s[i + 1]);
        expect(found).toBe(true);
      }
    }
  }
});

test("a deeper level only adds bends: its course goes through the shallower one's points", () => {
  const shallow = meander(1000, 1000, 1080, 1030, "key", 4);
  const deep = meander(1000, 1000, 1080, 1030, "key", 6);
  expect(deep.length).toBeGreaterThan(shallow.length);
  const step = (deep.length - 2) / (shallow.length - 2);
  for (let i = 0; i < shallow.length; i += 2) {
    expect(deep[i * step]).toBeCloseTo(shallow[i]);
    expect(deep[i * step + 1]).toBeCloseTo(shallow[i + 1]);
  }
});

test("a river that reaches the sea or a lake ends in a cell drawn as water at each level", () => {
  for (const z of [0, 2, 5, 7]) {
    let [ends, dry] = [0, 0];
    for (let k = 0; k < rivers.flow.length && rivers.flow[k] >= riverThreshold(z); k++) {
      if (!rivers.mouth[k]) continue;
      const b = rivers.to[k];
      const [bx, by] = [rivers.sites[2 * b], rivers.sites[2 * b + 1]];
      // Unless no deep water is drawn within reach, as then the course ends at its edge
      if (!deepWater(sampler, bx, by, z) && !nearestWater(sampler, bx, by, z)) continue;
      const [ex, ey] = riverCourse(sampler, k, z).slice(-2);
      ends++;
      // The cell the tile draws there is coloured by its site
      if (sampler.sampleAt(...siteAt(sampler.seed, ex, ey, z), z).land) dry++;
    }
    expect(ends).toBeGreaterThan(3);
    // Deep water all around an end can still hold an islet at the cell's site: rarely
    expect(dry / ends).toBeLessThanOrEqual(0.02);
  }
});

test("a tile draws every point of the rivers that crosses it, so tiles join without seams", () => {
  for (const [z, x, y] of [
    [0, 0, 0],
    [3, 2, 3],
    [6, 20, 30],
  ]) {
    const size = WORLD_SIZE / 2 ** z;
    const area = [x * size, y * size, (x + 1) * size, (y + 1) * size];
    const triangles = buildRivers(sampler, z, area);
    let inside = 0;
    for (let k = 0; k < rivers.flow.length && rivers.flow[k] >= riverThreshold(z); k++) {
      const course = riverCourse(sampler, k, z);
      for (let i = 0; i < course.length; i += 2) {
        const [px, py] = [course[i], course[i + 1]];
        if (px < area[0] || px > area[2] || py < area[1] || py > area[3]) continue;
        inside++;
        // At the deepest zoom the level is drawn at, where rivers are narrowest in the world
        expect(covered(triangles, px, py, z + 0.49)).toBe(true);
      }
    }
    expect(inside).toBeGreaterThan(0);
  }
});

test("a tile draws no river smaller than its level shows", () => {
  const z = 2;
  const small = [];
  for (let k = 0; k < rivers.flow.length; k++) {
    if (rivers.flow[k] < riverThreshold(z)) small.push(k);
  }
  expect(small.length).toBeGreaterThan(0);
  const triangles = buildRivers(sampler, z, [0, 0, WORLD_SIZE, WORLD_SIZE]);
  for (const k of small.slice(0, 50)) {
    const a = rivers.from[k];
    const [ax, ay] = [rivers.sites[2 * a], rivers.sites[2 * a + 1]];
    // The source of a small river, when no larger river passes there
    const near = (i) =>
      Math.hypot(triangles.positions[3 * i] - ax, triangles.positions[3 * i + 1] - ay) < 1;
    const larger = rivers.to.some((b, j) => rivers.flow[j] >= riverThreshold(z) && b === a);
    if (!larger) expect(triangles.indices.some(near)).toBe(false);
  }
});

test("a river is found anywhere within the margin of its edge, even far out", () => {
  // At zoom 0.5 (level 1) a pixel is about 28 world units, more than the course of a short
  // edge strays: the margin reaches past what the edge's own width would
  const [z, zoom] = [1, 0.5];
  const margin = pixelSize(zoom);
  let missed = 0;
  for (let k = 0; k < rivers.flow.length && rivers.flow[k] >= riverThreshold(z); k++) {
    const course = riverCourse(sampler, k, z);
    const reach = riverWidth(rivers.flow[k], zoom) / 2 + margin;
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [px, py, qx, qy] = course.slice(i, i + 4);
      const length = Math.hypot(qx - px, qy - py);
      // Just inside the margin, on each side of the segment's middle
      for (const side of [1, -1]) {
        const x = (px + qx) / 2 + (side * (py - qy) * 0.99 * reach) / length;
        const y = (py + qy) / 2 + (side * (qx - px) * 0.99 * reach) / length;
        if (!riverAt(sampler, x, y, z, { zoom, margin })) missed++;
      }
    }
  }
  expect(missed).toBe(0);
});

test("without water there are no rivers", () => {
  const dry = new WorldSampler(generateWorld("12345"));
  expect(buildRivers(dry, 0, [0, 0, WORLD_SIZE, WORLD_SIZE])).toEqual({
    positions: [],
    shapes: [],
    indices: [],
  });
});
