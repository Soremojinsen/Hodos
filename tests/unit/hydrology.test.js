import { expect, test } from "vitest";
import { WorldSampler } from "../../src/generation/fields.js";
import {
  LAKE_DEPTH,
  MIN_RIVER_FLOW,
  computeDrainage,
  generateWater,
  withWater,
} from "../../src/generation/hydrology.js";
import { generateWorld } from "../../src/generation/world.js";

const base = generateWorld("12345");
const drainage = computeDrainage(new WorldSampler(base));
const water = generateWater(new WorldSampler(base));

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
