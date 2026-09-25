import { expect, test, vi } from "vitest";
import { BIOMES } from "../../src/generation/biomes.js";
import { MapGenerator, generateWorld } from "../../src/generation/world.js";
import { Cell } from "../../src/generation/geometry.js";
import { noise } from "../../src/vendor/perlin.js";
import { generateSummary } from "./helpers.js";

const TEN_SEEDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

test("the same seed always generates the same map", () => {
  expect(generateSummary("12345")).toEqual(generateSummary("12345"));
});

test.each([[""], [null], [undefined]])("a missing seed (%j) gets a random numeric one", (seed) => {
  const generator = new MapGenerator(seed);
  expect(generator.seed).toMatch(/^\d+$/);
});

test("text seeds give different terrain noise", () => {
  new MapGenerator("dragon").generate();
  const dragon = noise.simplex2(1.5, 2.5);
  new MapGenerator("wizard").generate();
  const wizard = noise.simplex2(1.5, 2.5);
  expect(dragon).not.toBe(wizard);
});

test("corners shared with the ocean stay at sea level", () => {
  const generator = new MapGenerator("12345");
  generator.generate();
  const raised = generator.cells
    .filter((cell) => cell.isMaritime())
    .flatMap((cell) => cell.ring)
    .filter((point) => point.z !== -0.1);
  expect(raised).toHaveLength(0);
});

test.each(TEN_SEEDS)("seed %s: the corruption always spreads to the whole first ring", (seed) => {
  const generator = new MapGenerator(seed);
  generator.generate();
  const cells = generator.cells;
  const isCorrupted = (i) => cells[i].biome === BIOMES.Corrupted;
  const hasFullRing = cells.some(
    (cell, i) =>
      isCorrupted(i) &&
      [...generator.delaunay.neighbors(i)]
        .filter((next) => cells[next].isContinent())
        .every(isCorrupted),
  );
  expect(hasFullRing).toBe(true);
});

test("biome propagation leaves islands alone", () => {
  let absorbed = 0;
  for (const seed of TEN_SEEDS) {
    const generator = new MapGenerator(seed);
    const generateBiome = generator.generateBiome.bind(generator);
    generator.generateBiome = () => {
      const islands = generator.cells.filter((cell) => cell.biome === BIOMES.island);
      generateBiome();
      absorbed += islands.filter((cell) => cell.biome !== BIOMES.island).length;
    };
    generator.generate();
  }
  expect(absorbed).toBe(0);
});

test("the continent burn claims each cell only once", () => {
  const claims = new Map();
  const setContinent = Cell.prototype.setContinent;
  Cell.prototype.setContinent = function (number) {
    claims.set(this, (claims.get(this) || 0) + 1);
    return setContinent.call(this, number);
  };
  try {
    new MapGenerator("12345").generate();
  } finally {
    Cell.prototype.setContinent = setContinent;
  }
  expect([...claims.values()].filter((n) => n > 1)).toHaveLength(0);
});

test("generating a map logs nothing", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    new MapGenerator("12345").generate();
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

test("the base world holds every coarse cell as plain arrays", () => {
  const generator = new MapGenerator("12345");
  generator.generate();
  const base = generator.toBaseWorld();
  expect(base.seed).toBe("12345");
  expect(base.sites).toBeInstanceOf(Float64Array);
  expect(base.sites).toHaveLength(generator.cells.length * 2);
  generator.cells.forEach((cell, i) => {
    expect(base.biomes[i]).toBe(cell.biome.id);
    expect(base.continents[i]).toBe(cell.continentNumber);
    expect([base.sites[2 * i], base.sites[2 * i + 1]]).toEqual([cell.center.x, cell.center.y]);
  });
});

test("generateWorld gives the same base world for the same seed", () => {
  expect(generateWorld("abc")).toEqual(generateWorld("abc"));
  expect(generateWorld("abc")).not.toEqual(generateWorld("abd"));
});
