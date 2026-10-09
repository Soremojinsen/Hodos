import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
import { MARITIME } from "./fields.js";
import { cultureAt } from "./names/names.js";
import { WATER_MESH_SIDE } from "./hydrology.js";

/**
 * Labels lean at most MAX_TILT either way, so text never stands steep.
 */
export const MAX_TILT = (25 * Math.PI) / 180;

/**
 * Islands of at least MIN_ISLAND_CELLS coarse cells are named: a coarse cell is already about
 * 300 world units wide.
 */
export const MIN_ISLAND_CELLS = 1;

/**
 * A mountain range is a group of at least MIN_RANGE_POINTS connected water mesh points at
 * RANGE_ALTITUDE or higher, the Parchemin rendering's mountain band (measured: 7 to 18 ranges a
 * world; coarse cells are too large, their groups have 7 cells at most).
 */
export const RANGE_ALTITUDE = 0.65;
export const MIN_RANGE_POINTS = 80;

/**
 * The world's graphs: the coarse cells and their Delaunay neighbours, and the water mesh as a grid
 * with 8 neighbours per point (hydrology.js computeDrainage jitters one point per grid square).
 */
export function worldGeometry(base) {
  const delaunay = new Delaunay(base.sites);
  const count = base.biomes.length;
  const side = WATER_MESH_SIDE;
  return {
    count,
    land: Uint8Array.from(base.biomes, (biome) => (MARITIME[biome] ? 0 : 1)),
    neighbors: (i) => delaunay.neighbors(i),
    cellSize: WORLD_SIZE / Math.sqrt(count),
    side,
    step: WORLD_SIZE / side,
    gridNeighbors: (i) => {
      const [col, row] = [i % side, Math.floor(i / side)];
      const out = [];
      for (let r = Math.max(row - 1, 0); r <= Math.min(row + 1, side - 1); r++) {
        for (let c = Math.max(col - 1, 0); c <= Math.min(col + 1, side - 1); c++) {
          if (r !== row || c !== col) out.push(r * side + c);
        }
      }
      return out;
    },
  };
}

/**
 * The coarse land cells' sites, x0, y0, x1, y1, …, as placeCultureCentres takes them.
 */
export function landSitesOf(base, world) {
  const sites = [];
  for (let i = 0; i < world.count; i++) {
    if (world.land[i]) sites.push(base.sites[2 * i], base.sites[2 * i + 1]);
  }
  return sites;
}

/**
 * The connected groups of the indexes below count that include accepts, each from its lowest
 * index, in breadth-first order.
 */
export function components(count, include, neighbors) {
  const seen = new Uint8Array(count);
  const groups = [];
  for (let start = 0; start < count; start++) {
    if (seen[start] || !include(start)) continue;
    seen[start] = 1;
    const group = [start];
    for (let k = 0; k < group.length; k++) {
      for (const j of neighbors(group[k])) {
        if (!seen[j] && include(j)) {
          seen[j] = 1;
          group.push(j);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

const centroid = (group, sites) => {
  let [x, y] = [0, 0];
  for (const i of group) [x, y] = [x + sites[2 * i], y + sites[2 * i + 1]];
  return [x / group.length, y / group.length];
};

/**
 * The member of a group farthest from its edge, in steps (members with a neighbour outside the
 * group are on the edge); among those, the one nearest the group's centroid, then the lowest.
 */
export function innerPoint(group, neighbors, sites) {
  const member = new Set(group);
  const steps = new Map();
  const queue = [];
  for (const i of group) {
    for (const j of neighbors(i)) {
      if (!member.has(j)) {
        steps.set(i, 0);
        queue.push(i);
        break;
      }
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    for (const j of neighbors(i)) {
      if (member.has(j) && !steps.has(j)) {
        steps.set(j, steps.get(i) + 1);
        queue.push(j);
      }
    }
  }
  const [cx, cy] = centroid(group, sites);
  let [best, bestSteps, bestDistance] = [-1, -1, Infinity];
  for (const i of group) {
    const s = steps.get(i) ?? 0;
    const d = (sites[2 * i] - cx) ** 2 + (sites[2 * i + 1] - cy) ** 2;
    if (
      s > bestSteps ||
      (s === bestSteps && (d < bestDistance || (d === bestDistance && i < best)))
    ) {
      [best, bestSteps, bestDistance] = [i, s, d];
    }
  }
  return best;
}

/**
 * The direction a group of points stretches along (its principal component), clamped to
 * ±MAX_TILT, and its length along that clamped direction.
 *
 * @returns {{angle: Number, span: Number}} angle in radians, counter-clockwise from east
 */
export function mainAxis(group, sites) {
  const [cx, cy] = centroid(group, sites);
  let [sxx, syy, sxy] = [0, 0, 0];
  for (const i of group) {
    const [dx, dy] = [sites[2 * i] - cx, sites[2 * i + 1] - cy];
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Half the angle of atan2 lies in [-π/2, π/2]
  const axis = group.length > 1 ? 0.5 * Math.atan2(2 * sxy, sxx - syy) : 0;
  const angle = Math.min(Math.max(axis, -MAX_TILT), MAX_TILT);
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  let [min, max] = [Infinity, -Infinity];
  for (const i of group) {
    const p = (sites[2 * i] - cx) * ux + (sites[2 * i + 1] - cy) * uy;
    [min, max] = [Math.min(min, p), Math.max(max, p)];
  }
  return { angle, span: max - min };
}

const TERRAINS = {
  Desert: "dry",
  Savana: "dry",
  Forest: "wood",
  Jungle: "wood",
  Taiga: "wood",
  Tundra: "cold",
  Mountain: "high",
  Corrupted: "dark",
};

/**
 * The terrain whose adjectives a descriptive name picks from, see names/names.js ADJECTIVES.
 */
export const terrainOf = (kind, biomeName) => {
  if (kind === "sea" || kind === "ocean" || kind === "lake") return "water";
  if (kind === "range") return "high";
  return TERRAINS[biomeName] ?? "plain";
};

export const pointId = (x, y) => `${Math.round(x)},${Math.round(y)}`;

const site = (sites, i) => [sites[2 * i], sites[2 * i + 1]];

// The biome most cells of a group have, the lowest id among equals
const dominantBiome = (base, group) => {
  const counts = new Map();
  for (const i of group) counts.set(base.biomes[i], (counts.get(base.biomes[i]) ?? 0) + 1);
  let [best, most] = [-1, 0];
  for (const [biome, n] of counts)
    if (n > most || (n === most && biome < best)) [best, most] = [biome, n];
  return BIOME_DEFINITIONS[best].name;
};

// A feature of coarse cells, labelled across its middle
const areaFeature = (base, world, kind, id, group) => {
  const axis = mainAxis(group, base.sites);
  return {
    id,
    kind,
    anchors: [site(base.sites, innerPoint(group, world.neighbors, base.sites))],
    angle: axis.angle,
    span: axis.span + world.cellSize,
    terrain: terrainOf(kind, dominantBiome(base, group)),
    members: group,
  };
};

/**
 * One feature per numbered continent (see world.js numberLandMasses), by number.
 */
export function continentFeatures(base, world) {
  const byNumber = new Map();
  for (let i = 0; i < world.count; i++) {
    const number = base.continents[i];
    if (!world.land[i] || number === 0) continue;
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(i);
  }
  return [...byNumber.keys()]
    .sort((a, b) => a - b)
    .map((number) =>
      areaFeature(base, world, "continent", `continent:${number}`, byNumber.get(number)),
    );
}

/**
 * The groups of land cells of no continent, named after their lowest cell's site.
 */
export function islandFeatures(base, world) {
  return components(world.count, (i) => world.land[i] && base.continents[i] === 0, world.neighbors)
    .filter((group) => group.length >= MIN_ISLAND_CELLS)
    .map((group) =>
      areaFeature(base, world, "island", `island:${pointId(...site(base.sites, group[0]))}`, group),
    );
}

/**
 * The mountain ranges, on the water mesh, named after their highest point.
 */
export function rangeFeatures(base, world) {
  const { waterLand, lakes, waterHeight, waterSites } = base;
  const include = (i) => waterLand[i] === 1 && lakes[i] === 0 && waterHeight[i] >= RANGE_ALTITUDE;
  return components(world.side ** 2, include, world.gridNeighbors)
    .filter((group) => group.length >= MIN_RANGE_POINTS)
    .map((group) => {
      let highest = group[0];
      for (const i of group) if (waterHeight[i] > waterHeight[highest]) highest = i;
      const axis = mainAxis(group, waterSites);
      return {
        id: `range:${pointId(...site(waterSites, highest))}`,
        kind: "range",
        anchors: [site(waterSites, innerPoint(group, world.gridNeighbors, waterSites))],
        angle: axis.angle,
        span: axis.span + world.step,
        terrain: "high",
        members: group,
      };
    });
}

/**
 * Lakes of at least MIN_LAKE_NAMED water points are named (measured: 5 to 10 a world).
 */
export const MIN_LAKE_NAMED = 20;

/**
 * Rivers whose most downstream edge carries at least MIN_RIVER_NAMED are named: those drawn from
 * level 2 on, see rivers.js riverThreshold. A river needs MIN_RIVER_POINTS points, which leaves
 * out the short channels of deltas. A river reaching the sea with FLEUVE_FLOW or more is a
 * "fleuve" in French, the others a "rivière".
 */
export const MIN_RIVER_NAMED = 64;
export const MIN_RIVER_POINTS = 6;
export const FLEUVE_FLOW = 128;

/**
 * The lakes to name, labelled at their point farthest from the shore, named after their outlet
 * (the point the river leaving them starts from, the largest if several do).
 */
export function lakeFeatures(base, world) {
  const { lakes, waterSites, riverFrom, riverTo } = base;
  // The first edge leaving a lake from each point: edges come largest first
  const leaving = new Map();
  for (let k = 0; k < riverFrom.length; k++) {
    const a = riverFrom[k];
    if (lakes[a] && !lakes[riverTo[k]] && !leaving.has(a)) leaving.set(a, k);
  }
  return components(world.side ** 2, (i) => lakes[i] === 1, world.gridNeighbors)
    .filter((group) => group.length >= MIN_LAKE_NAMED)
    .map((group) => {
      let outlet = group[0];
      for (const i of group) {
        if (leaving.has(i) && (!leaving.has(outlet) || leaving.get(i) < leaving.get(outlet)))
          outlet = i;
      }
      let [minX, maxX] = [Infinity, -Infinity];
      for (const i of group)
        [minX, maxX] = [Math.min(minX, waterSites[2 * i]), Math.max(maxX, waterSites[2 * i])];
      return {
        id: `lake:${pointId(...site(waterSites, outlet))}`,
        kind: "lake",
        anchors: [site(waterSites, innerPoint(group, world.gridNeighbors, waterSites))],
        angle: 0,
        span: maxX - minX + world.step,
        terrain: "water",
        members: group,
      };
    });
}

/**
 * The rivers to name. Each starts at a mouth, largest first, and goes upstream along the largest
 * edge at each junction. The other edges of a junction carrying MIN_RIVER_NAMED or more start
 * rivers of their own, named after the edge that reaches the confluence, after every mouth's.
 *
 * @param sampler {WorldSampler} for the biome just upstream of each river's mouth
 */
export function riverFeatures(base, sampler) {
  const { waterSites, riverFrom, riverTo, riverFlow, riverMouth, lakes } = base;
  const edges = riverFrom.length;
  // The edges reaching each point, largest first as the edges come
  const incoming = new Map();
  for (let k = 0; k < edges; k++) {
    if (!incoming.has(riverTo[k])) incoming.set(riverTo[k], []);
    incoming.get(riverTo[k]).push(k);
  }
  const used = new Uint8Array(edges);
  const rivers = [];
  const walk = (start, branches) => {
    const members = [start];
    used[start] = 1;
    let point = riverFrom[start];
    for (;;) {
      const next = (incoming.get(point) ?? []).filter((k) => !used[k]);
      if (next.length === 0) break;
      for (const k of next.slice(1)) if (riverFlow[k] >= MIN_RIVER_NAMED) branches.push(k);
      members.push(next[0]);
      used[next[0]] = 1;
      point = riverFrom[next[0]];
    }
    if (members.length + 1 < MIN_RIVER_POINTS) return;
    const points = [riverTo[start], ...members.map((k) => riverFrom[k])];
    const path = new Float32Array(2 * points.length);
    points.forEach((p, i) => path.set(site(waterSites, p), 2 * i));
    const [mx, my] = site(waterSites, riverFrom[start]);
    const toSea = riverMouth[start] === 1 && !lakes[riverTo[start]];
    rivers.push({
      id: `river:${pointId(mx, my)},${pointId(...site(waterSites, riverTo[start]))}`,
      kind: "river",
      anchors: [[mx, my]],
      angle: 0,
      span: 0,
      terrain: terrainOf("river", BIOME_DEFINITIONS[sampler.sampleAt(mx, my, 0).biome].name),
      members,
      path,
      flow: riverFlow[start],
      form: toSea && riverFlow[start] >= FLEUVE_FLOW ? "fleuve" : "riviere",
    });
  };
  let branches = [];
  for (let k = 0; k < edges; k++) {
    if (riverMouth[k] && !used[k] && riverFlow[k] >= MIN_RIVER_NAMED) walk(k, branches);
  }
  while (branches.length > 0) {
    const round = branches.sort((a, b) => riverFlow[b] - riverFlow[a] || a - b);
    branches = [];
    for (const k of round) if (!used[k]) walk(k, branches);
  }
  return rivers;
}
/**
 * Coastal seas are the sea cells within SEA_REACH steps of a continent, each taking the
 * continent and the culture of the coast it is reached from. A continent's band is cut into
 * sectors of about SEA_TARGET_CELLS cells around its centre, so no sea wraps all around it.
 * Seas of fewer than MIN_SEA_CELLS cells join a neighbouring sea of the same continent, or
 * stay ocean. The ocean's labels keep OCEAN_MARGIN of the world's side from its edges.
 */
export const SEA_REACH = 3;
export const MIN_SEA_CELLS = 8;
export const SEA_TARGET_CELLS = 60;
export const OCEAN_MARGIN = 0.1;

/**
 * The coastal seas and the ocean.
 *
 * @param centres see names/names.js placeCultureCentres
 * @returns {{seas: Object[], ocean: Object|null}} see continentFeatures; seas have a culture
 */
export function seaFeatures(base, world, centres) {
  const { count, land, neighbors } = world;
  const sites = base.sites;
  // Each coastal sea cell's steps from continent land, and the continent cell it is reached from
  const steps = new Int16Array(count).fill(-1);
  const coast = new Int32Array(count).fill(-1);
  const queue = [];
  for (let i = 0; i < count; i++) {
    if (land[i]) continue;
    for (const j of neighbors(i)) {
      if (land[j] && base.continents[j] > 0 && (coast[i] < 0 || j < coast[i])) coast[i] = j;
    }
    if (coast[i] >= 0) {
      steps[i] = 1;
      queue.push(i);
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    if (steps[i] === SEA_REACH) continue;
    for (const j of neighbors(i)) {
      if (land[j] || steps[j] >= 0) continue;
      steps[j] = steps[i] + 1;
      coast[j] = coast[i];
      queue.push(j);
    }
  }

  // The centre of each continent and how many coastal sea cells it has
  const centre = new Map();
  const coastal = new Map();
  for (let i = 0; i < count; i++) {
    const number = base.continents[i];
    if (land[i] && number > 0) {
      const [x, y, n] = centre.get(number) ?? [0, 0, 0];
      centre.set(number, [x + sites[2 * i], y + sites[2 * i + 1], n + 1]);
    }
    if (coast[i] >= 0) {
      const owner = base.continents[coast[i]];
      coastal.set(owner, (coastal.get(owner) ?? 0) + 1);
    }
  }
  const keyOf = new Array(count).fill(null);
  const cultureOf = new Map();
  for (let i = 0; i < count; i++) {
    if (coast[i] < 0) continue;
    const c = coast[i];
    const number = base.continents[c];
    const culture = cultureAt(centres, sites[2 * c], sites[2 * c + 1]);
    const [sx, sy, n] = centre.get(number);
    const sectors = Math.max(1, Math.round(coastal.get(number) / SEA_TARGET_CELLS));
    const turn =
      (Math.atan2(sites[2 * i + 1] - sy / n, sites[2 * i] - sx / n) + Math.PI) / (2 * Math.PI);
    const key = `${number}:${culture}:${Math.min(sectors - 1, Math.floor(turn * sectors))}`;
    keyOf[i] = key;
    cultureOf.set(key, culture);
  }
  const groups = components(
    count,
    (i) => keyOf[i] !== null,
    function* (i) {
      for (const j of neighbors(i)) if (keyOf[j] === keyOf[i]) yield j;
    },
  );

  // Small seas join the largest neighbouring sea of their continent that is large enough
  const groupOf = new Int32Array(count).fill(-1);
  groups.forEach((group, index) => {
    for (const i of group) groupOf[i] = index;
  });
  const continentOf = (group) => base.continents[coast[group[0]]];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.length === 0 || group.length >= MIN_SEA_CELLS) continue;
    let target = -1;
    for (const i of group) {
      for (const j of neighbors(i)) {
        const other = groupOf[j];
        if (other < 0 || other === index || groups[other].length < MIN_SEA_CELLS) continue;
        if (continentOf(groups[other]) !== continentOf(group)) continue;
        if (
          target < 0 ||
          groups[other].length > groups[target].length ||
          (groups[other].length === groups[target].length && other < target)
        ) {
          target = other;
        }
      }
    }
    for (const i of group) groupOf[i] = target;
    if (target >= 0) groups[target].push(...group);
    groups[index] = [];
  }

  const seas = groups
    .filter((group) => group.length >= MIN_SEA_CELLS)
    .map((group) => {
      const axis = mainAxis(group, sites);
      const anchor = site(sites, innerPoint(group, neighbors, sites));
      return {
        id: `sea:${pointId(...anchor)}`,
        kind: "sea",
        anchors: [anchor],
        angle: axis.angle,
        span: axis.span + world.cellSize,
        terrain: "water",
        culture: cultureOf.get(keyOf[group[0]]),
        members: group,
      };
    });

  // The ocean: every other sea cell, labelled where it is farthest from any land
  const inSea = new Uint8Array(count);
  for (const sea of seas) for (const i of sea.members) inSea[i] = 1;
  const fromLand = new Int16Array(count).fill(-1);
  const around = [];
  for (let i = 0; i < count; i++) {
    if (land[i]) continue;
    for (const j of neighbors(i)) {
      if (land[j]) {
        fromLand[i] = 1;
        around.push(i);
        break;
      }
    }
  }
  for (let k = 0; k < around.length; k++) {
    for (const j of neighbors(around[k])) {
      if (!land[j] && fromLand[j] < 0) {
        fromLand[j] = fromLand[around[k]] + 1;
        around.push(j);
      }
    }
  }
  const members = [];
  for (let i = 0; i < count; i++) if (!land[i] && !inSea[i]) members.push(i);
  const [low, high] = [OCEAN_MARGIN * WORLD_SIZE, (1 - OCEAN_MARGIN) * WORLD_SIZE];
  const candidates = members.filter((i) => {
    const [x, y] = site(sites, i);
    return x >= low && x <= high && y >= low && y <= high;
  });
  const farthest = (pool) => pool.reduce((a, b) => (fromLand[b] > fromLand[a] ? b : a), pool[0]);
  if (candidates.length === 0) return { seas, ocean: null };
  const first = farthest(candidates);
  const [fx, fy] = site(sites, first);
  const away = candidates.filter(
    (i) => Math.hypot(sites[2 * i] - fx, sites[2 * i + 1] - fy) >= WORLD_SIZE / 2,
  );
  const anchors = [[fx, fy]];
  if (away.length > 0) anchors.push(site(sites, farthest(away)));
  return {
    seas,
    ocean: {
      id: "ocean",
      kind: "ocean",
      anchors,
      angle: 0,
      span: WORLD_SIZE / 2,
      terrain: "water",
      members,
    },
  };
}
