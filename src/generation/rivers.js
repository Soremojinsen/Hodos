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
 * A river is drawn as the wider of two widths, blended (see riverPixels), so that it is a line far
 * out and its real size up close:
 *
 * - a line, in pixels: a river as large as the smallest drawn at a zoom (see riverThreshold) is
 *   MIN_WIDTH_PX wide, and each doubling of the flow adds a pixel, up to MAX_WIDTH_PX;
 * - its real width in the world: TRUE_WIDTH at TRUE_WIDTH_FLOW, as the square root of the flow
 *   (the land it drains), as real rivers roughly are.
 *
 * Both only grow when zooming in, gradually: the shaders widen the rivers for the zoom they are
 * drawn at, so a river keeps its width when the tiles switch level.
 */
export const MIN_WIDTH_PX = 1;
export const MAX_WIDTH_PX = 5;
export const TRUE_WIDTH = 7.5;
export const TRUE_WIDTH_FLOW = 1024;

/**
 * How the two widths blend: the BLEND-norm of the two, which is the wider one, a little rounded
 * where they are close, so rivers do not start widening faster all at once.
 */
export const BLEND = 4;

/**
 * A course is split until its segments are at most MAX_SEGMENT_PX long on screen, but not below
 * BEND_WIDTHS times the river's width: smaller bends would only make its banks lumpy. Each split
 * moves the middle of a segment sideways by up to MEANDER times the segment's length.
 */
export const MAX_SEGMENT_PX = 8;
export const BEND_WIDTHS = 1;
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
 * The sides of the polygon drawn at each point of a course, joining its segments round: on a
 * river 25 px wide, its edges are within a quarter of a pixel of the circle.
 */
export const JOIN_SIDES = 16;

export const RIVER = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "river");

/**
 * The side of a screen pixel at zoom z, in world units.
 */
export const pixelSize = (z) => WORLD_SIZE / 2 ** z / TILE_PIXEL_SIZE;

/**
 * How far a river's end looks for deep water at level z, in world units.
 */
export const maxReach = (z) => Math.max(MAX_REACH, 3 * DEEP_WATER_PX * pixelSize(z));

/**
 * The smallest flow of the rivers drawn at level z. At a zoom between levels, the flow that is
 * MIN_WIDTH_PX wide there.
 */
export const riverThreshold = (z) => Math.max(MIN_RIVER_FLOW, RIVER_BASE_FLOW / 2 ** z);

/**
 * The real width of a river, in world units.
 */
export const trueWidth = (flow) => TRUE_WIDTH * Math.sqrt(flow / TRUE_WIDTH_FLOW);

/**
 * The width of a river at a zoom, in pixels, see MIN_WIDTH_PX. The world shaders compute the
 * same, see riverWidthUniform.
 */
export function riverPixels(flow, zoom) {
  const line = Math.min(
    Math.max(MIN_WIDTH_PX + Math.log2(flow / riverThreshold(zoom)), MIN_WIDTH_PX),
    MAX_WIDTH_PX,
  );
  const real = trueWidth(flow) / pixelSize(zoom);
  return (line ** BLEND + real ** BLEND) ** (1 / BLEND);
}

/**
 * The width of a river at a zoom, in world units.
 */
export const riverWidth = (flow, zoom) => riverPixels(flow, zoom) * pixelSize(zoom);

/**
 * At least half the width of a river at every zoom level z is drawn at, from z - 0.5 to z + 0.5,
 * in world units: its most pixels, of the largest pixels. (Its width in the world mostly shrinks
 * when zooming in, but not always: a line less than 1 / ln 2 pixels wide grows.)
 */
export const maxHalfWidth = (flow, z) => (riverPixels(flow, z + 0.5) * pixelSize(z - 0.5)) / 2;

/**
 * What the world shaders need to widen the rivers for a view, see view.js: its line widths,
 * [log2 of riverThreshold at its zoom, MIN_WIDTH_PX, MAX_WIDTH_PX, world units per pixel], and
 * its real widths, [the pixels of a river of flow 1, BLEND].
 */
export function riverWidthUniform(view) {
  const zoom = Math.log2((view.pixelsPerUnit * WORLD_SIZE) / TILE_PIXEL_SIZE);
  return {
    line: [Math.log2(riverThreshold(zoom)), MIN_WIDTH_PX, MAX_WIDTH_PX, 1 / view.pixelsPerUnit],
    real: [trueWidth(1) * view.pixelsPerUnit, BLEND],
  };
}

/**
 * The winding course from a to b at level z: the segment is split in two, then each half, and
 * so on, until the pieces are short enough on screen, or would bend a river of the given width
 * (in world units) too tightly. The random draws of each round of splits come in the same order
 * whatever the level, so as long as the width does not grow at deeper levels (see riverWidth),
 * a deeper level only adds bends to a shallower one's course, and a and b never move.
 *
 * @param key the random seed of this course
 * @returns {Number[]} x0, y0, x1, y1, …, from a to b
 */
export function meander(ax, ay, bx, by, key, z, width = 0) {
  const length = Math.hypot(bx - ax, by - ay);
  const pixels = length / pixelSize(z);
  let rounds = pixels > MAX_SEGMENT_PX ? Math.ceil(Math.log2(pixels / MAX_SEGMENT_PX)) : 0;
  if (width > 0) {
    rounds = Math.min(rounds, Math.max(Math.floor(Math.log2(length / (BEND_WIDTHS * width))), 0));
  }
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
 * The courses already found, by sampler then "z/k": finding a mouth's deep water can take
 * thousands of samples, and neighbouring tiles, or a pointer moving over the map, ask for the
 * same courses again. All of them, at every level, take about 2.5 MB.
 */
const courses = new WeakMap();

/**
 * The course of river edge k at level z: its meander, and for an edge that ends in the sea or a
 * lake, when this level does not draw deep water there, a meander on to the nearest that it does.
 * The array is shared by every caller: do not change it.
 *
 * @param sampler {WorldSampler}
 * @returns {Number[]} x0, y0, x1, y1, …
 */
export function riverCourse(sampler, k, z) {
  let known = courses.get(sampler);
  if (!known) {
    known = new Map();
    courses.set(sampler, known);
  }
  const key = `${z}/${k}`;
  let course = known.get(key);
  if (!course) {
    course = findCourse(sampler, k, z);
    known.set(key, course);
  }
  return course;
}

function findCourse(sampler, k, z) {
  const { sites, from, to, flow, mouth } = sampler.rivers;
  const [a, b] = [from[k], to[k]];
  const [ax, ay, bx, by] = [sites[2 * a], sites[2 * a + 1], sites[2 * b], sites[2 * b + 1]];
  const width = riverWidth(flow[k], z);
  const course = meander(ax, ay, bx, by, `${sampler.seed}:river:${a}:${b}`, z, width);
  if (mouth[k] && !deepWater(sampler, bx, by, z)) {
    const water = nearestWater(sampler, bx, by, z);
    if (water) {
      const reach = meander(bx, by, ...water, `${sampler.seed}:mouth:${a}:${b}`, z, width);
      course.push(...reach.slice(2));
    }
  }
  return course;
}
/**
 * The courses of the rivers drawn at level z that may touch an area, largest first, with their
 * flow and their largest half width at that level (see maxHalfWidth), in world units.
 *
 * @param sampler {WorldSampler}
 * @returns {Iterable<{course: Number[], flow: Number, half: Number}>} course as in riverCourse
 */
export function* riverCourses(sampler, z, [minX, minY, maxX, maxY]) {
  const rivers = sampler.rivers;
  if (!rivers) return;
  const threshold = riverThreshold(z);
  const { sites, from, to, flow, mouth } = rivers;
  // Edges come largest flow first
  for (let k = 0; k < flow.length && flow[k] >= threshold; k++) {
    const [a, b] = [from[k], to[k]];
    const [ax, ay, bx, by] = [sites[2 * a], sites[2 * a + 1], sites[2 * b], sites[2 * b + 1]];
    const half = maxHalfWidth(flow[k], z);
    // A course strays at most about 0.36 of its length from its edge (and its reach from b)
    const pad = Math.hypot(bx - ax, by - ay) / 2 + half + (mouth[k] ? 1.4 * maxReach(z) : 0);
    if (
      Math.max(ax, bx) + pad >= minX &&
      Math.min(ax, bx) - pad <= maxX &&
      Math.max(ay, by) + pad >= minY &&
      Math.min(ay, by) - pad <= maxY
    ) {
      yield { course: riverCourse(sampler, k, z), flow: flow[k], half };
    }
  }
}

/**
 * The river triangles of an area at level z, to draw over its cells: a quad per segment and a
 * polygon per point of each course that touch the area, at sea altitude so the Parchemin
 * rendering paints them as water.
 *
 * Every vertex sits on its course; the shaders move it out by half the river's width at the
 * zoom drawn (see riverWidthUniform), along its shape: a direction of length 1 (0 at the centre
 * of a join) and the log2 of the river's flow.
 *
 * A tile passes the area its cells cover, a little past its edge, so two neighbouring tiles
 * draw the same pieces of river along their border, whichever is drawn last.
 *
 * @param sampler {WorldSampler}
 * @returns {{positions: Number[], shapes: Number[], indices: Number[]}} x, y, altitude and
 *          dx, dy, log2 flow per vertex; indices from 0
 */
export function buildRivers(sampler, z, area) {
  const positions = [];
  const shapes = [];
  const indices = [];
  const [minX, minY, maxX, maxY] = area;
  const touches = (x0, y0, x1, y1, pad) =>
    Math.max(x0, x1) + pad >= minX &&
    Math.min(x0, x1) - pad <= maxX &&
    Math.max(y0, y1) + pad >= minY &&
    Math.min(y0, y1) - pad <= maxY;

  for (const { course, flow, half } of riverCourses(sampler, z, area)) {
    const logFlow = Math.log2(flow);
    const addVertex = (px, py, dx, dy) => {
      positions.push(px, py, SEA_ALTITUDE);
      shapes.push(dx, dy, logFlow);
      return positions.length / 3 - 1;
    };
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [px, py, qx, qy] = [course[i], course[i + 1], course[i + 2], course[i + 3]];
      const length = Math.hypot(qx - px, qy - py);
      if (length === 0 || !touches(px, py, qx, qy, half)) continue;
      const [nx, ny] = [(py - qy) / length, (qx - px) / length];
      const first = addVertex(px, py, nx, ny);
      addVertex(px, py, -nx, -ny);
      addVertex(qx, qy, -nx, -ny);
      addVertex(qx, qy, nx, ny);
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    for (let i = 0; i < course.length; i += 2) {
      const [px, py] = [course[i], course[i + 1]];
      if (!touches(px, py, px, py, half)) continue;
      const center = addVertex(px, py, 0, 0);
      for (let side = 0; side < JOIN_SIDES; side++) {
        const angle = (2 * Math.PI * side) / JOIN_SIDES;
        addVertex(px, py, Math.cos(angle), Math.sin(angle));
      }
      for (let side = 0; side < JOIN_SIDES; side++) {
        indices.push(center, center + 1 + side, center + 1 + ((side + 1) % JOIN_SIDES));
      }
    }
  }
  return { positions, shapes, indices };
}

/**
 * Whether a river of level z, drawn at a zoom, passes within margin of (x, y), in world units:
 * the river's own width, plus margin on each side.
 *
 * @param sampler {WorldSampler}
 * @param options {{zoom: Number, margin: Number}} the zoom is the level's by default
 */
export function riverAt(sampler, x, y, z, { zoom = z, margin = 0 } = {}) {
  // The courses that may pass within their width of the area, so within the margin of (x, y)
  const area = [x - margin, y - margin, x + margin, y + margin];
  for (const { course, flow } of riverCourses(sampler, z, area)) {
    const reach = riverWidth(flow, zoom) / 2 + margin;
    for (let i = 0; i + 3 < course.length; i += 2) {
      if (segmentDistance(x, y, course[i], course[i + 1], course[i + 2], course[i + 3]) <= reach) {
        return true;
      }
    }
  }
  return false;
}

// The distance from (x, y) to the segment from p to q
function segmentDistance(x, y, px, py, qx, qy) {
  const [dx, dy] = [qx - px, qy - py];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(Math.max(((x - px) * dx + (y - py) * dy) / lengthSquared, 0), 1);
  return Math.hypot(x - (px + t * dx), y - (py + t * dy));
}
