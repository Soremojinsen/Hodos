import { WORLD_SIZE } from "../constants.js";
import { BIOME_DEFINITIONS } from "../generation/biomes.js";
import { siteAt } from "../generation/tiles.js";

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
 * What is at a world point at a tile level: the biome name, the relief band and the land mass
 * of the cell drawn there. It only reads the sampler, so the map stays the same.
 *
 * @param sampler {WorldSampler}
 * @returns {{biome: string, relief: string, landmass: Object|null}|null} null outside the world
 */
export function inspectAt(sampler, x, y, level) {
  if (!(x >= 0 && x <= WORLD_SIZE && y >= 0 && y <= WORLD_SIZE)) return null;
  const [siteX, siteY] = siteAt(sampler.seed, x, y, level);
  const cell = sampler.sampleAt(siteX, siteY, level);
  let landmass = null;
  if (cell.land) {
    landmass =
      cell.continent > 0 ? { type: "continent", number: cell.continent } : { type: "island" };
  }
  return { biome: BIOME_DEFINITIONS[cell.biome].name, relief: reliefOf(cell.altitude), landmass };
}
