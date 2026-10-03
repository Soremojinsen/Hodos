import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
import { MARITIME } from "./fields.js";
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
