import { expect, test } from "vitest";
import {
  MAX_TILT,
  MIN_LAKE_NAMED,
  MIN_RANGE_POINTS,
  MIN_RIVER_NAMED,
  MIN_RIVER_POINTS,
  RANGE_ALTITUDE,
  components,
  continentFeatures,
  innerPoint,
  islandFeatures,
  lakeFeatures,
  mainAxis,
  rangeFeatures,
  riverFeatures,
  worldGeometry,
} from "../../src/generation/features.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { generateWorld } from "../../src/generation/world.js";

const base = withWater(generateWorld("12345"));
const world = worldGeometry(base);
const sampler = new WorldSampler(base);

// A side × side grid of points one unit apart, with 4-neighbours
const grid = (side) => {
  const sites = new Float64Array(2 * side * side);
  for (let i = 0; i < side * side; i++)
    [sites[2 * i], sites[2 * i + 1]] = [i % side, Math.floor(i / side)];
  const neighbors = (i) => {
    const [c, r] = [i % side, Math.floor(i / side)];
    return [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1],
    ]
      .filter(([cc, rr]) => cc >= 0 && rr >= 0 && cc < side && rr < side)
      .map(([cc, rr]) => rr * side + cc);
  };
  return { sites, neighbors };
};

test("components are the connected groups, from their lowest index", () => {
  const { neighbors } = grid(5);
  const groups = components(25, (i) => i % 5 !== 2, neighbors);
  expect(groups.map((g) => g[0])).toEqual([0, 3]);
  expect(groups.map((g) => g.length)).toEqual([10, 10]);
});

test("the inner point of a block is its middle", () => {
  const { sites, neighbors } = grid(7);
  // The block 1..5 × 1..5 inside a 7 × 7 grid: its middle is (3, 3)
  const block = [];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) block.push(r * 7 + c);
  expect(innerPoint(block, neighbors, sites)).toBe(3 * 7 + 3);
});

test("the main axis follows a line of points, tilted at most MAX_TILT", () => {
  const line = (angle) => {
    const sites = new Float64Array(20);
    for (let i = 0; i < 10; i++)
      [sites[2 * i], sites[2 * i + 1]] = [i * Math.cos(angle), i * Math.sin(angle)];
    return mainAxis([...Array(10).keys()], sites);
  };
  expect(line(0).angle).toBeCloseTo(0);
  expect(line(0).span).toBeCloseTo(9);
  expect(line(0.2).angle).toBeCloseTo(0.2);
  expect(line(1.2).angle).toBeCloseTo(MAX_TILT);
  expect(line(-1.2).angle).toBeCloseTo(-MAX_TILT);
  // Along the clamped axis, a steep line looks shorter
  expect(line(1.2).span).toBeCloseTo(9 * Math.cos(1.2 - MAX_TILT));
});

test("each continent is one feature, anchored on one of its cells", () => {
  const continents = continentFeatures(base, world);
  const numbers = new Set([...base.continents].filter((n) => n > 0));
  expect(continents.map((f) => f.id)).toEqual(
    [...numbers].sort((a, b) => a - b).map((n) => `continent:${n}`),
  );
  for (const feature of continents) {
    const number = Number(feature.id.split(":")[1]);
    for (const i of feature.members) expect(base.continents[i]).toBe(number);
    const [x, y] = feature.anchors[0];
    expect(
      feature.members.some((i) => base.sites[2 * i] === x && base.sites[2 * i + 1] === y),
    ).toBe(true);
    expect(feature.span).toBeGreaterThan(world.cellSize);
  }
});

test("islands are groups of land cells of no continent", () => {
  const islands = islandFeatures(base, world);
  expect(islands.length).toBeGreaterThan(0);
  expect(new Set(islands.map((f) => f.id)).size).toBe(islands.length);
  for (const feature of islands) {
    for (const i of feature.members) {
      expect(world.land[i]).toBe(1);
      expect(base.continents[i]).toBe(0);
    }
  }
});

test("ranges are large groups of high water points, named after their highest", () => {
  const ranges = rangeFeatures(base, world);
  expect(ranges.length).toBeGreaterThanOrEqual(5);
  expect(ranges.length).toBeLessThanOrEqual(30);
  for (const feature of ranges) {
    expect(feature.members.length).toBeGreaterThanOrEqual(MIN_RANGE_POINTS);
    let highest = feature.members[0];
    for (const i of feature.members) {
      expect(base.waterLand[i]).toBe(1);
      expect(base.lakes[i]).toBe(0);
      expect(base.waterHeight[i]).toBeGreaterThanOrEqual(RANGE_ALTITUDE);
      if (base.waterHeight[i] > base.waterHeight[highest]) highest = i;
    }
    const [x, y] = [base.waterSites[2 * highest], base.waterSites[2 * highest + 1]];
    expect(feature.id).toBe(`range:${Math.round(x)},${Math.round(y)}`);
    expect(feature.terrain).toBe("high");
  }
});

test("lakes are named lake groups, after their outlet", () => {
  const lakes = lakeFeatures(base, world);
  expect(lakes.length).toBeGreaterThan(0);
  for (const feature of lakes) {
    expect(feature.members.length).toBeGreaterThanOrEqual(MIN_LAKE_NAMED);
    for (const i of feature.members) expect(base.lakes[i]).toBe(1);
    const outlet = feature.members.find(
      (i) =>
        feature.id ===
        `lake:${Math.round(base.waterSites[2 * i])},${Math.round(base.waterSites[2 * i + 1])}`,
    );
    expect(outlet).toBeDefined();
    const leaves = [...base.riverFrom.keys()].some(
      (k) => base.riverFrom[k] === outlet && !base.lakes[base.riverTo[k]],
    );
    const anyLeaves = [...base.riverFrom.keys()].some(
      (k) => feature.members.includes(base.riverFrom[k]) && !base.lakes[base.riverTo[k]],
    );
    expect(leaves || !anyLeaves).toBe(true);
    expect(feature.angle).toBe(0);
  }
});

test("rivers are chains of edges from a mouth or a confluence upstream", () => {
  const rivers = riverFeatures(base, sampler);
  expect(rivers.length).toBeGreaterThan(5);
  expect(new Set(rivers.map((f) => f.id)).size).toBe(rivers.length);
  const owner = new Map();
  for (const [index, river] of rivers.entries()) {
    expect(river.flow).toBeGreaterThanOrEqual(MIN_RIVER_NAMED);
    expect(river.path.length / 2).toBeGreaterThanOrEqual(MIN_RIVER_POINTS);
    expect(river.path.length / 2).toBe(river.members.length + 1);
    for (let k = 1; k < river.members.length; k++) {
      expect(base.riverTo[river.members[k]]).toBe(base.riverFrom[river.members[k - 1]]);
    }
    for (const edge of river.members) {
      expect(owner.has(edge)).toBe(false);
      owner.set(edge, index);
    }
    expect(["fleuve", "riviere"]).toContain(river.form);
  }
  // The largest mouth starts the first river
  let largest = -1;
  for (let k = 0; k < base.riverMouth.length; k++)
    if (base.riverMouth[k] && largest < 0) largest = k;
  expect(rivers[0].members[0]).toBe(largest);
});
