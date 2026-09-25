import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { tileCells } from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";
import { inspectAt, reliefOf } from "../../src/map/inspect.js";

const sampler = new WorldSampler(generateWorld("12345"));

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

test("inspecting gives the cell drawn there, at each level", () => {
  for (const [z, x, y] of [
    [0, 0, 0],
    [3, 4, 3],
    [6, 30, 33],
  ]) {
    tileCells("12345", z, x, y).forEach((cell, i) => {
      if (i % 50 !== 0) return;
      const [px, py] = cell.ring[0];
      const inside = [
        cell.site[0] + 0.9 * (px - cell.site[0]),
        cell.site[1] + 0.9 * (py - cell.site[1]),
      ];
      if (inside.some((c) => c < 0 || c > WORLD_SIZE)) return;
      const drawn = sampler.sampleAt(cell.site[0], cell.site[1], z);
      const info = inspectAt(sampler, ...inside, z);
      expect(info.biome).toBe(BIOME_DEFINITIONS[drawn.biome].name);
      expect(info.relief).toBe(reliefOf(drawn.altitude));
    });
  }
});

const stub = (sample) => ({ seed: "12345", sampleAt: () => sample });

test("land masses: continents by number, islands, nothing at sea", () => {
  expect(
    inspectAt(stub({ biome: 5, continent: 3, land: true, altitude: 0.3 }), 10, 10, 2).landmass,
  ).toEqual({ type: "continent", number: 3 });
  expect(
    inspectAt(stub({ biome: 2, continent: 0, land: true, altitude: 0.3 }), 10, 10, 2).landmass,
  ).toEqual({ type: "island" });
  const sea = inspectAt(stub({ biome: 0, continent: 0, land: false, altitude: -0.1 }), 10, 10, 2);
  expect(sea).toEqual({ biome: "ocean", relief: "sea", landmass: null });
});

test("outside the world there is nothing", () => {
  expect(inspectAt(sampler, -1, 500, 3)).toBeNull();
  expect(inspectAt(sampler, 500, 10001, 3)).toBeNull();
});
