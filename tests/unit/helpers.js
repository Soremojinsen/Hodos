import { BIOMES } from "../../src/generation/biomes.js";
import { MapGenerator } from "../../src/generation/generator.js";

/**
 * Generates a map and summarizes it as one "biome:altitude:debug color" entry per cell,
 * the format of tests/fixtures/seed-12345.json.
 */
export const generateSummary = (seed) => {
  const generator = new MapGenerator(seed);
  generator.generateTile(0, 0, 0);
  const names = new Map(Object.entries(BIOMES).map(([name, biome]) => [biome, name]));
  return generator.cells.map(
    (c) => `${names.get(c.biome)}:${c.center.z}:${c.debugColor.components.join(",")}`,
  );
};
