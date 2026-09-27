import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { aleaPRNG } from "../vendor/alea-prng.js";
import { WorldSampler } from "./fields.js";

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
export const LAKE_DEPTH = 0.06;

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
 * @returns {{sites: Float64Array, land: Uint8Array, height: Float64Array, filled: Float64Array,
 *            downstream: Int32Array, flow: Float32Array, lakes: Uint8Array}}
 *          downstream is the neighbour a land point drains to, -1 at sea
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
  const height = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y] = [sites[2 * i], sites[2 * i + 1]];
    land[i] = sampler.sampleAt(x, y, 0).land ? 1 : 0;
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

  return { sites, land, height, filled, downstream, flow, lakes };
}

/**
 * The water of a world, as typed arrays a worker can post: the water mesh, its lake points and
 * its river edges (from a point to its downstream neighbour), largest flow first.
 *
 * @param sampler {WorldSampler} of a world without water
 * @returns {{waterSites: Float64Array, lakes: Uint8Array, riverFrom: Uint32Array,
 *            riverTo: Uint32Array, riverFlow: Float32Array, riverMouth: Uint8Array}}
 *          riverMouth is 1 for an edge that ends in the sea or a lake
 */
export function generateWater(sampler) {
  const { sites, land, downstream, flow, lakes } = computeDrainage(sampler);
  const edges = [];
  for (let i = 0; i < flow.length; i++) {
    const to = downstream[i];
    // Water crossing a lake is the lake; its outlet is a river again. Land drains nowhere only
    // in a world without sea.
    if (!land[i] || to < 0 || flow[i] < MIN_RIVER_FLOW || (lakes[i] && lakes[to])) continue;
    edges.push(i);
  }
  edges.sort((a, b) => flow[b] - flow[a] || a - b);
  return {
    waterSites: sites,
    lakes,
    riverFrom: Uint32Array.from(edges),
    riverTo: Uint32Array.from(edges, (i) => downstream[i]),
    riverFlow: Float32Array.from(edges, (i) => flow[i]),
    riverMouth: Uint8Array.from(edges, (i) => {
      const to = downstream[i];
      return !land[to] || lakes[to] ? 1 : 0;
    }),
  };
}

/**
 * A base world with its water, see world.js MapGenerator#toBaseWorld and generateWater.
 */
export const withWater = (base) => ({ ...base, ...generateWater(new WorldSampler(base)) });
