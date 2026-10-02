import { expect, test } from "vitest";
import { MARK_SPACING_PX } from "../../src/constants.js";
import { BIOME_DEFINITIONS, MARKS } from "../../src/generation/biomes.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import {
  bankAt,
  pixelSize,
  riverAt,
  riverCourse,
  riverThreshold,
} from "../../src/generation/rivers.js";
import {
  SPILL,
  TREE_REACH,
  chamferDistances,
  treeGrid,
  treesOf,
} from "../../src/generation/trees.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";

const sampler = new WorldSampler(withWater(generateWorld("12345")));
const Z = 5;
const CELL = MARK_SPACING_PX * pixelSize(Z);
const id = (name) => BIOME_DEFINITIONS.findIndex((definition) => definition.name === name);
const area = ([x, y], half) => [x - half, y - half, x + half, y + half];

// The biomes whose mark is a kind (its index in MARKS + 1)
const kindBiomes = (kind) =>
  BIOME_DEFINITIONS.flatMap((definition, biome) =>
    definition.mark === MARKS[kind - 1] ? [biome] : [],
  );
const HOSTS = { Plain: [1, 2, 3], Savana: [1, 2], Tundra: [3] };

/**
 * A level-Z point whose square of `half` world units around is all one biome, between the beach
 * and the tree line.
 */
const uniformPoint = (name, half, seed) => {
  const biome = id(name);
  const random = aleaPRNG(seed);
  for (let n = 0; n < 300_000; n++) {
    const [x, y] = [half + random() * (10000 - 2 * half), half + random() * (10000 - 2 * half)];
    let uniform = true;
    for (let dx = -half; dx <= half && uniform; dx += half / 2) {
      for (let dy = -half; dy <= half && uniform; dy += half / 2) {
        const sample = sampler.sampleAt(x + dx, y + dy, Z);
        if (sample.biome !== biome || sample.altitude < 0.2 || sample.altitude > 0.5) {
          uniform = false;
        }
      }
    }
    if (uniform) return [x, y];
  }
  throw new Error(`No uniform ${name} area`);
};

/**
 * Points on the border between a forest biome and an open one, the forest to the west.
 */
const borders = (forestName, openName, count, seed) => {
  const [forest, open] = [id(forestName), id(openName)];
  const random = aleaPRNG(seed);
  const found = [];
  for (let n = 0; n < 1_000_000 && found.length < count; n++) {
    const [x, y] = [random() * 10000, random() * 10000];
    const west = sampler.sampleAt(x, y, Z);
    const east = sampler.sampleAt(x + 2 * CELL, y, Z);
    if (
      west.biome === forest &&
      east.biome === open &&
      west.altitude > 0.15 &&
      west.altitude < 0.5
    ) {
      found.push([x + CELL, y]);
    }
  }
  expect(found.length).toBe(count);
  return found;
};

// The texel of a square of the world in a grid, or null outside it
const texelAt = ({ origin, size, texels }, i, j) => {
  const [c, r] = [i - origin[0], j - origin[1]];
  if (c < 0 || r < 0 || c >= size[0] || r >= size[1]) return null;
  const k = 4 * (r * size[0] + c);
  return [...texels.subarray(k, k + 4)];
};

test("chamfer distances step 1 straight and √2 diagonally, Infinity with no target", () => {
  const target = new Uint8Array(25);
  target[12] = 1;
  const d = chamferDistances(target, 5, 5);
  expect(d[12]).toBe(0);
  expect(d[13]).toBe(1);
  expect(d[18]).toBeCloseTo(Math.SQRT2, 5);
  expect(d[14]).toBe(2);
  expect(d[0]).toBeCloseTo(2 * Math.SQRT2, 5);
  expect(chamferDistances(new Uint8Array(4), 2, 2).every((v) => v === Infinity)).toBe(true);
});

test("a square gets the same tree whichever area asks for it", () => {
  const center = uniformPoint("Forest", 6 * CELL, "same tree");
  const a = treeGrid(sampler, Z, CELL, area(center, 8 * CELL));
  const b = treeGrid(
    sampler,
    Z,
    CELL,
    area([center[0] + 5 * CELL, center[1] + 3 * CELL], 8 * CELL),
  );
  let shared = 0;
  for (let j = a.origin[1]; j < a.origin[1] + a.size[1]; j++) {
    for (let i = a.origin[0]; i < a.origin[0] + a.size[0]; i++) {
      const other = texelAt(b, i, j);
      if (!other) continue;
      expect(texelAt(a, i, j)).toEqual(other);
      if (other[0]) shared++;
    }
  }
  expect(shared).toBeGreaterThan(50);
});

test("areas past the world's edge give valid trees", () => {
  for (const box of [
    [-3 * CELL, 4000, 3 * CELL, 4100],
    [9990, 9990, 10000 + 3 * CELL, 10000 + 3 * CELL],
  ]) {
    const grid = treeGrid(sampler, Z, CELL, box);
    for (let k = 0; k < grid.texels.length; k += 4) expect(grid.texels[k]).toBeLessThanOrEqual(4);
  }
  const whole = treeGrid(sampler, 0, MARK_SPACING_PX * pixelSize(0), [-80, -80, 10080, 10080]);
  expect(whole.size[0]).toBe(whole.size[1]);
});

test("trees in a forest are not on a grid: their gaps vary widely", () => {
  const center = uniformPoint("Forest", 6 * CELL, "spacing");
  const trees = treesOf(treeGrid(sampler, Z, CELL, area(center, 8 * CELL)), CELL);
  const inner = trees.filter(
    (t) => Math.abs(t.x - center[0]) < 5 * CELL && Math.abs(t.y - center[1]) < 5 * CELL,
  );
  expect(inner.length).toBeGreaterThan(40);
  const gaps = inner.map(
    (t) =>
      Math.min(...trees.filter((u) => u !== t).map((u) => Math.hypot(u.x - t.x, u.y - t.y))) / CELL,
  );
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  // A jittered grid like the old one gives about 0.15
  expect(sd / mean).toBeGreaterThan(0.25);
  expect(Math.min(...gaps)).toBeLessThan(0.6);
});

test("forests have clumps and clearings: patches differ in how many trees they hold", () => {
  const shares = [];
  for (let n = 0; n < 12; n++) {
    const center = uniformPoint("Forest", 5 * CELL, `clump ${n}`);
    const trees = treesOf(treeGrid(sampler, Z, CELL, area(center, 4 * CELL)), CELL).filter(
      (t) => Math.abs(t.x - center[0]) < 4 * CELL && Math.abs(t.y - center[1]) < 4 * CELL,
    );
    shares.push(trees.length / 64);
  }
  expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.25);
});

test("trees thin out towards a forest's border, spill a little past it, and no further", () => {
  const forest = id("Forest");
  const plain = id("Plain");
  // Squares by their distance (in squares, centre to centre) to the border, inside and outside
  const inside = { near: [0, 0], far: [0, 0] };
  const outside = { near: [0, 0], far: [0, 0] };
  for (const point of borders("Forest", "Plain", 30, "borders")) {
    const grid = treeGrid(sampler, Z, CELL, area(point, 8 * CELL));
    const [i0, j0] = [Math.floor(point[0] / CELL) - 6, Math.floor(point[1] / CELL) - 6];
    // The biome at the centre of each square around, 6 squares further out than those counted
    const biomeAt = new Map();
    for (let j = j0 - 6; j <= j0 + 18; j++) {
      for (let i = i0 - 6; i <= i0 + 18; i++) {
        biomeAt.set(`${i},${j}`, sampler.sampleAt((i + 0.5) * CELL, (j + 0.5) * CELL, Z).biome);
      }
    }
    const distance = (i, j, match) => {
      let best = Infinity;
      for (let dj = -6; dj <= 6; dj++) {
        for (let di = -6; di <= 6; di++) {
          if (match(biomeAt.get(`${i + di},${j + dj}`))) best = Math.min(best, Math.hypot(di, dj));
        }
      }
      return best;
    };
    for (let j = j0; j <= j0 + 12; j++) {
      for (let i = i0; i <= i0 + 12; i++) {
        const tree = texelAt(grid, i, j)[0] !== 0;
        const biome = biomeAt.get(`${i},${j}`);
        if (biome === forest) {
          const d = distance(i, j, (b) => b !== forest);
          const bucket = d <= 1.5 ? inside.near : d >= 3 ? inside.far : null;
          if (bucket) [bucket[0], bucket[1]] = [bucket[0] + tree, bucket[1] + 1];
        } else if (biome === plain) {
          const d = distance(i, j, (b) => b === forest);
          const texel = texelAt(grid, i, j);
          const [tx, ty] = [
            (i + (texel[2] + 0.5) / 256) * CELL,
            (j + (texel[3] + 0.5) / 256) * CELL,
          ];
          if (d > SPILL + 1e-9 && texel[0] === 1 && sampler.sampleAt(tx, ty, Z).biome === plain) {
            // A broadleaf tree on a plain this far from any forest can only line a floodplain
            expect(bankAt(sampler, tx, ty, Z, plain)).toBe(true);
          }
          const bucket = d <= 1.5 ? outside.near : d > 2.5 && d <= SPILL ? outside.far : null;
          if (bucket) [bucket[0], bucket[1]] = [bucket[0] + tree, bucket[1] + 1];
        }
      }
    }
  }
  const share = ([trees, squares]) => trees / squares;
  for (const bucket of [inside.near, inside.far, outside.near, outside.far]) {
    expect(bucket[1]).toBeGreaterThan(100);
  }
  expect(share(inside.near)).toBeLessThan(share(inside.far));
  expect(share(outside.near)).toBeGreaterThan(share(outside.far));
  expect(share(outside.near)).toBeLessThan(share(inside.near));
  expect(share(outside.near)).toBeGreaterThan(0.1);
});

test("trees stand on land between beach and tree line, spill only onto open land, and keep their forest's kind", () => {
  const random = aleaPRNG("hosts");
  const centers = [
    ...borders("Forest", "Plain", 5, "hosts forest"),
    ...borders("Taiga", "Tundra", 5, "hosts taiga"),
    ...borders("Jungle", "Savana", 5, "hosts jungle"),
  ];
  while (centers.length < 60) centers.push([random() * 10000, random() * 10000]);
  let spilled = 0;
  for (const center of centers) {
    for (const t of treesOf(treeGrid(sampler, Z, CELL, area(center, 6 * CELL)), CELL)) {
      const sample = sampler.sampleAt(t.x, t.y, Z);
      expect(sample.land).toBe(true);
      expect(sample.altitude).toBeGreaterThanOrEqual(0.1);
      expect(sample.altitude).toBeLessThan(0.65);
      const definition = BIOME_DEFINITIONS[sample.biome];
      if (definition.mark) {
        expect(t.kind).toBe(MARKS.indexOf(definition.mark) + 1);
      } else if (bankAt(sampler, t.x, t.y, Z, sample.biome)) {
        expect(t.kind).toBe(1);
      } else {
        spilled++;
        expect(HOSTS[definition.name]).toContain(t.kind);
        // Its forest is within SPILL squares (and a little more: the tree is anywhere in its square)
        const [i, j] = [Math.floor(t.x / CELL), Math.floor(t.y / CELL)];
        let near = false;
        for (let dj = -SPILL; dj <= SPILL && !near; dj++) {
          for (let di = -SPILL; di <= SPILL && !near; di++) {
            const b = sampler.sampleAt((i + di + 0.5) * CELL, (j + dj + 0.5) * CELL, Z).biome;
            if (kindBiomes(t.kind).includes(b)) near = true;
          }
        }
        expect(near).toBe(true);
      }
    }
  }
  expect(spilled).toBeGreaterThan(20);
});

test("floodplains are lined with round crowns", () => {
  const desert = id("Desert");
  const random = aleaPRNG("floodplains");
  let lined = 0;
  let found = 0;
  for (let n = 0; n < 400_000 && found < 8; n++) {
    const [x, y] = [random() * 10000, random() * 10000];
    if (sampler.sampleAt(x, y, Z).biome !== desert || !bankAt(sampler, x, y, Z, desert)) continue;
    found++;
    for (const t of treesOf(treeGrid(sampler, Z, CELL, area([x, y], 4 * CELL)), CELL)) {
      if (bankAt(sampler, t.x, t.y, Z, sampler.sampleAt(t.x, t.y, Z).biome)) {
        expect(t.kind).toBe(1);
        lined++;
      }
    }
  }
  expect(found).toBe(8);
  expect(lined).toBeGreaterThan(3);
});

test("no river comes within a tree's reach, at any zoom its level is drawn at", () => {
  const centers = [];
  const { flow } = sampler.rivers;
  for (let k = 0; k < flow.length && flow[k] >= riverThreshold(Z) && centers.length < 15; k++) {
    const course = riverCourse(sampler, k, Z);
    for (let i = 0; i < course.length && centers.length < 15; i += 40) {
      centers.push([course[i], course[i + 1]]);
    }
  }
  let trees = 0;
  for (const center of centers) {
    for (const t of treesOf(treeGrid(sampler, Z, CELL, area(center, 6 * CELL)), CELL)) {
      trees++;
      for (const zoom of [Z - 0.5, Z, Z + 0.5]) {
        expect(riverAt(sampler, t.x, t.y, Z, { zoom, margin: TREE_REACH * CELL })).toBe(false);
      }
    }
  }
  expect(trees).toBeGreaterThan(30);
});
