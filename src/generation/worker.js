import { WorldSampler } from "./fields.js";
import { withWater } from "./hydrology.js";
import { EMPTY_ATLAS, buildAtlas } from "./labels.js";
import { buildTile } from "./tiles.js";
import { generateWorld } from "./world.js";

/**
 * Map generation, off the main thread.
 * In: {type: "init", seed}, then {type: "tile", z, x, y}; messages are handled in order.
 * Out: {type: "world", base, atlas}, {type: "tile", tile} (arrays transferred, not copied), or
 * {type: "error", request, message} for the message that failed.
 */
let sampler;

self.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      const base = withWater(generateWorld(data.seed));
      sampler = new WorldSampler(base);
      // The map shows without labels rather than not at all
      let atlas = EMPTY_ATLAS;
      try {
        atlas = buildAtlas(base, sampler);
      } catch (error) {
        console.error("The place names could not be generated:", error);
      }
      self.postMessage({ type: "world", base, atlas });
    } else if (data.type === "tile") {
      const tile = buildTile(sampler, data.z, data.x, data.y);
      self.postMessage({ type: "tile", tile }, [
        tile.positions.buffer,
        tile.biomeIds.buffer,
        tile.debugColors.buffer,
        tile.slopes.buffer,
        tile.indices.buffer,
        tile.riverPositions.buffer,
        tile.riverShapes.buffer,
        tile.riverIndices.buffer,
        tile.markTexels.buffer,
      ]);
    }
  } catch (error) {
    self.postMessage({ type: "error", request: data, message: String(error?.stack ?? error) });
  }
};
