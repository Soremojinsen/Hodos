import { expect, test } from "vitest";
import { MARK_SPACING_PX, TILE_PIXEL_SIZE, WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import {
  BANK_MIN_PX,
  BEND_WIDTHS,
  FLOODPLAIN,
  MAX_SEGMENT_PX,
  MAX_WIDTH_PX,
  TRUE_WIDTH,
  TRUE_WIDTH_FLOW,
  MEANDER,
  MIN_WIDTH_PX,
  bankAt,
  bankHalfWidth,
  buildRivers,
  deepWater,
  drawnHalfWidth,
  maxHalfWidth,
  meander,
  pixelSize,
  nearestWater,
  nearRivers,
  riverAt,
  riverCourse,
  riverCourses,
  riverThreshold,
  riverPixels,
  riverSquares,
  riverWidth,
  riverWidthUniform,
  trueWidth,
} from "../../src/generation/rivers.js";
import { siteAt } from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";

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

test("a level's rivers are drawn at most drawnHalfWidth wide, and reach it", () => {
  for (const f of [4, 5, 6, 7, 30, 256, 1000, 50_000]) {
    for (let z = 0; z <= 7; z++) {
      let widest = 0;
      for (let zoom = z - 0.5; zoom <= z + 0.5 + 1e-9; zoom += 0.001) {
        widest = Math.max(widest, riverWidth(f, zoom) / 2);
      }
      expect(drawnHalfWidth(f, z)).toBeGreaterThanOrEqual(widest - 1e-9);
      expect(drawnHalfWidth(f, z)).toBeLessThanOrEqual(widest * 1.0001);
      expect(drawnHalfWidth(f, z)).toBeLessThanOrEqual(maxHalfWidth(f, z) + 1e-9);
    }
  }
});

test("the marks leave bare every square a river is drawn over, and only squares near one", () => {
  const random = aleaPRNG("river squares");
  for (const [z, x, y] of [
    [2, 1, 1],
    [5, 9, 19],
    [7, 30, 75],
  ]) {
    const size = WORLD_SIZE / 2 ** z;
    const area = [x * size, y * size, (x + 1) * size, (y + 1) * size];
    const cell = MARK_SPACING_PX * pixelSize(z);
    const { origin, size: squares, blocked } = riverSquares(sampler, z, cell, area);
    const isBlocked = (px, py) => {
      const [i, j] = [Math.floor(px / cell) - origin[0], Math.floor(py / cell) - origin[1]];
      return blocked[j * squares[0] + i] === 255;
    };
    const triangles = buildRivers(sampler, z, area);
    expect(triangles.indices.length).toBeGreaterThan(0);
    // Points around the rivers' vertices, inside the area
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const v = Math.floor(random() * (triangles.positions.length / 3));
      const [vx, vy] = [triangles.positions[3 * v], triangles.positions[3 * v + 1]];
      const [px, py] = [vx + (random() - 0.5) * 2 * cell, vy + (random() - 0.5) * 2 * cell];
      if (px < area[0] || px >= area[2] || py < area[1] || py >= area[3]) continue;
      for (const zoom of [z - 0.49, z, z + 0.49]) {
        if (!covered(triangles, px, py, zoom)) continue;
        checked++;
        expect(isBlocked(px, py)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(50);
    // A bare square is within its diagonal of a river as drawn from the level's farthest zoom
    let bare = 0;
    for (let j = 0; j < squares[1]; j++) {
      for (let i = 0; i < squares[0]; i++) {
        if (!blocked[j * squares[0] + i]) continue;
        bare++;
        const [cx, cy] = [(origin[0] + i + 0.5) * cell, (origin[1] + j + 0.5) * cell];
        expect(riverAt(sampler, cx, cy, z, { zoom: z - 0.5, margin: cell })).toBe(true);
      }
    }
    expect(bare).toBeGreaterThan(0);
    expect(bare).toBeLessThan(0.2 * blocked.length);
  }
});

test("nearRivers finds every point a river is drawn over, and points within the margin of one", () => {
  const random = aleaPRNG("near rivers");
  for (const [z, x, y] of [
    [2, 1, 1],
    [5, 9, 19],
    [7, 30, 75],
  ]) {
    const size = WORLD_SIZE / 2 ** z;
    const area = [x * size, y * size, (x + 1) * size, (y + 1) * size];
    const margin = 0.45 * MARK_SPACING_PX * pixelSize(z);
    const near = nearRivers(sampler, z, area, margin);
    const drawn = nearRivers(sampler, z, area, 0);
    const triangles = buildRivers(sampler, z, area);
    expect(triangles.indices.length).toBeGreaterThan(0);
    const widest = drawnHalfWidth(sampler.rivers.flow[0], z);
    let checked = 0;
    let inMargin = 0;
    for (let n = 0; n < 400; n++) {
      const v = Math.floor(random() * (triangles.positions.length / 3));
      const [vx, vy] = [triangles.positions[3 * v], triangles.positions[3 * v + 1]];
      const [px, py] = [vx + (random() - 0.5) * 4 * margin, vy + (random() - 0.5) * 4 * margin];
      if (px < area[0] || px >= area[2] || py < area[1] || py >= area[3]) continue;
      for (const zoom of [z - 0.49, z, z + 0.49]) {
        if (!covered(triangles, px, py, zoom)) continue;
        checked++;
        expect(drawn(px, py)).toBe(true);
      }
      if (near(px, py) && !drawn(px, py)) inMargin++;
      // Near a river means within the margin of a course as wide as the widest river drawn
      if (near(px, py)) {
        expect(riverAt(sampler, px, py, z, { zoom: z, margin: margin + widest })).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(inMargin).toBeGreaterThan(0);
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

test("a river that reaches the sea or a lake ends by water at each level, even far from deep water", () => {
  // Seed 39595 has a mouth whose coast is more than MAX_REACH away at deeper levels
  for (const seed of ["12345", "39595"]) {
    const watered = new WorldSampler(withWater(generateWorld(seed)));
    const { sites, to, flow, mouth } = watered.rivers;
    for (let z = 0; z <= 7; z++) {
      const near = 3 * pixelSize(z);
      const wet = (x, y) => !watered.sampleAt(x, y, z).land;
      for (let k = 0; k < flow.length && flow[k] >= riverThreshold(z); k++) {
        if (!mouth[k] || deepWater(watered, sites[2 * to[k]], sites[2 * to[k] + 1], z)) continue;
        const [ex, ey] = riverCourse(watered, k, z).slice(-2);
        const byWater =
          wet(ex, ey) ||
          Array.from({ length: 16 }, (_, a) => (a * Math.PI) / 8).some((angle) =>
            wet(ex + near * Math.cos(angle), ey + near * Math.sin(angle)),
          );
        expect(byWater, `seed ${seed}, level ${z}, edge ${k}`).toBe(true);
      }
    }
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

const id = (name) => BIOME_DEFINITIONS.findIndex((definition) => definition.name === name);

test("a floodplain is at least BANK_MIN_PX wide on screen, and grows with the river up close", () => {
  for (let z = 0; z <= 7; z++) {
    expect(bankHalfWidth(4, z)).toBeGreaterThanOrEqual(BANK_MIN_PX * pixelSize(z));
    expect(bankHalfWidth(1024, z)).toBeGreaterThanOrEqual(bankHalfWidth(64, z));
  }
  expect(bankHalfWidth(1024, 7)).toBeGreaterThan(bankHalfWidth(64, 7));
  expect(FLOODPLAIN).toBe(id("floodplain"));
});

test("dry land beside a river drawn at a level is floodplain, within its band only", () => {
  const z = 5;
  // A river drawn at this level with few others around: the bands of a crowd of channels overlap
  let found = null;
  for (let k = 0; k < rivers.flow.length && !found; k++) {
    if (rivers.flow[k] < riverThreshold(z)) break;
    const [px, py, qx, qy] = riverCourse(sampler, k, z).slice(0, 4);
    const half = bankHalfWidth(rivers.flow[k], z);
    const [mx, my] = [(px + qx) / 2, (py + qy) / 2];
    const around = [mx - 3 * half, my - 3 * half, mx + 3 * half, my + 3 * half];
    if ([...riverCourses(sampler, z, around)].length <= 3) found = { k, px, py, qx, qy, half };
  }
  expect(found).not.toBeNull();
  const { px, py, qx, qy, half } = found;
  const length = Math.hypot(qx - px, qy - py);
  const [nx, ny] = [(py - qy) / length, (qx - px) / length];
  const [mx, my] = [(px + qx) / 2, (py + qy) / 2];
  const at = (d, biome) => bankAt(sampler, mx + d * nx, my + d * ny, z, biome);
  // Well inside the band: Desert and Savana fully, Plain half as wide
  expect(at(0.4 * half, id("Desert"))).toBe(true);
  expect(at(0.4 * half, id("Savana"))).toBe(true);
  expect(at(0.4 * half, id("Plain"))).toBe(true);
  expect(at(0.8 * half, id("Plain"))).toBe(false);
  // Never over other biomes
  for (const name of ["Forest", "Jungle", "Taiga", "Tundra", "Mountain", "Swamp", "ocean"]) {
    expect(at(0.1 * half, id(name))).toBe(false);
  }
  // Far out (100 half-widths), no river course reaches, so no band does
  const far = [mx + 100 * half * nx, my + 100 * half * ny];
  expect([...riverCourses(sampler, z, [...far, ...far])]).toHaveLength(0);
  expect(bankAt(sampler, ...far, z, id("Desert"))).toBe(false);
});

test("a river too small for a level gives no floodplain there", () => {
  // A point on a small river's level-7 course, with no river drawn at level 2 anywhere near
  let point = null;
  for (let k = 0; k < rivers.flow.length && !point; k++) {
    if (rivers.flow[k] >= riverThreshold(2)) continue;
    const [x, y] = riverCourse(sampler, k, 7).slice(2, 4);
    if ([...riverCourses(sampler, 2, [x - 1000, y - 1000, x + 1000, y + 1000])].length === 0) {
      point = [x, y];
    }
  }
  expect(point).not.toBeNull();
  expect(bankAt(sampler, ...point, 7, id("Desert"))).toBe(true);
  expect(bankAt(sampler, ...point, 2, id("Desert"))).toBe(false);
});

test("without water there are no floodplains", () => {
  const dry = new WorldSampler(generateWorld("12345"));
  expect(bankAt(dry, 5000, 5000, 3, id("Desert"))).toBe(false);
});

test("riverCourses yields every course drawn at a level that passes through an area", () => {
  const random = aleaPRNG("river courses");
  for (const z of [0, 3, 7]) {
    const count = rivers.flow.filter((flow) => flow >= riverThreshold(z)).length;
    for (let round = 0; round < 20; round++) {
      const k = Math.floor(random() * count);
      const course = riverCourse(sampler, k, z);
      const i = 2 * Math.floor((random() * course.length) / 2);
      const [x, y] = [course[i], course[i + 1]];
      const found = [...riverCourses(sampler, z, [x, y, x, y])];
      expect(found.some(({ course: other }) => other === course)).toBe(true);
      expect(found.find(({ course: other }) => other === course).half).toBe(
        maxHalfWidth(rivers.flow[k], z),
      );
    }
    // Only rivers drawn at the level
    const all = [...riverCourses(sampler, z, [0, 0, WORLD_SIZE, WORLD_SIZE])];
    expect(all.length).toBe(count);
  }
});
