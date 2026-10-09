import { aleaPRNG } from "../vendor/alea-prng.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
import { RANGE_ALTITUDE } from "./features.js";
import { MIN_RIVER_FLOW, WATER_LEVEL } from "./hydrology.js";
import { cultureAt } from "./names/names.js";
import { riverAt } from "./rivers.js";

/**
 * The kinds of settlements, largest first.
 */
export const SETTLEMENT_KINDS = ["capital", "city", "town", "village"];

/**
 * How much each biome draws settlements, from 0 (none) to 1. Biomes left out draw none: deserts
 * (but see DESERT_RIVER_FACTOR), tundra, swamps, mountains and water.
 */
export const LAND_FACTORS = {
  Plain: 1,
  Forest: 0.8,
  Savana: 0.6,
  Taiga: 0.5,
  Jungle: 0.5,
  Fairy: 0.5,
  Corrupted: 0.2,
};

/**
 * A desert draws settlements only along its rivers, as the Nile does.
 */
export const DESERT_RIVER_FACTOR = 0.8;

/**
 * What water near a point is worth: none, a coast, a lake shore, a river (from its smallest, at
 * MIN_RIVER_FLOW, to its largest, at RIVER_FULL_FLOW and above), plus a river's mouth and a
 * confluence (two rivers or more flowing into the point).
 */
export const DRY_WATER = 0.25;
export const COAST_WATER = 0.7;
export const LAKE_WATER = 0.7;
export const RIVER_WATER = [0.5, 1];
export const RIVER_FULL_FLOW = 1024;
export const MOUTH_BONUS = 0.3;
export const CONFLUENCE_BONUS = 0.2;

/**
 * The height difference to a neighbouring point that halves a point's score: settlements keep to
 * gentle ground.
 */
export const STEEPNESS = 0.15;

/**
 * The passes that pick settlements, largest first: each keeps the best points from MIN_SCORE up,
 * at least SPACING world units from every settlement kept before, in any pass.
 */
export const SPACING = { city: 600, town: 250, village: 100 };
export const MIN_SCORE = { city: 0.4, town: 0.22, village: 0.1 };
const PASSES = ["city", "town", "village"];

/**
 * A settlement stands on land at SNAP_LEVEL, the finest, at least RIVER_CLEARANCE world units
 * from the rivers drawn there: the first such point at SNAP_RADII from its water mesh point, in
 * SNAP_DIRECTIONS directions (within half the mesh's step).
 */
export const SNAP_LEVEL = 7;
export const SNAP_RADII = [0, 6, 12, 18];
export const SNAP_DIRECTIONS = 8;
export const RIVER_CLEARANCE = 3;

const SWAMP = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "Swamp");

// The 8 neighbours of a point of a side × side grid
const gridNeighbors = (i, side) => {
  const [col, row] = [i % side, Math.floor(i / side)];
  const out = [];
  for (let r = Math.max(row - 1, 0); r <= Math.min(row + 1, side - 1); r++) {
    for (let c = Math.max(col - 1, 0); c <= Math.min(col + 1, side - 1); c++) {
      if (r !== row || c !== col) out.push(r * side + c);
    }
  }
  return out;
};

/**
 * The rivers at each water mesh point: the largest flow of the river edges it starts or ends,
 * how many edges flow into it, and whether an edge from it ends in the sea or a lake.
 *
 * @param base see hydrology.js withWater
 */
export function riverWater(base) {
  const count = base.waterLand.length;
  const flow = new Float32Array(count);
  const inflows = new Uint8Array(count);
  const mouth = new Uint8Array(count);
  for (let e = 0; e < base.riverFrom.length; e++) {
    const [from, to, f] = [base.riverFrom[e], base.riverTo[e], base.riverFlow[e]];
    flow[from] = Math.max(flow[from], f);
    if (base.waterLand[to]) flow[to] = Math.max(flow[to], f);
    inflows[to] = Math.min(inflows[to] + 1, 255);
    if (base.riverMouth[e]) mouth[from] = 1;
  }
  return { flow, inflows, mouth };
}

/**
 * How much each water mesh point draws a settlement: its water (see DRY_WATER and after) times
 * its land (LAND_FACTORS) times its terrain, lower as it is higher and steeper. Zero at sea, on
 * lakes, at RANGE_ALTITUDE and above, and on land that draws none.
 *
 * @param base    see hydrology.js withWater
 * @param sampler {WorldSampler} of base
 * @param world   see features.js worldGeometry
 */
export function scorePoints(base, sampler, world) {
  const { waterLand, lakes, waterHeight, waterSites } = base;
  const rivers = riverWater(base);
  const scores = new Float32Array(waterLand.length);
  const riverSpan = Math.log2(RIVER_FULL_FLOW / MIN_RIVER_FLOW);
  for (let i = 0; i < waterLand.length; i++) {
    const height = waterHeight[i];
    if (!waterLand[i] || lakes[i] || height >= RANGE_ALTITUDE) continue;
    const { biome } = sampler.sampleAt(waterSites[2 * i], waterSites[2 * i + 1], WATER_LEVEL);
    const name = BIOME_DEFINITIONS[biome].name;
    const onRiver = rivers.flow[i] > 0;
    const land = name === "Desert" && onRiver ? DESERT_RIVER_FACTOR : (LAND_FACTORS[name] ?? 0);
    if (land === 0) continue;
    let [coast, lake, steep] = [false, false, 0];
    for (const n of gridNeighbors(i, world.side)) {
      if (!waterLand[n]) coast = true;
      else if (lakes[n]) lake = true;
      else steep = Math.max(steep, Math.abs(waterHeight[n] - height));
    }
    const size = Math.min(1, Math.max(0, Math.log2(rivers.flow[i] / MIN_RIVER_FLOW) / riverSpan));
    const river = onRiver ? RIVER_WATER[0] + (RIVER_WATER[1] - RIVER_WATER[0]) * size : 0;
    const water =
      Math.max(DRY_WATER, coast ? COAST_WATER : 0, lake ? LAKE_WATER : 0, river) +
      (rivers.mouth[i] ? MOUTH_BONUS : 0) +
      (rivers.inflows[i] >= 2 ? CONFLUENCE_BONUS : 0);
    const terrain = (1 - Math.max(height, 0) / RANGE_ALTITUDE) / (1 + steep / STEEPNESS);
    scores[i] = water * land * terrain;
  }
  return scores;
}

/**
 * Whether a settlement can stand at (x, y): land at SNAP_LEVEL, not a swamp, and at least
 * RIVER_CLEARANCE from the rivers drawn there.
 *
 * @param sampler {WorldSampler}
 */
export function settles(sampler, x, y) {
  const sample = sampler.sampleAt(x, y, SNAP_LEVEL);
  if (!sample.land || sample.biome === SWAMP) return false;
  return !riverAt(sampler, x, y, SNAP_LEVEL, { margin: RIVER_CLEARANCE });
}

/**
 * The first point near (x, y) where a settlement can stand, see SNAP_RADII, or null.
 *
 * @param sampler {WorldSampler}
 */
export function snapSite(sampler, x, y) {
  for (const radius of SNAP_RADII) {
    const steps = radius === 0 ? 1 : SNAP_DIRECTIONS;
    for (let k = 0; k < steps; k++) {
      const angle = (2 * Math.PI * k) / steps;
      const [px, py] = [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
      if (settles(sampler, px, py)) return [px, py];
    }
  }
  return null;
}

/**
 * Picks settlements in passes, cities, towns then villages: each takes the points best score
 * first (ties in an order drawn from the seed), from MIN_SCORE up, keeping a point when snap
 * finds it a place at least SPACING from every settlement kept so far.
 *
 * @param scores {Float32Array} by water mesh point, see scorePoints
 * @param sites  {Float64Array} the water mesh's points, x0, y0, x1, y1, …
 * @param snap   {function(Number, Number): Number[]|null} see snapSite
 * @returns {{i: Number, x: Number, y: Number, kind: string, score: Number}[]} in the order kept
 */
export function pickSites(scores, sites, seed, snap) {
  const random = aleaPRNG(`${seed}:settlements`);
  const tie = Float64Array.from(scores, () => random());
  const order = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) order.push(i);
  order.sort((a, b) => scores[b] - scores[a] || tie[a] - tie[b]);
  const kept = [];
  const taken = new Set();
  for (const kind of PASSES) {
    const spacing = SPACING[kind] ** 2;
    for (const i of order) {
      if (scores[i] < MIN_SCORE[kind]) break;
      if (taken.has(i)) continue;
      const [mx, my] = [sites[2 * i], sites[2 * i + 1]];
      // Far enough already from the mesh point, so a snapped point is checked again below
      if (kept.some((k) => (k.x - mx) ** 2 + (k.y - my) ** 2 < spacing / 4)) continue;
      const place = snap(mx, my);
      if (!place) continue;
      const [x, y] = place;
      if (kept.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < spacing)) continue;
      kept.push({ i, x, y, kind, score: scores[i] });
      taken.add(i);
    }
  }
  return kept;
}

/**
 * The settlements with each culture's best city made its capital, or its best town if it has no
 * city. A culture with only villages has no capital.
 *
 * @param settlements {{culture: Number, kind: string, score: Number}[]}
 */
export function chooseCapitals(settlements) {
  const size = { city: 2, town: 1 };
  const best = new Map();
  settlements.forEach((s, index) => {
    if (!size[s.kind]) return;
    const current = best.has(s.culture) ? settlements[best.get(s.culture)] : null;
    if (
      !current ||
      size[s.kind] > size[current.kind] ||
      (size[s.kind] === size[current.kind] && s.score > current.score)
    ) {
      best.set(s.culture, index);
    }
  });
  return settlements.map((s, index) =>
    best.get(s.culture) === index ? { ...s, kind: "capital" } : s,
  );
}

/**
 * The world's settlements, see scorePoints, pickSites and chooseCapitals, each in the culture of
 * its place.
 *
 * @param base    see hydrology.js withWater
 * @param sampler {WorldSampler} of base
 * @param world   see features.js worldGeometry
 * @param centres see names.js placeCultureCentres
 * @returns {{id: string, kind: string, x: Number, y: Number, culture: Number, score: Number}[]}
 */
export function settlementFeatures(base, sampler, world, centres) {
  const scores = scorePoints(base, sampler, world);
  const picked = pickSites(scores, base.waterSites, base.seed, (x, y) => snapSite(sampler, x, y));
  return chooseCapitals(
    picked.map((p) => ({
      id: `settlement:${p.i}`,
      kind: p.kind,
      x: p.x,
      y: p.y,
      culture: cultureAt(centres, p.x, p.y),
      score: p.score,
    })),
  );
}
