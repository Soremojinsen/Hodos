import { WorldSampler } from "./fields.js";
import { buildTile } from "./tiles.js";
import { generateWorld } from "./world.js";

/**
 * Map generation, off the main thread.
 * In: {type: "init", seed}, then {type: "tile", z, x, y}; messages are handled in order.
 * Out: {type: "world", base}, {type: "tile", tile} (arrays transferred, not copied), or
 * {type: "error", request, message} for the message that failed.
 */
let sampler;

self.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      const base = generateWorld(data.seed);
      sampler = new WorldSampler(base);
      self.postMessage({ type: "world", base });
    } else if (data.type === "tile") {
      const tile = buildTile(sampler, data.z, data.x, data.y);
      self.postMessage({ type: "tile", tile }, [
        tile.positions.buffer,
        tile.biomeIds.buffer,
        tile.debugColors.buffer,
        tile.indices.buffer,
      ]);
    }
  } catch (error) {
    self.postMessage({ type: "error", request: data, message: String(error?.stack ?? error) });
  }
};
