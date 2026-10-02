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
 * How far, in world units, a river's end looks for the deep water drawn at a level, whose coasts
 * and lake shores differ from those the water flowed to: mostly by less than 200, but the warp
 * octaves of the deeper levels (see fields.js warp) can move a coast by up to about 420.
 * Shallow levels, whose cells are larger, look at least 3 deep water radii away, see maxReach.
 * Where no deep water is that near, the river goes on to the nearest water, even a narrow one.
 */
export const MAX_REACH = 450;

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
export const FLOODPLAIN = BIOME_DEFINITIONS.findIndex(
  (definition) => definition.name === "floodplain",
);

/**
 * Rivers line the dry lands with floodplains: a band BANK_MIN_PX wide on screen at least, and
 * BANK_WIDTHS times the river's real width up close, either side of its course, in the share of
 * that width each biome gets. Forests are already green or drawn with marks, and cold lands and
 * mountains stay as they are.
 */
export const BANK_BIOMES = { Desert: 1, Savana: 1, Plain: 0.5 };
export const BANK_MIN_PX = 6;
export const BANK_WIDTHS = 6;

const BANK_SHARES = BIOME_DEFINITIONS.map((definition) => BANK_BIOMES[definition.name] ?? 0);

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
 * Half the widest a river is drawn at level z, from zoom z - 0.5 to z + 0.5, in world units:
 * tighter than maxHalfWidth. Its width in the world only grows while its line is under
 * 1 / ln 2 pixels and its threshold still halves at each zoom (see riverPixels), so it is widest
 * at an end of the range or where either stops.
 */
export function drawnHalfWidth(flow, z) {
  const [low, high] = [z - 0.5, z + 0.5];
  const lineAtLn2 = 1 / Math.LN2 - MIN_WIDTH_PX - Math.log2(flow / RIVER_BASE_FLOW);
  const thresholdStops = Math.log2(RIVER_BASE_FLOW / MIN_RIVER_FLOW);
  const zooms = [low, high, lineAtLn2, thresholdStops].map((zoom) =>
    Math.min(Math.max(zoom, low), high),
  );
  return Math.max(...zooms.map((zoom) => riverWidth(flow, zoom))) / 2;
}

/**
 * Half the width of a river's floodplain at level z, in world units, before its biome's share.
 */
export const bankHalfWidth = (flow, z) =>
  Math.max(BANK_MIN_PX * pixelSize(z), BANK_WIDTHS * trueWidth(flow));

/**
 * Whether points of an area are floodplain at level z: land of a biome in BANK_BIOMES within
 * its share of bankHalfWidth of a river course drawn at that level. Floodplains are not in
 * WorldSampler.sampleAt, which the courses themselves read (see findCourse): tiles and the
 * pointer apply them over the sampled biome, each at a cell's site.
 *
 * @param sampler {WorldSampler}
 * @param area the points to test are in it, [minX, minY, maxX, maxY]
 * @returns {function(Number, Number, Number): boolean} (x, y, biome) => floodplain
 */
export function banks(sampler, z, [minX, minY, maxX, maxY]) {
  const rivers = sampler.rivers;
  if (!rivers || rivers.flow.length === 0) return () => false;
  // Edges come largest flow first: no band is wider than the first one's
  const reach = bankHalfWidth(rivers.flow[0], z);
  const padded = [minX - reach, minY - reach, maxX + reach, maxY + reach];
  // x0, y0, x1, y1, half width of each segment that may reach the area
  const segments = [];
  for (const { course, flow } of riverCourses(sampler, z, padded)) {
    const half = bankHalfWidth(flow, z);
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [px, py, qx, qy] = [course[i], course[i + 1], course[i + 2], course[i + 3]];
      if (Math.max(px, qx) + half < minX || Math.min(px, qx) - half > maxX) continue;
      if (Math.max(py, qy) + half < minY || Math.min(py, qy) - half > maxY) continue;
      segments.push(px, py, qx, qy, half);
    }
  }
  return (x, y, biome) => {
    const share = BANK_SHARES[biome];
    if (!share) return false;
    for (let i = 0; i < segments.length; i += 5) {
      const [px, py, qx, qy] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
      const band = share * segments[i + 4];
      if (x < Math.min(px, qx) - band || x > Math.max(px, qx) + band) continue;
      if (y < Math.min(py, qy) - band || y > Math.max(py, qy) + band) continue;
      if (segmentDistance(x, y, px, py, qx, qy) <= band) return true;
    }
    return false;
  };
}

/**
 * Whether (x, y), of the given biome, is floodplain at level z, see banks.
 */
export const bankAt = (sampler, x, y, z, biome) =>
  BANK_SHARES[biome] > 0 && banks(sampler, z, [x, y, x, y])(x, y, biome);

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
 * The nearest deep water from (x, y) at level z (see deepWater), or with deep false any water,
 * looked for in 16 directions, ring by ring (4 pixels, at least 5 world units, apart).
 *
 * @param sampler {WorldSampler}
 * @returns {Number[]|null} [x, y], or null when there is none within maxReach(z)
 */
export function nearestWater(sampler, x, y, z, { deep = true } = {}) {
  const isWater = deep
    ? (px, py) => deepWater(sampler, px, py, z)
    : (px, py) => !sampler.sampleAt(px, py, z).land;
  const step = Math.max(5, 4 * pixelSize(z));
  for (let radius = step; radius <= maxReach(z); radius += step) {
    for (let k = 0; k < 16; k++) {
      const angle = (k * Math.PI) / 8;
      const [px, py] = [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
      if (isWater(px, py)) return [px, py];
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
 * lake, when this level does not draw deep water there, a meander on to the nearest that it does
 * (or, with none within reach, to the nearest water it draws).
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
    const water =
      nearestWater(sampler, bx, by, z) ??
      (sampler.sampleAt(bx, by, z).land ? nearestWater(sampler, bx, by, z, { deep: false }) : null);
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
  const { flow } = rivers;
  const { bounds, halves } = edgeBounds(sampler, z);
  // Edges come largest flow first
  for (let k = 0; k < halves.length; k++) {
    if (
      bounds[4 * k + 2] >= minX &&
      bounds[4 * k] <= maxX &&
      bounds[4 * k + 3] >= minY &&
      bounds[4 * k + 1] <= maxY
    ) {
      yield { course: riverCourse(sampler, k, z), flow: flow[k], half: halves[k] };
    }
  }
}

/**
 * The boxes of the edges drawn at level z, by sampler then level: riverCourses asks for them at
 * every tile and at every move of the pointer, and computing their widths is most of its time.
 */
const edgeBoxes = new WeakMap();

/**
 * The edges drawn at level z, largest first: the box each course stays in, padded by its
 * largest half width (minX, minY, maxX, maxY per edge), and that half width, see maxHalfWidth.
 *
 * @param sampler {WorldSampler}
 * @returns {{bounds: Float64Array, halves: Float64Array}}
 */
function edgeBounds(sampler, z) {
  let known = edgeBoxes.get(sampler);
  if (!known) {
    known = new Map();
    edgeBoxes.set(sampler, known);
  }
  let boxes = known.get(z);
  if (boxes) return boxes;
  const threshold = riverThreshold(z);
  const { sites, from, to, flow, mouth } = sampler.rivers;
  let count = 0;
  while (count < flow.length && flow[count] >= threshold) count++;
  const bounds = new Float64Array(4 * count);
  const halves = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const [a, b] = [from[k], to[k]];
    const [ax, ay, bx, by] = [sites[2 * a], sites[2 * a + 1], sites[2 * b], sites[2 * b + 1]];
    const half = maxHalfWidth(flow[k], z);
    // A course strays at most about 0.36 of its length from its edge (and its reach from b)
    const pad = Math.hypot(bx - ax, by - ay) / 2 + half + (mouth[k] ? 1.4 * maxReach(z) : 0);
    bounds.set(
      [
        Math.min(ax, bx) - pad,
        Math.min(ay, by) - pad,
        Math.max(ax, bx) + pad,
        Math.max(ay, by) + pad,
      ],
      4 * k,
    );
    halves[k] = half;
  }
  boxes = { bounds, halves };
  known.set(z, boxes);
  return boxes;
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

/**
 * The squares of a grid anchored in the world, `cell` wide, that a river of level z covers in
 * part at any zoom the level is drawn at (see drawnHalfWidth): the vegetation marks leave them
 * bare, as a river drawn over a mark would cut it (see MARK_SPACING_PX).
 *
 * @param sampler {WorldSampler}
 * @param area the squares that reach into it are returned, [minX, minY, maxX, maxY]
 * @returns {{origin: Number[], size: Number[], blocked: Uint8Array}} the first square's column
 *          and row, the number of columns and rows, and 255 per covered square (0 otherwise),
 *          row by row from origin
 */
export function riverSquares(sampler, z, cell, [minX, minY, maxX, maxY]) {
  const [i0, j0] = [Math.floor(minX / cell), Math.floor(minY / cell)];
  const [columns, rows] = [Math.floor(maxX / cell) - i0 + 1, Math.floor(maxY / cell) - j0 + 1];
  const blocked = new Uint8Array(columns * rows);
  const squares = [i0 * cell, j0 * cell, (i0 + columns) * cell, (j0 + rows) * cell];
  const column = (x) => Math.min(Math.max(Math.floor(x / cell) - i0, 0), columns - 1);
  const row = (y) => Math.min(Math.max(Math.floor(y / cell) - j0, 0), rows - 1);
  for (const { course, flow } of riverCourses(sampler, z, squares)) {
    const half = drawnHalfWidth(flow, z);
    for (let k = 0; k + 3 < course.length; k += 2) {
      const [px, py, qx, qy] = [course[k], course[k + 1], course[k + 2], course[k + 3]];
      if (Math.max(px, qx) + half < squares[0] || Math.min(px, qx) - half > squares[2]) continue;
      if (Math.max(py, qy) + half < squares[1] || Math.min(py, qy) - half > squares[3]) continue;
      for (let j = row(Math.min(py, qy) - half); j <= row(Math.max(py, qy) + half); j++) {
        for (let i = column(Math.min(px, qx) - half); i <= column(Math.max(px, qx) + half); i++) {
          if (blocked[j * columns + i]) continue;
          const [x0, y0] = [(i0 + i) * cell, (j0 + j) * cell];
          if (segmentBoxDistance(px, py, qx, qy, [x0, y0, x0 + cell, y0 + cell]) <= half) {
            blocked[j * columns + i] = 255;
          }
        }
      }
    }
  }
  return { origin: [i0, j0], size: [columns, rows], blocked };
}

/**
 * Whether points of an area are within a margin of a river of level z as drawn at any zoom the
 * level is drawn at (see drawnHalfWidth): the vegetation marks leave out a tree whose crown a
 * river would cut, see trees.js treeGrid.
 *
 * @param sampler {WorldSampler}
 * @param area the points to test are in it, [minX, minY, maxX, maxY]
 * @param margin in world units, added to each river's half width
 * @returns {function(Number, Number): boolean} (x, y) => near a river
 */
export function nearRivers(sampler, z, [minX, minY, maxX, maxY], margin) {
  const rivers = sampler.rivers;
  if (!rivers || rivers.flow.length === 0) return () => false;
  // Edges come largest flow first: no river is wider than the first one
  const reach = drawnHalfWidth(rivers.flow[0], z) + margin;
  const padded = [minX - reach, minY - reach, maxX + reach, maxY + reach];
  // x0, y0, x1, y1, reach of each segment that may come near the area
  const segments = [];
  for (const { course, flow } of riverCourses(sampler, z, padded)) {
    const near = drawnHalfWidth(flow, z) + margin;
    for (let i = 0; i + 3 < course.length; i += 2) {
      const [px, py, qx, qy] = [course[i], course[i + 1], course[i + 2], course[i + 3]];
      if (Math.max(px, qx) + near < minX || Math.min(px, qx) - near > maxX) continue;
      if (Math.max(py, qy) + near < minY || Math.min(py, qy) - near > maxY) continue;
      segments.push(px, py, qx, qy, near);
    }
  }
  return (x, y) => {
    for (let i = 0; i < segments.length; i += 5) {
      const [px, py, qx, qy] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
      const near = segments[i + 4];
      if (x < Math.min(px, qx) - near || x > Math.max(px, qx) + near) continue;
      if (y < Math.min(py, qy) - near || y > Math.max(py, qy) + near) continue;
      if (segmentDistance(x, y, px, py, qx, qy) <= near) return true;
    }
    return false;
  };
}

// The distance from the segment from p to q to a box [minX, minY, maxX, maxY]: 0 if they meet,
// else from one's corner to the other, the nearest points of two convex shapes apart
function segmentBoxDistance(px, py, qx, qy, box) {
  const [minX, minY, maxX, maxY] = box;
  // Clips the segment to the box (Liang–Barsky): some of it is left if they meet
  const [dx, dy] = [qx - px, qy - py];
  let [t0, t1] = [0, 1];
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    return t0 <= t1;
  };
  if (clip(-dx, px - minX) && clip(dx, maxX - px) && clip(-dy, py - minY) && clip(dy, maxY - py)) {
    return 0;
  }
  const outside = (x, y) =>
    Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minY - y, 0, y - maxY));
  return Math.min(
    outside(px, py),
    outside(qx, qy),
    segmentDistance(minX, minY, px, py, qx, qy),
    segmentDistance(maxX, minY, px, py, qx, qy),
    segmentDistance(minX, maxY, px, py, qx, qy),
    segmentDistance(maxX, maxY, px, py, qx, qy),
  );
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
