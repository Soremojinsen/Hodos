import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { aleaPRNG } from "../vendor/alea-prng.js";
import { DELTA_POINT, SWAMP_POINT, WorldSampler } from "./fields.js";
import { BIOME_DEFINITIONS, SWAMP_BIOMES } from "./biomes.js";

/**
 * The water mesh has WATER_MESH_SIDE² points, one per square of a grid over the world
 * (about 40 world units apart), fine enough for the small tributaries of the deepest levels.
 */
export const WATER_MESH_SIDE = 256;

/**
 * The level whose altitude the water flows on: detailed enough for winding valleys, and the same
 * at every level, so rivers do not move when zooming.
 */
export const WATER_LEVEL = 3;

/**
 * A basin becomes a lake when filling it raises at least MIN_LAKE_POINTS connected points by
 * more than LAKE_DEPTH; shallower or smaller pits are only filled, and rivers cross them.
 */
export const MIN_LAKE_POINTS = 12;
export const LAKE_DEPTH = 0.15;

/**
 * The smallest flow (in points drained, each bringing one unit of rain) that makes a river.
 */
export const MIN_RIVER_FLOW = 4;

/**
 * How far a point may move from the centre of its grid square, as a share of the square.
 */
const JITTER = 0.8;

/**
 * How much each filled point is raised above the one it spills into, so filled flats still
 * slope towards their outlet.
 */
const FILL_STEP = 1e-5;

/**
 * A land point becomes a swamp where a slow river crosses low land: its base biome is one of
 * SWAMP_BIOMES, it is lower than SWAMP_MAX_ALTITUDE, it or a neighbour carries at least
 * SWAMP_FLOW, and it lies in a pit the fill raised by more than SWAMP_PIT_DEPTH (too shallow or
 * small for a lake) or drops less than SWAMP_GRADIENT per world unit to its downstream point.
 * Groups of fewer than MIN_SWAMP_POINTS such points are dropped; the others spread one ring.
 * Measured on three seeds: of the ~500–780 low river points in swamp biomes, about 65 % lie in
 * filled pits, and about a tenth of the others drop less than 3e-4.
 */
export const SWAMP_MAX_ALTITUDE = 0.35;
export const SWAMP_FLOW = 16;
export const SWAMP_PIT_DEPTH = 0.03;
export const SWAMP_GRADIENT = 3e-4;
export const MIN_SWAMP_POINTS = 3;

/**
 * A river that reaches the sea with a flow of at least DELTA_FLOW ends in a delta (measured: 3
 * to 12 mouths per world): the sea beyond its mouth becomes land over a fan DELTA_RADIUS ×
 * √(flow / DELTA_FLOW) world units long, DELTA_SPREAD either side of the river's direction
 * (from DELTA_DIRECTION_EDGES points upstream of the mouth to the sea). The rim is lobed: its
 * radius varies by up to DELTA_LOBES / 2 either way, between DELTA_KNOTS random values across
 * the fan. The river forks into channels over the fan, each step DELTA_WANDER longer at most
 * at random, so the channels do not run straight.
 */
export const DELTA_FLOW = 256;
export const DELTA_RADIUS = 120;
export const DELTA_SPREAD = Math.PI / 3;
export const DELTA_KNOTS = 5;
export const DELTA_LOBES = 0.5;
export const DELTA_WANDER = 0.5;
export const DELTA_DIRECTION_EDGES = 3;
const biomeId = (name) => BIOME_DEFINITIONS.findIndex((definition) => definition.name === name);
const SWAMPY = new Set(SWAMP_BIOMES.map(biomeId));
const SWAMP = biomeId("Swamp");
const FLOODPLAIN = biomeId("floodplain");
const DRY = new Set(["Desert", "Savana"].map(biomeId));

/**
 * A binary heap of values by increasing key.
 */
class MinHeap {
  #keys = [];
  #values = [];

  get size() {
    return this.#keys.length;
  }

  push(key, value) {
    const keys = this.#keys;
    const values = this.#values;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  pop() {
    const keys = this.#keys;
    const values = this.#values;
    const top = values[0];
    const lastKey = keys.pop();
    const lastValue = values.pop();
    if (keys.length > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = left < keys.length && keys[left] < lastKey ? left : -1;
        if (right < keys.length && keys[right] < (smallest < 0 ? lastKey : keys[smallest])) {
          smallest = right;
        }
        if (smallest < 0) break;
        keys[i] = keys[smallest];
        values[i] = values[smallest];
        i = smallest;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return top;
  }
}

/**
 * How water drains over the world, on a jittered grid of points drawn from the seed only.
 *
 * @param sampler {WorldSampler} of a world without water
 * @returns {{sites: Float64Array, land: Uint8Array, biome: Uint8Array, continent: Uint16Array,
 *            height: Float64Array, filled: Float64Array, downstream: Int32Array, flow: Float32Array,
 *            lakes: Uint8Array, delaunay: Delaunay}}
 *          downstream is the neighbour a land point drains to, -1 at sea
 *          biome and continent are each point's level-0 sample
 */
export function computeDrainage(sampler) {
  const random = aleaPRNG(`${sampler.seed}:water`);
  const count = WATER_MESH_SIDE ** 2;
  const step = WORLD_SIZE / WATER_MESH_SIDE;
  const sites = new Float64Array(2 * count);
  for (let row = 0, i = 0; row < WATER_MESH_SIDE; row++) {
    for (let col = 0; col < WATER_MESH_SIDE; col++, i++) {
      sites[2 * i] = (col + 0.5 + JITTER * (random() - 0.5)) * step;
      sites[2 * i + 1] = (row + 0.5 + JITTER * (random() - 0.5)) * step;
    }
  }
  const delaunay = new Delaunay(sites);
  const neighbors = (i) => delaunay.neighbors(i);

  const land = new Uint8Array(count);
  const biome = new Uint8Array(count);
  const continent = new Uint16Array(count);
  const height = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y] = [sites[2 * i], sites[2 * i + 1]];
    const sample = sampler.sampleAt(x, y, 0);
    land[i] = sample.land ? 1 : 0;
    biome[i] = sample.biome;
    continent[i] = sample.continent;
    height[i] = land[i] ? sampler.altitudeAt(x, y, WATER_LEVEL) : -Infinity;
  }

  // Priority flood from the sea: each land point is reached from its lowest way out
  const filled = Float64Array.from(height);
  const reached = new Uint8Array(count);
  const heap = new MinHeap();
  for (let i = 0; i < count; i++) {
    if (!land[i]) {
      reached[i] = 1;
      heap.push(-Infinity, i);
    }
  }
  while (heap.size > 0) {
    const i = heap.pop();
    for (const j of neighbors(i)) {
      if (reached[j]) continue;
      reached[j] = 1;
      filled[j] = Math.max(height[j], filled[i] + FILL_STEP);
      heap.push(filled[j], j);
    }
  }

  // Each land point drains to its lowest neighbour, always lower after filling
  const downstream = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    if (!land[i]) continue;
    let lowest = filled[i];
    for (const j of neighbors(i)) {
      if (filled[j] < lowest) {
        lowest = filled[j];
        downstream[i] = j;
      }
    }
  }

  // Lakes: large enough groups of points raised deep enough by the fill
  const lakes = new Uint8Array(count);
  const raised = (i) => land[i] === 1 && filled[i] - height[i] > LAKE_DEPTH;
  const grouped = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (grouped[i] || !raised(i)) continue;
    const group = [i];
    grouped[i] = 1;
    for (let k = 0; k < group.length; k++) {
      for (const j of neighbors(group[k])) {
        if (!grouped[j] && raised(j)) {
          grouped[j] = 1;
          group.push(j);
        }
      }
    }
    if (group.length >= MIN_LAKE_POINTS) for (const j of group) lakes[j] = 1;
  }

  // Flow: one unit of rain per land point, passed on from the highest points down
  const order = [];
  for (let i = 0; i < count; i++) if (land[i]) order.push(i);
  order.sort((a, b) => filled[b] - filled[a]);
  const flow = new Float32Array(count);
  for (const i of order) {
    flow[i] += 1;
    flow[downstream[i]] += flow[i];
  }

  return { sites, land, biome, continent, height, filled, downstream, flow, lakes, delaunay };
}

/**
 * What the water makes of the land around it, on the water mesh: swamps along slow rivers, and
 * deltas at the mouths of great rivers into the sea (see growDelta).
 *
 * @param seed the world's seed, for the deltas' shapes
 * @param drainage see computeDrainage
 * @returns {{wetlands: Uint8Array, deltaBiome: Uint8Array, deltaContinent: Uint16Array,
 *            removed: Uint8Array, channels: {from: Number, to: Number, flow: Number,
 *            mouth: Number}[]}}
 *          wetlands: 0, SWAMP_POINT or DELTA_POINT per point; deltaBiome and deltaContinent: the
 *          biome and continent of each delta point; removed: 1 for a mouth whose edge to the sea
 *          its delta's channels replace
 */
export function computeWetlands(seed, drainage) {
  const { sites, land, biome, height, filled, downstream, flow, lakes, delaunay } = drainage;
  const count = land.length;
  const wetlands = new Uint8Array(count);
  const distance = (i, j) =>
    Math.hypot(sites[2 * j] - sites[2 * i], sites[2 * j + 1] - sites[2 * i + 1]);

  const eligible = (i) =>
    land[i] === 1 && !lakes[i] && SWAMPY.has(biome[i]) && height[i] < SWAMP_MAX_ALTITUDE;
  const byRiver = (i) => {
    if (flow[i] >= SWAMP_FLOW) return true;
    for (const j of delaunay.neighbors(i)) if (land[j] && flow[j] >= SWAMP_FLOW) return true;
    return false;
  };
  const slow = (i) => {
    const j = downstream[i];
    if (filled[i] - height[i] > SWAMP_PIT_DEPTH) return true;
    return j >= 0 && (filled[i] - filled[j]) / distance(i, j) < SWAMP_GRADIENT;
  };
  const core = (i) => eligible(i) && byRiver(i) && slow(i);
  const grouped = new Uint8Array(count);
  const kept = [];
  for (let i = 0; i < count; i++) {
    if (grouped[i] || !core(i)) continue;
    const group = [i];
    grouped[i] = 1;
    for (let k = 0; k < group.length; k++) {
      for (const j of delaunay.neighbors(group[k])) {
        if (!grouped[j] && core(j)) {
          grouped[j] = 1;
          group.push(j);
        }
      }
    }
    if (group.length >= MIN_SWAMP_POINTS) kept.push(...group);
  }
  for (const i of kept) {
    wetlands[i] = SWAMP_POINT;
    for (const j of delaunay.neighbors(i)) if (eligible(j)) wetlands[j] = SWAMP_POINT;
  }

  // Deltas, largest river first: a later delta cannot take an earlier one's points
  const { continent } = drainage;
  const deltaBiome = new Uint8Array(count);
  const deltaContinent = new Uint16Array(count);
  const removed = new Uint8Array(count);
  const channels = [];
  const mouths = [];
  for (let i = 0; i < count; i++) {
    const to = downstream[i];
    if (land[i] && !lakes[i] && to >= 0 && !land[to] && flow[i] >= DELTA_FLOW) mouths.push(i);
  }
  mouths.sort((a, b) => flow[b] - flow[a] || a - b);
  // The sea points rivers end in must stay sea, so these rivers still reach the water
  const drained = new Map();
  for (let i = 0; i < count; i++) {
    const to = downstream[i];
    if (land[i] && to >= 0 && !land[to] && flow[i] >= MIN_RIVER_FLOW) {
      drained.set(to, (drained.get(to) ?? 0) + 1);
    }
  }
  const outlets = new Set();
  for (const m of mouths) {
    const reserved = (j) =>
      outlets.has(j) || (drained.get(j) ?? 0) - (j === downstream[m] ? 1 : 0) > 0;
    const delta = growDelta(seed, drainage, m, wetlands, reserved);
    if (!delta) continue;
    for (const c of delta.channels) if (c.mouth) outlets.add(c.to);
    removed[m] = 1;
    const kind = SWAMPY.has(biome[m]) ? SWAMP : DRY.has(biome[m]) ? FLOODPLAIN : biome[m];
    for (const j of delta.fan) {
      wetlands[j] = DELTA_POINT;
      deltaBiome[j] = kind;
      deltaContinent[j] = continent[m];
    }
    channels.push(...delta.channels);
  }
  return { wetlands, deltaBiome, deltaContinent, removed, channels };
}

/**
 * The delta of the river mouth m: the sea points of its fan, and its channels, from m to up to
 * 2–5 points of the fan's rim and on into the sea, sharing the river's flow. Null when the fan
 * has no rim point (no sea beside it outside this and earlier deltas).
 *
 * @param wetlands the points already taken by earlier deltas are DELTA_POINT
 * @param reserved {function(Number): Boolean} sea points the fan must not take: those other rivers
 *        or earlier deltas' channels end in
 * @returns {{fan: Number[], channels: {from, to, flow, mouth}[]}|null}
 */
function growDelta(seed, drainage, m, wetlands, reserved) {
  const { sites, land, downstream, flow, delaunay } = drainage;
  const random = aleaPRNG(`${seed}:delta:${m}`);
  const distance = (i, j) =>
    Math.hypot(sites[2 * j] - sites[2 * i], sites[2 * j + 1] - sites[2 * i + 1]);
  const [mx, my] = [sites[2 * m], sites[2 * m + 1]];

  // The river's direction: from a few points upstream, along its largest inflow, to the sea
  let source = m;
  for (let n = 0; n < DELTA_DIRECTION_EDGES; n++) {
    let best = -1;
    for (const j of delaunay.neighbors(source)) {
      if (downstream[j] === source && (best < 0 || flow[j] > flow[best])) best = j;
    }
    if (best < 0) break;
    source = best;
  }
  const sea = downstream[m];
  const direction = Math.atan2(
    sites[2 * sea + 1] - sites[2 * source + 1],
    sites[2 * sea] - sites[2 * source],
  );

  // The rim's radius across the fan, from -DELTA_SPREAD to DELTA_SPREAD, eased between knots
  const radius = DELTA_RADIUS * Math.sqrt(flow[m] / DELTA_FLOW);
  const knots = Array.from(
    { length: DELTA_KNOTS },
    () => radius * (1 + DELTA_LOBES * (random() - 0.5)),
  );
  const rim = (angle) => {
    const t = ((angle + DELTA_SPREAD) / (2 * DELTA_SPREAD)) * (DELTA_KNOTS - 1);
    const k = Math.min(Math.floor(t), DELTA_KNOTS - 2);
    const f = (1 - Math.cos(Math.PI * (t - k))) / 2;
    return knots[k] * (1 - f) + knots[k + 1] * f;
  };
  const angleOf = (j) => {
    const a = Math.atan2(sites[2 * j + 1] - my, sites[2 * j] - mx) - direction;
    return Math.atan2(Math.sin(a), Math.cos(a));
  };
  const free = (j) => !land[j] && wetlands[j] !== DELTA_POINT;
  const inFan = (j) => {
    if (!free(j) || reserved(j)) return false;
    const angle = angleOf(j);
    return Math.abs(angle) <= DELTA_SPREAD && distance(m, j) <= rim(angle);
  };

  // The fan: the points reached from m through fan points, so it never jumps over land
  const fan = [];
  const inside = new Set();
  const queue = [m];
  for (let q = 0; q < queue.length; q++) {
    for (const j of delaunay.neighbors(queue[q])) {
      if (!inside.has(j) && inFan(j)) {
        inside.add(j);
        fan.push(j);
        queue.push(j);
      }
    }
  }

  // The rim: fan points beside free sea outside the fan, each with its nearest such point
  const outlet = new Map();
  for (const j of fan) {
    let best = -1;
    for (const n of delaunay.neighbors(j)) {
      if (free(n) && !inside.has(n) && (best < 0 || distance(j, n) < distance(j, best))) best = n;
    }
    if (best >= 0) outlet.set(j, best);
  }
  if (outlet.size === 0) return null;

  // Up to K rim points, spread across the fan's angles
  // (at most as many as leave each with DELTA_FLOW / 2 of the flow, so that every channel of a
  // delta is drawn from DELTA_MIN_LEVEL on, see fields.js)
  const count = Math.min(
    Math.max(2 + Math.round(Math.log2(flow[m] / DELTA_FLOW)), 2),
    5,
    Math.floor(flow[m] / (DELTA_FLOW / 2)),
  );
  const rims = [...outlet.keys()].sort((a, b) => angleOf(a) - angleOf(b) || a - b);
  const [low, high] = [angleOf(rims[0]), angleOf(rims[rims.length - 1])];
  const chosen = [];
  for (let b = 0; b < count; b++) {
    const target = low + ((b + 0.5) * (high - low)) / count;
    let best = rims[0];
    for (const r of rims)
      if (Math.abs(angleOf(r) - target) < Math.abs(angleOf(best) - target)) best = r;
    if (!chosen.includes(best)) chosen.push(best);
  }

  // Shortest paths from m through the fan, each step made longer at random
  const wander = new Map(fan.map((j) => [j, 1 + DELTA_WANDER * random()]));
  const cost = new Map([[m, 0]]);
  const parent = new Map();
  const done = new Set();
  const heap = new MinHeap();
  heap.push(0, m);
  while (heap.size > 0) {
    const i = heap.pop();
    if (done.has(i)) continue;
    done.add(i);
    for (const j of delaunay.neighbors(i)) {
      if (!inside.has(j)) continue;
      const c = cost.get(i) + distance(i, j) * wander.get(j);
      if (c < (cost.get(j) ?? Infinity)) {
        cost.set(j, c);
        parent.set(j, i);
        heap.push(c, j);
      }
    }
  }

  // The channels: the paths' edges, each with its share of the flow, and one edge per rim point
  // on into the sea
  const below = new Map();
  for (const r of chosen) {
    for (let j = r; j !== m; j = parent.get(j)) below.set(j, (below.get(j) ?? 0) + 1);
  }
  const share = flow[m] / chosen.length;
  const channels = [];
  for (const [j, n] of below)
    channels.push({ from: parent.get(j), to: j, flow: share * n, mouth: 0 });
  for (const r of chosen) channels.push({ from: r, to: outlet.get(r), flow: share, mouth: 1 });
  return { fan, channels };
}

/**
 * The water of a world, as typed arrays a worker can post: the water mesh, its lake points and
 * its river edges (from a point to its downstream neighbour), largest flow first.
 *
 * @param sampler {WorldSampler} of a world without water
 * @returns {{waterSites: Float64Array, lakes: Uint8Array, wetlands: Uint8Array,
 *            deltaBiome: Uint8Array, deltaContinent: Uint16Array, riverFrom: Uint32Array,
 *            riverTo: Uint32Array, riverFlow: Float32Array, riverMouth: Uint8Array}}
 *          riverMouth is 1 for an edge that ends in the sea or a lake; the river edges include
 *          the deltas' channels
 */
export function generateWater(sampler) {
  const drainage = computeDrainage(sampler);
  const { sites, land, downstream, flow, lakes } = drainage;
  const { wetlands, deltaBiome, deltaContinent, removed, channels } = computeWetlands(
    sampler.seed,
    drainage,
  );
  const edges = [];
  for (let i = 0; i < flow.length; i++) {
    const to = downstream[i];
    // Water crossing a lake is the lake; its outlet is a river again. Land drains nowhere only
    // in a world without sea. A delta's channels replace its mouth's edge.
    if (!land[i] || to < 0 || flow[i] < MIN_RIVER_FLOW || (lakes[i] && lakes[to]) || removed[i]) {
      continue;
    }
    edges.push({ from: i, to, flow: flow[i], mouth: !land[to] || lakes[to] ? 1 : 0 });
  }
  edges.push(...channels);
  edges.sort((a, b) => b.flow - a.flow || a.from - b.from || a.to - b.to);
  return {
    waterSites: sites,
    lakes,
    wetlands,
    deltaBiome,
    deltaContinent,
    riverFrom: Uint32Array.from(edges, (e) => e.from),
    riverTo: Uint32Array.from(edges, (e) => e.to),
    riverFlow: Float32Array.from(edges, (e) => e.flow),
    riverMouth: Uint8Array.from(edges, (e) => e.mouth),
  };
}

/**
 * A base world with its water, see world.js MapGenerator#toBaseWorld and generateWater.
 */
export const withWater = (base) => ({ ...base, ...generateWater(new WorldSampler(base)) });
