import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { SEA_ALTITUDE, WARP_AMPLITUDE, WorldSampler } from "../../src/generation/fields.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";

const base = generateWorld("12345");

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
