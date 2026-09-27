import { expect, test } from "vitest";
import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../../src/constants.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import {
  MAX_SEGMENT_PX,
  MAX_WIDTH_PX,
  MEANDER,
  MIN_WIDTH_PX,
  buildRivers,
  deepWater,
  meander,
  nearestWater,
  riverCourse,
  riverThreshold,
  riverWidth,
} from "../../src/generation/rivers.js";
import { siteAt } from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";

const sampler = new WorldSampler(withWater(generateWorld("12345")));
const rivers = sampler.rivers;
const pixelSize = (z) => WORLD_SIZE / 2 ** z / TILE_PIXEL_SIZE;

// Whether (px, py) is inside one of the triangles
const covered = ({ positions, indices }, px, py) => {
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

test("rivers are 1 to 5 px wide, wider downstream", () => {
  for (const z of [0, 3, 7]) {
    const threshold = riverThreshold(z);
    expect(riverWidth(threshold, z)).toBeCloseTo(MIN_WIDTH_PX * pixelSize(z));
    expect(riverWidth(4 * threshold, z)).toBeCloseTo((MIN_WIDTH_PX + 2) * pixelSize(z));
    expect(riverWidth(1e9, z)).toBeCloseTo(MAX_WIDTH_PX * pixelSize(z));
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
        expect(covered(triangles, px, py)).toBe(true);
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

test("without water there are no rivers", () => {
  const dry = new WorldSampler(generateWorld("12345"));
  expect(buildRivers(dry, 0, [0, 0, WORLD_SIZE, WORLD_SIZE])).toEqual({
    positions: [],
    indices: [],
  });
});
