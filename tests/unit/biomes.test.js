import { expect, test } from "vitest";
import {
  BIOMES,
  BIOMESPOOL,
  BIOME_DEFINITIONS,
  Biome,
  createBiomes,
  randomBiomeFromPool,
} from "../../src/generation/biomes.js";
import { MapGenerator } from "../../src/generation/world.js";

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
  expect(BIOMES.ocean.name).toBe("ocean");
});

test("randomBiomeFromPool can pick every biome of a pool", () => {
  createBiomes(Math.random);
  for (const pool in BIOMESPOOL) {
    const [first, second] = BIOMESPOOL[pool];
    expect(randomBiomeFromPool(pool, () => 0)).toBe(BIOMES[first]);
    expect(randomBiomeFromPool(pool, () => 0.99)).toBe(BIOMES[second]);
  }
});

test("every pool biome is defined with its pool, colors and latitude", () => {
  const biomes = createBiomes(Math.random);
  for (const [pool, names] of Object.entries(BIOMESPOOL)) {
    for (const name of names) {
      const biome = biomes[name];
      expect(biome.name).toBe(name);
      expect(biome.biomePool).toBe(pool);
      expect(biome.latitudeAverage).toBeTypeOf("number");
      expect(biome.latitudeSigma).toBeGreaterThan(0);
    }
  }
  for (const definition of BIOME_DEFINITIONS) {
    for (const color of [definition.low, definition.high, definition.debug]) {
      expect(color).toHaveLength(3);
    }
  }
});

test("each biome's debug color is the one debug mode always used", () => {
  const biomes = createBiomes(Math.random);
  const debug = (name) => biomes[name].debugColor.components;
  expect(debug("ocean")).toEqual([0, 0, 1]);
  expect(debug("continent")).toEqual([0, 1, 0]);
  expect(debug("island")).toEqual([0, 0, 0]);
  expect(debug("Taiga")).toEqual([1, 1, 1]);
  expect(debug("Corrupted")).toEqual([0.5, 0, 1]);
});

test("stay() draws one random number for pool biomes and none for others", () => {
  let draws = 0;
  const biomes = createBiomes(() => {
    draws++;
    return 0.5;
  });
  expect(biomes.Tundra.stay()).toBe("Tundra"); // 0.5 < 0.7
  expect(biomes.Taiga.stay()).toBe("Taiga"); // 0.5 >= 0.3
  expect(draws).toBe(2);
  expect(biomes.Mountain.stay()).toBe("Mountain");
  expect(biomes.Fairy.stay()).toBe("Fairy");
  expect(draws).toBe(2);
});
