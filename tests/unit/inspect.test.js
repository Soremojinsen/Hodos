import { expect, test } from "vitest";
import { MapGenerator } from "../../src/generation/world.js";
import { inspectAt, reliefOf } from "../../src/map/inspect.js";

const generated = (seed) => {
  const generator = new MapGenerator(seed);
  generator.generate();
  return generator;
};

test.each([
  [-0.1, "sea"],
  [0, "coast"],
  [0.09, "coast"],
  [0.1, "lowland"],
  [0.649, "lowland"],
  [0.65, "mountain"],
  [0.79, "mountain"],
  [0.8, "peak"],
  [1, "peak"],
])("altitude %d is %s, as in the Parchemin shader", (altitude, relief) => {
  expect(reliefOf(altitude)).toBe(relief);
});

test("inspecting a cell centre gives that cell", () => {
  const generator = generated("12345");
  generator.cells.forEach((cell, i) => {
    if (i % 25 !== 0) return;
    const info = inspectAt(generator, cell.center.x, cell.center.y);
    expect(info.biome).toBe(cell.biome.name);
    expect(info.relief).toBe(reliefOf(cell.center.z));
  });
});

test("land masses: continents by number, islands, nothing at sea", () => {
  const generator = generated("12345");
  const at = (cell) => inspectAt(generator, cell.center.x, cell.center.y).landmass;
  const continent = generator.cells.find((c) => c.continentNumber > 0);
  expect(at(continent)).toEqual({ type: "continent", number: continent.continentNumber });
  const island = generator.cells.find((c) => c.continentNumber === 0 && c.isContinent());
  expect(at(island)).toEqual({ type: "island" });
  const sea = generator.cells.find((c) => c.isMaritime());
  expect(at(sea)).toBeNull();
});

test("outside the world there is nothing", () => {
  const generator = generated("12345");
  expect(inspectAt(generator, -1, 500)).toBeNull();
  expect(inspectAt(generator, 500, 10001)).toBeNull();
});

test("inspecting draws no random numbers, so the map stays the same", () => {
  const inspected = generated("12345");
  for (let i = 0; i < 100; i++) inspectAt(inspected, i * 97, i * 89);
  const untouched = generated("12345");
  expect(inspected.random()).toBe(untouched.random());
});
