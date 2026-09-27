import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { aleaPRNG } from "../vendor/alea-prng.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
import { SEA_ALTITUDE } from "./fields.js";
import { MIN_RIVER_FLOW } from "./hydrology.js";

/**
 * The smallest flow of a river drawn at level 0; each level shows rivers half as large.
 */
export const RIVER_BASE_FLOW = 256;

/**
 * River widths on screen, in pixels: the smallest river of a level is MIN_WIDTH_PX wide, and each
 * doubling of the flow adds a pixel, up to MAX_WIDTH_PX.
 */
export const MIN_WIDTH_PX = 1;
export const MAX_WIDTH_PX = 5;

/**
 * A course is split until its segments are at most MAX_SEGMENT_PX long on screen. Each split moves
 * the middle of a segment sideways by up to MEANDER times the segment's length.
 */
export const MAX_SEGMENT_PX = 8;
export const MEANDER = 0.25;

/**
 * How far, in world units, a river's end looks for the water drawn at a level, whose coasts and
 * lake shores differ a little from those the water flowed to (measured: at most about 160).
 * Shallow levels, whose cells are larger, look at least 3 deep water radii away, see maxReach.
 */
export const MAX_REACH = 250;

/**
 * How far, in pixels, the water must reach around a river's end: a tile colours each cell (about
 * 8 px wide, see tiles.js TILE_CELLS_SIDE) by its site, so water only at the end itself may be
 * drawn as land, while water all around it is drawn as water.
 */
export const DEEP_WATER_PX = 12;

/**
 * The sides of the polygon drawn at each point of a course, joining its segments round.
 */
export const JOIN_SIDES = 8;

export const RIVER = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "river");

/**
 * The side of a screen pixel at level z, in world units.
 */
const pixelSize = (z) => WORLD_SIZE / 2 ** z / TILE_PIXEL_SIZE;

/**
 * How far a river's end looks for deep water at level z, in world units.
 */
export const maxReach = (z) => Math.max(MAX_REACH, 3 * DEEP_WATER_PX * pixelSize(z));

/**
 * The smallest flow of the rivers drawn at level z.
 */
export const riverThreshold = (z) => Math.max(MIN_RIVER_FLOW, RIVER_BASE_FLOW / 2 ** z);

/**
 * The width of a river at level z, in world units.
 */
export function riverWidth(flow, z) {
  const pixels = MIN_WIDTH_PX + Math.log2(flow / riverThreshold(z));
  return Math.min(Math.max(pixels, MIN_WIDTH_PX), MAX_WIDTH_PX) * pixelSize(z);
}

/**
 * The winding course from a to b at level z: the segment is split in two, then each half, and
 * so on, until the pieces are short enough on screen. The random draws of each round of splits
 * come in the same order whatever the level, so a deeper level only adds bends to a shallower
 * one's course, and a and b never move.
 *
 * @param key the random seed of this course
 * @returns {Number[]} x0, y0, x1, y1, …, from a to b
 */
export function meander(ax, ay, bx, by, key, z) {
  const pixels = Math.hypot(bx - ax, by - ay) / pixelSize(z);
  const rounds = pixels > MAX_SEGMENT_PX ? Math.ceil(Math.log2(pixels / MAX_SEGMENT_PX)) : 0;
  const random = aleaPRNG(key);
  let points = [ax, ay, bx, by];
  for (let round = 0; round < rounds; round++) {
    const next = [points[0], points[1]];
    for (let i = 0; i + 3 < points.length; i += 2) {
      const [px, py, qx, qy] = [points[i], points[i + 1], points[i + 2], points[i + 3]];
      // (qy - py, px - qx) is perpendicular to the segment and as long as it
      const offset = MEANDER * (2 * random() - 1);
      next.push((px + qx) / 2 + offset * (qy - py), (py + qy) / 2 + offset * (px - qx), qx, qy);
    }
    points = next;
  }
  return points;
}

/**
 * Whether the water reaches DEEP_WATER_PX around (x, y) at level z, in 8 directions.
 *
 * @param sampler {WorldSampler}
 */
export function deepWater(sampler, x, y, z) {
  if (sampler.sampleAt(x, y, z).land) return false;
  const radius = DEEP_WATER_PX * pixelSize(z);
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4;
    if (sampler.sampleAt(x + radius * Math.cos(angle), y + radius * Math.sin(angle), z).land) {
      return false;
    }
  }
  return true;
}

/**
 * The nearest deep water from (x, y) at level z (see deepWater), looked for in 16 directions,
 * ring by ring (4 pixels, at least 5 world units, apart).
 *
 * @param sampler {WorldSampler}
 * @returns {Number[]|null} [x, y], or null when there is none within maxReach(z)
 */
export function nearestWater(sampler, x, y, z) {
  const step = Math.max(5, 4 * pixelSize(z));
  for (let radius = step; radius <= maxReach(z); radius += step) {
    for (let k = 0; k < 16; k++) {
      const angle = (k * Math.PI) / 8;
      const [px, py] = [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
      if (deepWater(sampler, px, py, z)) return [px, py];
    }
  }
  return null;
}

/**
 * The course of river edge k at level z: its meander, and for an edge that ends in the sea or a
 * lake, when this level does not draw deep water there, a meander on to the nearest that it does.
 *
 * @param sampler {WorldSampler}
 * @returns {Number[]} x0, y0, x1, y1, …
 */
export function riverCourse(sampler, k, z) {
  const { sites, from, to, mouth } = sampler.rivers;
  const [a, b] = [from[k], to[k]];
  const [ax, ay, bx, by] = [sites[2 * a], sites[2 * a + 1], sites[2 * b], sites[2 * b + 1]];
  const course = meander(ax, ay, bx, by, `${sampler.seed}:river:${a}:${b}`, z);
  if (mouth[k] && !deepWater(sampler, bx, by, z)) {
    const water = nearestWater(sampler, bx, by, z);
    if (water) {
      const reach = meander(bx, by, ...water, `${sampler.seed}:mouth:${a}:${b}`, z);
      course.push(...reach.slice(2));
    }
  }
  return course;
}
/**
 * The river triangles of an area at level z, to draw over its cells: a quad per segment and a
 * polygon per point of each course that touch the area, at sea altitude so the Parchemin
 * rendering paints them as water.
 *
 * A tile passes the area its cells cover, a little past its edge, so two neighbouring tiles
 * draw the same pieces of river along their border, whichever is drawn last.
 *
 * @param sampler {WorldSampler}
 * @returns {{positions: Number[], indices: Number[]}} indices from 0
 */
export function buildRivers(sampler, z, [minX, minY, maxX, maxY]) {
  const positions = [];
  const indices = [];
  const rivers = sampler.rivers;
  if (!rivers) return { positions, indices };
  const touches = (x0, y0, x1, y1, pad) =>
    Math.max(x0, x1) + pad >= minX &&
    Math.min(x0, x1) - pad <= maxX &&
    Math.max(y0, y1) + pad >= minY &&
    Math.min(y0, y1) - pad <= maxY;
  const addVertex = (px, py) => {
    positions.push(px, py, SEA_ALTITUDE);
    return positions.length / 3 - 1;
  };

  const threshold = riverThreshold(z);
  const { sites, from, to, flow, mouth } = rivers;
  // Edges come largest flow first
  for (let k = 0; k < flow.length && flow[k] >= threshold; k++) {
    const [a, b] = [from[k], to[k]];
    const [ax, ay, bx, by] = [sites[2 * a], sites[2 * a + 1], sites[2 * b], sites[2 * b + 1]];
    const half = riverWidth(flow[k], z) / 2;
    // A course strays at most about 0.36 of its length from its edge (and its reach from b)
    const pad = Math.hypot(bx - ax, by - ay) / 2 + half + (mouth[k] ? 1.4 * maxReach(z) : 0);
    if (!touches(ax, ay, bx, by, pad)) continue;

    const course = riverCourse(sampler, k, z);
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [px, py, qx, qy] = [course[i], course[i + 1], course[i + 2], course[i + 3]];
      const length = Math.hypot(qx - px, qy - py);
      if (length === 0 || !touches(px, py, qx, qy, half)) continue;
      const [nx, ny] = [((py - qy) / length) * half, ((qx - px) / length) * half];
      const first = addVertex(px + nx, py + ny);
      addVertex(px - nx, py - ny);
      addVertex(qx - nx, qy - ny);
      addVertex(qx + nx, qy + ny);
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    for (let i = 0; i < course.length; i += 2) {
      const [px, py] = [course[i], course[i + 1]];
      if (!touches(px, py, px, py, half)) continue;
      const center = addVertex(px, py);
      for (let side = 0; side < JOIN_SIDES; side++) {
        const angle = (2 * Math.PI * side) / JOIN_SIDES;
        addVertex(px + half * Math.cos(angle), py + half * Math.sin(angle));
      }
      for (let side = 0; side < JOIN_SIDES; side++) {
        indices.push(center, center + 1 + side, center + 1 + ((side + 1) % JOIN_SIDES));
      }
    }
  }
  return { positions, indices };
}
