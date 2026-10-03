import { pixelSize, riverEdgeAt } from "../generation/rivers.js";
import { siteAt } from "../generation/tiles.js";
import { RIVER_MARGIN_PX } from "./inspect.js";
import { levelForZoom } from "./tile-grid.js";

/**
 * The named features at a world point, as the hover panel shows them: the land mass under it,
 * and the most precise other feature (a river, a lake, a range, a sea or the ocean). They follow
 * what the map draws there, see inspect.js inspectAt.
 *
 * @param sampler {WorldSampler}
 * @param atlas   see generation/labels.js buildAtlas
 * @param info    inspectAt's answer at this point
 * @returns {{landmass: Object|null, feature: Object|null}} labels of the atlas
 */
export function namesAt(sampler, atlas, info, x, y, zoom, { rivers = true } = {}) {
  const { labels, lookup } = atlas;
  if (!lookup || !info) return { landmass: null, feature: null };
  const label = (index) => (index >= 0 ? labels[index] : null);
  const level = levelForZoom(zoom);
  // inspectAt colours a point by its cell's site, as the tiles do
  const [siteX, siteY] = siteAt(sampler.seed, x, y, level);
  const cell = sampler.cellAt(siteX, siteY, level);
  let landmass = null;
  if (info.landmass?.type === "continent") landmass = label(lookup.continent[info.landmass.number]);
  else if (info.landmass) landmass = label(lookup.cellIsland[cell]);
  let feature = null;
  if (info.biome === "river" && rivers) {
    const edge = riverEdgeAt(sampler, x, y, level, {
      zoom,
      margin: RIVER_MARGIN_PX * pixelSize(zoom),
    });
    if (edge >= 0) feature = label(lookup.edgeRiver[edge]);
  } else if (info.biome === "lake") {
    feature = label(
      lookup.pointLake[sampler.waterPointAt(...sampler.lakeWarp(siteX, siteY, level))],
    );
  } else if (info.landmass && (info.relief === "mountain" || info.relief === "peak")) {
    feature = label(lookup.pointRange[sampler.waterPointAt(x, y)]);
  } else if (info.biome === "ocean") {
    feature = label(lookup.cellSea[cell]);
  }
  return { landmass, feature };
}
