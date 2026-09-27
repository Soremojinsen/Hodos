import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { aleaPRNG } from "../vendor/alea-prng.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
import { RIVER, buildRivers } from "./rivers.js";

/**
 * Every tile has TILE_CELLS_SIDE² cells, whatever its level: about 8 px wide on screen.
 */
export const TILE_CELLS_SIDE = 32;

/**
 * How far a point may move from the centre of its grid square, as a share of the square.
 */
const JITTER = 0.8;

/**
 * The side of a tile of level z, in world units.
 */
export const tileSize = (z) => WORLD_SIZE / 2 ** z;

/**
 * The cell sites of a tile: one point per square of a TILE_CELLS_SIDE² grid, moved at random
 * within it. Drawn from the seed and the tile coordinates only, so any tile can recompute its
 * neighbours' points.
 *
 * A tile outside the world has the points of the tile across the world's edge, mirrored. A point
 * and its mirror image are split by the edge itself, so the cells on the edge end exactly on it,
 * and every point inside the world belongs to a cell whose site is inside, which gets drawn.
 *
 * @returns {Float64Array} x0, y0, x1, y1, …, row by row from the tile's lowest y (unordered
 *                         outside the world)
 */
export function tilePoints(seed, z, x, y) {
  const count = 2 ** z;
  const inside = (i) => (i < 0 ? -1 - i : i >= count ? 2 * count - 1 - i : i);
  if (inside(x) !== x || inside(y) !== y) {
    const reflect = (value, i) => (i < 0 ? -value : i >= count ? 2 * WORLD_SIZE - value : value);
    return tilePoints(seed, z, inside(x), inside(y)).map((value, i) =>
      i % 2 === 0 ? reflect(value, x) : reflect(value, y),
    );
  }
  const random = aleaPRNG(`${seed}:${z}:${x}:${y}`);
  const size = tileSize(z);
  const step = size / TILE_CELLS_SIDE;
  const points = new Float64Array(2 * TILE_CELLS_SIDE ** 2);
  let i = 0;
  for (let row = 0; row < TILE_CELLS_SIDE; row++) {
    for (let col = 0; col < TILE_CELLS_SIDE; col++) {
      points[i++] = x * size + (col + 0.5 + JITTER * (random() - 0.5)) * step;
      points[i++] = y * size + (row + 0.5 + JITTER * (random() - 0.5)) * step;
    }
  }
  return points;
}

/**
 * The Voronoi cells whose site is in a tile, computed with the points of its 8 neighbours.
 * A cell only depends on nearby points, so it is the same whichever tile computes it: cells may
 * reach a little past the tile's edge, and the neighbour, which does not keep them, would
 * compute the same polygons.
 *
 * @returns {{site: Number[], ring: Number[][]}[]} rings without the closing point
 */
export function tileCells(seed, z, x, y) {
  const size = tileSize(z);
  // The tile's own points first, so they are the first cells of the Voronoi
  const blocks = [tilePoints(seed, z, x, y)];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) blocks.push(tilePoints(seed, z, x + dx, y + dy));
    }
  }
  const points = new Float64Array(blocks.length * blocks[0].length);
  blocks.forEach((block, i) => points.set(block, i * block.length));
  const voronoi = new Delaunay(points).voronoi([
    (x - 1) * size,
    (y - 1) * size,
    (x + 2) * size,
    (y + 2) * size,
  ]);
  const cells = [];
  for (let i = 0; i < TILE_CELLS_SIDE ** 2; i++) {
    cells.push({
      site: [points[2 * i], points[2 * i + 1]],
      ring: voronoi.cellPolygon(i).slice(0, -1),
    });
  }
  return cells;
}

/**
 * Everything the GPU needs to draw a tile, as typed arrays a worker can transfer.
 * Each cell is a fan of triangles around its site. The cell's biome is its site's; altitudes
 * are sampled at each vertex, so a land cell with a corner at sea slopes down to the coast.
 * The rivers come after the cells, see rivers.js buildRivers: the first landIndexCount indices
 * are the cells'.
 *
 * @param sampler {WorldSampler}
 */
export function buildTile(sampler, z, x, y) {
  const cells = tileCells(sampler.seed, z, x, y);
  const size = tileSize(z);
  // Cells may reach a little more than a cell past the tile's edge, see tileCells
  const margin = (2 * size) / TILE_CELLS_SIDE;
  const rivers = buildRivers(sampler, z, [
    x * size - margin,
    y * size - margin,
    (x + 1) * size + margin,
    (y + 1) * size + margin,
  ]);
  const landVertexCount = cells.reduce((n, cell) => n + 1 + cell.ring.length, 0);
  const landIndexCount = cells.reduce((n, cell) => n + 3 * cell.ring.length, 0);
  const vertexCount = landVertexCount + rivers.positions.length / 3;
  if (vertexCount > 0x10000) throw new Error(`Tile ${z}/${x}/${y} has too many vertices`);
  const positions = new Float32Array(3 * vertexCount);
  const biomeIds = new Float32Array(vertexCount);
  const debugColors = new Float32Array(3 * vertexCount);
  const indices = new Uint16Array(landIndexCount + rivers.indices.length);
  let vertex = 0;
  let index = 0;
  for (const cell of cells) {
    const sample = sampler.sampleAt(cell.site[0], cell.site[1], z);
    const debugColor = BIOME_DEFINITIONS[sample.biome].debug;
    const addVertex = (px, py, altitude) => {
      positions.set([px, py, altitude], 3 * vertex);
      biomeIds[vertex] = sample.biome;
      debugColors.set(debugColor, 3 * vertex);
      vertex++;
    };
    const center = vertex;
    addVertex(cell.site[0], cell.site[1], sample.altitude);
    for (const [px, py] of cell.ring) addVertex(px, py, sampler.sampleAt(px, py, z).altitude);
    const corners = cell.ring.length;
    for (let j = 0; j < corners; j++) {
      indices[index++] = center;
      indices[index++] = center + 1 + j;
      indices[index++] = center + 1 + ((j + 1) % corners);
    }
  }
  positions.set(rivers.positions, 3 * landVertexCount);
  biomeIds.fill(RIVER, landVertexCount);
  for (let v = landVertexCount; v < vertexCount; v++) {
    debugColors.set(BIOME_DEFINITIONS[RIVER].debug, 3 * v);
  }
  indices.set(
    rivers.indices.map((i) => i + landVertexCount),
    landIndexCount,
  );
  return { z, x, y, positions, biomeIds, debugColors, indices, landIndexCount };
}

/**
 * The site of the cell drawn under a world point at level z: its nearest site among the
 * points of its tile and the 8 around, the same cell buildTile draws there.
 *
 * Tiles outside the world are skipped: their mirrored points are never nearer than the points
 * they mirror, only as near on the world's edge, where they must not win the tie.
 *
 * @returns {Number[]} [x, y]
 */
export function siteAt(seed, px, py, z) {
  const size = tileSize(z);
  const count = 2 ** z;
  const tileX = Math.floor(px / size);
  const tileY = Math.floor(py / size);
  let best = null;
  let bestDistance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [x, y] = [tileX + dx, tileY + dy];
      if (x < 0 || x >= count || y < 0 || y >= count) continue;
      const points = tilePoints(seed, z, x, y);
      for (let i = 0; i < points.length; i += 2) {
        const distance = (points[i] - px) ** 2 + (points[i + 1] - py) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [points[i], points[i + 1]];
        }
      }
    }
  }
  return best;
}
