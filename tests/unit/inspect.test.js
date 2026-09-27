import { describe, expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { pixelSize, riverAt, riverCourses } from "../../src/generation/rivers.js";
import { siteAt, tileCells } from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";
import { RIVER_MARGIN_PX, inspectAt, reliefOf } from "../../src/map/inspect.js";

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

describe("water", () => {
  const watered = new WorldSampler(withWater(generateWorld("12345")));
  const { sites, from, to, flow } = watered.rivers;

  test("a lake is fresh water, not sea", () => {
    // A lake point of the water mesh, well inside its lake
    let lake = null;
    for (let i = 0; i < watered.rivers.sites.length / 2 && !lake; i += 7) {
      const [x, y] = [sites[2 * i], sites[2 * i + 1]];
      if ([0, 3, 6].every((z) => inspectAt(watered, x, y, z).biome === "lake")) lake = [x, y];
    }
    expect(lake).not.toBeNull();
    expect(inspectAt(watered, ...lake, 3)).toEqual({
      biome: "lake",
      relief: "freshwater",
      landmass: null,
    });
  });

  test("a river drawn at a level is found under the pointer, on its land mass", () => {
    // The middle of the largest river edge not at a mouth, drawn at every level
    const k = flow.findIndex((_, e) => !watered.rivers.mouth[e]);
    const [a, b] = [from[k], to[k]];
    const [x, y] = [(sites[2 * a] + sites[2 * b]) / 2, (sites[2 * a + 1] + sites[2 * b + 1]) / 2];
    for (let z = 0; z <= 7; z++) {
      const course = riverCourses(watered, z, [x, y, x, y]).next().value.course;
      // A point of the course itself, which the river covers whatever its bends
      const [px, py] = [course[2], course[3]];
      const info = inspectAt(watered, px, py, z);
      expect(info.biome).toBe("river");
      expect(info.relief).toBe("freshwater");
      expect(info.landmass).not.toBeNull();
    }
  });

  test("land away from rivers keeps its cell's biome", () => {
    const z = 3;
    const margin = RIVER_MARGIN_PX * pixelSize(z);
    let [rivers, land] = [0, 0];
    for (let x = 2000; x < 8000; x += 37) {
      const y = 4000;
      const info = inspectAt(watered, x, y, z);
      if (!info.landmass) continue;
      if (riverAt(watered, x, y, z, { margin })) {
        rivers++;
        expect(info.biome).toBe("river");
      } else {
        land++;
        const cell = watered.sampleAt(...siteAt("12345", x, y, z), z);
        expect(info.biome).toBe(BIOME_DEFINITIONS[cell.biome].name);
        expect(info.relief).toBe(reliefOf(cell.altitude));
      }
    }
    expect(rivers).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(rivers);
  });
});
