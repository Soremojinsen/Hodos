import { expect, test } from "vitest";
import {
  BIOMES,
  BIOMESPOOL,
  Biome,
  OceanBiome,
  createBiomes,
  randomBiomeFromPool,
} from "../../src/generation/biomes.js";
import { MapGenerator } from "../../src/generation/generator.js";

test("createBiomes registers every biome", () => {
  const biomes = createBiomes(Math.random);
  expect(BIOMES).toBe(biomes);
  for (const pool in BIOMESPOOL) {
    for (const name of BIOMESPOOL[pool]) {
      expect(biomes[name]).toBeInstanceOf(Biome);
    }
  }
  expect(biomes.ocean.isMaritime()).toBe(true);
});

test("createBiomes assigns ids starting at 0 every time", () => {
  createBiomes(Math.random);
  const ids = Object.values(createBiomes(Math.random)).map((b) => b.id);
  expect(Math.min(...ids)).toBe(0);
  expect(new Set(ids).size).toBe(ids.length);
});

test("MapGenerator registers the biomes itself", () => {
  const before = createBiomes(Math.random);
  new MapGenerator("42");
  expect(BIOMES).not.toBe(before);
  expect(BIOMES.ocean).toBeInstanceOf(OceanBiome);
});

test("randomBiomeFromPool can pick every biome of a pool", () => {
  createBiomes(Math.random);
  for (const pool in BIOMESPOOL) {
    const [first, second] = BIOMESPOOL[pool];
    expect(randomBiomeFromPool(pool, () => 0)).toBe(BIOMES[first]);
    expect(randomBiomeFromPool(pool, () => 0.99)).toBe(BIOMES[second]);
  }
});
