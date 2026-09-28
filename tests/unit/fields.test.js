import { Delaunay } from "d3-delaunay";
import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import {
  LAKE_WARP_AMPLITUDE,
  SEA_ALTITUDE,
  WARP_AMPLITUDE,
  WorldSampler,
} from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";

const base = generateWorld("12345");
const LAKE = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "lake");

const randomPoints = (n) => {
  const random = aleaPRNG("points");
  return Array.from({ length: n }, () => [random() * WORLD_SIZE, random() * WORLD_SIZE]);
};

const nearestSite = (x, y) => {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < base.sites.length / 2; i++) {
    const distance = (base.sites[2 * i] - x) ** 2 + (base.sites[2 * i + 1] - y) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
  }
  return best;
};

test("samplers of the same world agree, whatever other samplers do in between", () => {
  const a = new WorldSampler(base);
  const other = new WorldSampler(generateWorld("999"));
  const b = new WorldSampler(base);
  for (const [x, y] of randomPoints(200)) {
    const expected = a.sampleAt(x, y, 3);
    other.sampleAt(x, y, 3);
    expect(b.sampleAt(x, y, 3)).toEqual(expected);
  }
});

test("a sample reads the coarse cell under the warped point", () => {
  const sampler = new WorldSampler(base);
  for (const [x, y] of randomPoints(50)) {
    const cell = nearestSite(...sampler.warp(x, y, 2));
    const sample = sampler.sampleAt(x, y, 2);
    expect(sample.biome).toBe(base.biomes[cell]);
    expect(sample.land).toBe(!BIOME_DEFINITIONS[base.biomes[cell]].maritime);
  }
});

test("the sea is flat at sea level and has no continent; land is between 0 and 1", () => {
  const sampler = new WorldSampler(base);
  let land = 0;
  for (const [x, y] of randomPoints(1000)) {
    const sample = sampler.sampleAt(x, y, 4);
    if (sample.land) {
      land++;
      expect(sample.altitude).toBeGreaterThanOrEqual(0);
      expect(sample.altitude).toBeLessThanOrEqual(1);
    } else {
      expect(sample.altitude).toBe(SEA_ALTITUDE);
      expect(sample.continent).toBe(0);
    }
  }
  expect(land).toBeGreaterThan(50);
  expect(land).toBeLessThan(950);
});

test("the warp moves a point by at most twice its amplitude on each axis", () => {
  const sampler = new WorldSampler(base);
  for (const [x, y] of randomPoints(500)) {
    const [wx, wy] = sampler.warp(x, y, 7);
    expect(Math.abs(wx - x)).toBeLessThanOrEqual(2 * WARP_AMPLITUDE);
    expect(Math.abs(wy - y)).toBeLessThanOrEqual(2 * WARP_AMPLITUDE);
  }
});

// Measured with seed 12345: 2.4 % at 1→2, then under 2 %
test.each([1, 2, 3, 4, 5, 6])("level %i and the next agree almost everywhere", (level) => {
  const sampler = new WorldSampler(base);
  const points = randomPoints(2000);
  const different = points.filter(
    ([x, y]) => sampler.sampleAt(x, y, level).biome !== sampler.sampleAt(x, y, level + 1).biome,
  );
  expect(different.length).toBeLessThan(points.length * 0.05);
});

test("with water, lakes are drawn where the lake warp lands on a lake point", () => {
  const watered = withWater(base);
  const sampler = new WorldSampler(watered);
  const dry = new WorldSampler(base);
  const lakes = new Delaunay(watered.waterSites);
  let lakeCount = 0;
  for (const [x, y] of randomPoints(3000)) {
    const sample = sampler.sampleAt(x, y, 3);
    const inLake =
      dry.sampleAt(x, y, 3).land && watered.lakes[lakes.find(...sampler.lakeWarp(x, y, 3))];
    if (inLake) {
      lakeCount++;
      expect(sample).toEqual({ biome: LAKE, continent: 0, land: false, altitude: SEA_ALTITUDE });
    } else {
      expect(sample).toEqual(dry.sampleAt(x, y, 3));
    }
  }
  expect(lakeCount).toBeGreaterThan(0);
});

test("the lake warp moves a point by at most twice its amplitude on each axis", () => {
  const sampler = new WorldSampler(base);
  for (const [x, y] of randomPoints(200)) {
    const [wx, wy] = sampler.lakeWarp(x, y, 7);
    expect(Math.abs(wx - x)).toBeLessThanOrEqual(2 * LAKE_WARP_AMPLITUDE);
    expect(Math.abs(wy - y)).toBeLessThanOrEqual(2 * LAKE_WARP_AMPLITUDE);
  }
});

test("slopeAt is the altitude's change per world unit, the same for every sampler", () => {
  const sampler = new WorldSampler(base);
  const other = new WorldSampler(base);
  let steep = 0;
  for (const [x, y] of randomPoints(300)) {
    for (const level of [0, 4, 7]) {
      const altitude = sampler.altitudeAt(x, y, level);
      // The altitude is clamped to [0, 1]: its slope has a kink there
      if (altitude < 0.01 || altitude > 0.99) continue;
      const [dx, dy] = sampler.slopeAt(x, y, level);
      const h = 0.5;
      const coarseX =
        (sampler.altitudeAt(x + h, y, level) - sampler.altitudeAt(x - h, y, level)) / (2 * h);
      const coarseY =
        (sampler.altitudeAt(x, y + h, level) - sampler.altitudeAt(x, y - h, level)) / (2 * h);
      expect(dx).toBeCloseTo(coarseX, 3);
      expect(dy).toBeCloseTo(coarseY, 3);
      expect(other.slopeAt(x, y, level)).toEqual([dx, dy]);
      if (Math.hypot(dx, dy) > 1e-3) steep++;
    }
  }
  expect(steep).toBeGreaterThan(100);
});
