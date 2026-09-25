import { WORLD_SIZE } from "../constants.js";

/**
 * The altitude bands of the Parchemin rendering (shaders/world_default.frag), lowest first.
 * The shader adds noise to the altitude, so near a limit the pixel color can differ from the band.
 */
export const RELIEF_BANDS = [
  { below: 0, relief: "sea" },
  { below: 0.1, relief: "coast" },
  { below: 0.65, relief: "lowland" },
  { below: 0.8, relief: "mountain" },
];

export const reliefOf = (altitude) =>
  RELIEF_BANDS.find((band) => altitude < band.below)?.relief ?? "peak";

/**
 * What is at a world point: the biome name, the relief band and the land mass of its cell.
 * It only reads the generated cells and never draws random numbers, so the map stays the same.
 *
 * @param generator {MapGenerator} after generateTile
 * @returns {{biome: string, relief: string, landmass: Object|null}|null} null outside the world
 */
export function inspectAt(generator, x, y) {
  if (!(x >= 0 && x <= WORLD_SIZE && y >= 0 && y <= WORLD_SIZE)) return null;
  const cell = generator.cells[generator.delaunay.find(x, y)];
  let landmass = null;
  if (cell.isContinent()) {
    landmass =
      cell.continentNumber > 0
        ? { type: "continent", number: cell.continentNumber }
        : { type: "island" };
  }
  return { biome: cell.biome.name, relief: reliefOf(cell.center.z), landmass };
}
