import { WORLD_SIZE } from "../constants.js";
import { BIOME_DEFINITIONS } from "../generation/biomes.js";
import { RIVER, pixelSize, riverAt } from "../generation/rivers.js";
import { siteAt } from "../generation/tiles.js";
import { levelForZoom } from "./tile-grid.js";

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

const LAKE = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "lake");

/**
 * How far past a river's edge, in pixels, the pointer still finds it: rivers can be 1 px wide.
 */
export const RIVER_MARGIN_PX = 1;

/**
 * What the map shows at a world point at a zoom: the biome name, the relief band and the land
 * mass of the cell drawn there, or the river drawn over it. Lakes and rivers are fresh water,
 * not sea; a river keeps the land mass it flows through. It only reads the sampler, so the map
 * stays the same.
 *
 * @param sampler {WorldSampler}
 * @param options.rivers {boolean} whether rivers are drawn: the debug mode shows the raw cells
 * @returns {{biome: string, relief: string, landmass: Object|null}|null} null outside the world
 */
export function inspectAt(sampler, x, y, zoom, { rivers = true } = {}) {
  const level = levelForZoom(zoom);
  if (!(x >= 0 && x <= WORLD_SIZE && y >= 0 && y <= WORLD_SIZE)) return null;
  const [siteX, siteY] = siteAt(sampler.seed, x, y, level);
  const cell = sampler.sampleAt(siteX, siteY, level);
  let landmass = null;
  if (cell.land) {
    landmass =
      cell.continent > 0 ? { type: "continent", number: cell.continent } : { type: "island" };
  }
  let biome = cell.biome;
  if (
    rivers &&
    cell.land &&
    riverAt(sampler, x, y, level, { zoom, margin: RIVER_MARGIN_PX * pixelSize(zoom) })
  ) {
    biome = RIVER;
  }
  const relief = biome === LAKE || biome === RIVER ? "freshwater" : reliefOf(cell.altitude);
  return { biome: BIOME_DEFINITIONS[biome].name, relief, landmass };
}
