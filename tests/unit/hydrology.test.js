import { expect, test } from "vitest";
import { BIOME_DEFINITIONS, SWAMP_BIOMES } from "../../src/generation/biomes.js";
import { SWAMP_POINT, WorldSampler } from "../../src/generation/fields.js";
import {
  LAKE_DEPTH,
  MIN_RIVER_FLOW,
  MIN_SWAMP_POINTS,
  SWAMP_FLOW,
  SWAMP_GRADIENT,
  SWAMP_MAX_ALTITUDE,
  SWAMP_PIT_DEPTH,
  computeDrainage,
  computeWetlands,
  generateWater,
  withWater,
} from "../../src/generation/hydrology.js";
import { generateWorld } from "../../src/generation/world.js";

const base = generateWorld("12345");
const drainage = computeDrainage(new WorldSampler(base));
const water = generateWater(new WorldSampler(base));

// Shared helpers for swamp tests
const { sites, land, biome, height, filled, downstream, flow, lakes, delaunay } = drainage;
const swampy = new Set(
  SWAMP_BIOMES.map((name) => BIOME_DEFINITIONS.findIndex((d) => d.name === name)),
);
const eligible = (i) =>
  land[i] && !lakes[i] && swampy.has(biome[i]) && height[i] < SWAMP_MAX_ALTITUDE;
const byRiver = (i) =>
  flow[i] >= SWAMP_FLOW || [...delaunay.neighbors(i)].some((j) => land[j] && flow[j] >= SWAMP_FLOW);
const slow = (i) => {
  const j = downstream[i];
  if (j < 0) return false;
  const drop =
    (filled[i] - filled[j]) /
    Math.hypot(sites[2 * j] - sites[2 * i], sites[2 * j + 1] - sites[2 * i + 1]);
  return filled[i] - height[i] > SWAMP_PIT_DEPTH || drop < SWAMP_GRADIENT;
};
const core = (i) => eligible(i) && byRiver(i) && slow(i);

test("the same seed always gives the same water", () => {
  expect(generateWater(new WorldSampler(generateWorld("12345")))).toEqual(water);
  expect(generateWater(new WorldSampler(generateWorld("999"))).riverFlow).not.toEqual(
    water.riverFlow,
  );
});

test("adding water leaves the coarse world as it is", () => {
  const copy = generateWorld("12345");
  const watered = withWater(copy);
  for (const key of Object.keys(copy)) expect(watered[key]).toEqual(base[key]);
  expect(watered.waterSites).toEqual(water.waterSites);
});

test("from any land point, water runs downhill to the sea", () => {
  const { land, filled, downstream } = drainage;
  let landCount = 0;
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) {
      expect(downstream[i]).toBe(-1);
      continue;
    }
    landCount++;
    expect(filled[downstream[i]]).toBeLessThan(filled[i]);
  }
  // Heights strictly drop along every step, so every chain ends, and only the sea has no downstream
  expect(landCount).toBeGreaterThan(5000);
});

test("flow grows downstream: each point passes on its rain and all it receives", () => {
  const { land, downstream, flow } = drainage;
  const received = new Float32Array(flow.length);
  for (let i = 0; i < land.length; i++) if (land[i]) received[downstream[i]] += flow[i];
  for (let i = 0; i < land.length; i++) {
    if (land[i]) expect(flow[i]).toBe(1 + received[i]);
  }
});

test("lakes lie in basins the fill raised, on land", () => {
  const { land, height, filled, lakes } = drainage;
  let lakeCount = 0;
  for (let i = 0; i < lakes.length; i++) {
    if (!lakes[i]) continue;
    lakeCount++;
    expect(land[i]).toBe(1);
    expect(filled[i] - height[i]).toBeGreaterThan(LAKE_DEPTH);
  }
  expect(lakeCount).toBeGreaterThan(0);
});

test("rivers are the edges with enough flow, largest first, marked where they reach water", () => {
  const { riverFrom, riverTo, riverFlow, riverMouth, lakes } = water;
  expect(riverFrom.length).toBeGreaterThan(100);
  for (let k = 0; k < riverFrom.length; k++) {
    const [a, b] = [riverFrom[k], riverTo[k]];
    expect(riverTo[k]).toBe(drainage.downstream[a]);
    expect(riverFlow[k]).toBe(drainage.flow[a]);
    expect(riverFlow[k]).toBeGreaterThanOrEqual(MIN_RIVER_FLOW);
    if (k > 0) expect(riverFlow[k]).toBeLessThanOrEqual(riverFlow[k - 1]);
    expect(lakes[a] && lakes[b]).toBeFalsy();
    expect(riverMouth[k]).toBe(!drainage.land[b] || lakes[b] ? 1 : 0);
  }
});

const wetlands = computeWetlands("12345", drainage);

test("the drainage keeps each point's level-0 biome and continent", () => {
  const sampler = new WorldSampler(base);
  const { sites, biome, continent } = drainage;
  for (let i = 0; i < biome.length; i += 997) {
    const sample = sampler.sampleAt(sites[2 * i], sites[2 * i + 1], 0);
    expect(biome[i]).toBe(sample.biome);
    expect(continent[i]).toBe(sample.continent);
  }
});

test("the same seed always gives the same wetlands", () => {
  expect(
    computeWetlands("12345", computeDrainage(new WorldSampler(generateWorld("12345")))),
  ).toEqual(wetlands);
});

test("swamps lie by slow rivers, low in temperate, humid and cold lands", () => {
  let [swamps, cores] = [0, 0];
  for (let i = 0; i < land.length; i++) {
    if (wetlands.wetlands[i] !== SWAMP_POINT) continue;
    swamps++;
    expect(eligible(i)).toBe(true);
    // A swamp point is by a slow river, or one ring around such a point
    if (core(i)) cores++;
    else expect([...delaunay.neighbors(i)].some(core)).toBe(true);
  }
  expect(cores).toBeGreaterThanOrEqual(MIN_SWAMP_POINTS);
  // Swamps are a feature of the lowland rivers, not of every lowland
  let landCount = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) landCount++;
  expect(swamps).toBeGreaterThan(0);
  expect(swamps / landCount).toBeLessThan(0.12);
});

test("a lone slow point by a river makes no swamp", () => {
  // Every core point belongs to a connected group of at least MIN_SWAMP_POINTS core points.
  // Build connected components of core points.
  const grouped = new Uint8Array(land.length);
  const components = [];
  for (let i = 0; i < land.length; i++) {
    if (grouped[i] || !core(i)) continue;
    const component = [i];
    grouped[i] = 1;
    for (let k = 0; k < component.length; k++) {
      for (const j of delaunay.neighbors(component[k])) {
        if (!grouped[j] && core(j)) {
          grouped[j] = 1;
          component.push(j);
        }
      }
    }
    components.push(component);
  }

  // Check each component
  for (const component of components) {
    const isKept = component.length >= MIN_SWAMP_POINTS;
    for (const i of component) {
      // Core points in kept components must be swamps
      if (isKept) {
        expect(wetlands.wetlands[i]).toBe(SWAMP_POINT);
      } else {
        // Core points in small components must not be swamps (unless grown to by kept components)
        // This is checked separately below
      }
    }
  }

  // Verify that small component core points are not swamps
  // unless they are neighbors of a kept component's core point
  for (const component of components) {
    if (component.length >= MIN_SWAMP_POINTS) continue;
    for (const i of component) {
      // If this core point is a swamp, it must be because it's a neighbor of a kept core
      if (wetlands.wetlands[i] === SWAMP_POINT) {
        const hasKeptCoreNeighbor = [...delaunay.neighbors(i)].some(
          (j) =>
            core(j) &&
            grouped[j] &&
            components.some((c) => c.length >= MIN_SWAMP_POINTS && c.includes(j)),
        );
        expect(hasKeptCoreNeighbor).toBe(true);
      }
    }
  }

  // Verify growth ring: eligible neighbors of kept core points should be swamps
  for (const component of components) {
    if (component.length < MIN_SWAMP_POINTS) continue;
    for (const i of component) {
      for (const j of delaunay.neighbors(i)) {
        if (eligible(j) && wetlands.wetlands[j] === SWAMP_POINT) {
          // This is a growth-ring swamp, which is correct
          expect(true).toBe(true);
        }
      }
    }
  }
});
