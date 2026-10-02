import { createNoise } from "../vendor/perlin.js";
import { BIOME_DEFINITIONS, markKind } from "./biomes.js";
import { banks, nearRivers } from "./rivers.js";
import { fnv1a, hashSeed } from "./util.js";

/**
 * How far a river keeps from a tree's centre, in grid squares, beyond its own drawn half width.
 *
 * A tree and its shadow reach farther: the conifer's shadow corner is the farthest, about 0.532
 * squares at the largest scale (1.18) with half a pixel of antialiasing at the farthest zoom a
 * level is drawn (√2 / MARK_SPACING_PX / 2 < 0.06), against 0.448 for the jungle's round crown.
 * That is still less than a square, so shaders/relief.glsl drawMarks finds every tree over a
 * pixel in its 3 × 3 squares. The river clearance keeps 0.45, which covers every crown: only a
 * fringe of a conifer's shadow, under a pixel wide, may pass under a river, which is drawn on top.
 */
export const TREE_REACH = 0.45;

/**
 * How many squares past a forest's border its trees spill onto open land.
 */
export const SPILL = 4;

// Inside a forest, the keep chance is EDGE_IN times on its border, rising to 1 INNER squares in;
// outside, EDGE_OUT times one square out, falling to 0 at SPILL squares
const INNER = 3;
const EDGE_IN = 0.75;
const EDGE_OUT = 0.5;

// The chance of a tree in a square, by kind (see biomes.js markKind), and along floodplains,
// before the woodland noise multiplies it by 0.75 on average. Above 1, the kind's stands are
// closed over a wider area: jungles are the thickest
const DENSITY = [0, 1, 1.3, 1.1, 0.7];
const FLOODPLAIN_DENSITY = 0.45;

// The woodland noise multiplies the chance by 0.75 ± CLUMPING, by kind: closed stands and
// glades. Taiga is the patchiest. Stands and glades are about WOODLAND_SQUARES / 2 squares across,
// half a wavelength of the noise
const CLUMPING = [0, 0.4, 0.3, 0.55, 0.5];
const WOODLAND_SQUARES = 16;
// The woodland noise is multiplied by NOISE_GAIN (then clamped to ±1) because simplex2's rms is
// about 0.44, so it rarely reaches ±1 and the factor would otherwise span far less than its range
const NOISE_GAIN = 2;

// No tree on the beach nor on the mountains; fewer from the tree line up to them
const BEACH = 0.1;
const TREE_LINE = 0.55;
const MOUNTAIN = 0.65;

// Fewer trees on steep ground: the chance falls to STEEP_MIN times between the slopes STEEP_FROM
// and STEEP_TO, as the shaders exaggerate them (RELIEF in shaders/relief.glsl)
const RELIEF = 250;
const STEEP_FROM = 0.5;
const STEEP_TO = 1.5;
const STEEP_MIN = 0.4;

// The kind of each biome's own trees, by id
const OWN = BIOME_DEFINITIONS.map(({ mark }) => markKind(mark));

// The kinds that may spill onto each biome, by id: open land beside forests. Reeds never leave
// their swamp
const SPILL_HOSTS = { Plain: [1, 2, 3], Savana: [1, 2], Tundra: [3] };
const HOSTS = BIOME_DEFINITIONS.map(({ name }) => SPILL_HOSTS[name] ?? []);

// The woodland noise of the last seed: a worker draws one world at a time
let woodlandSeed = null;
let woodlandNoise = null;
const woodland = (seed) => {
  if (seed !== woodlandSeed) {
    woodlandNoise = createNoise();
    woodlandNoise.seed(hashSeed(`${seed}:trees`));
    woodlandSeed = seed;
  }
  return woodlandNoise;
};

/**
 * Numbers in [0, 1) for a square of level z, drawn from the seed's hash and the square's column
 * and row only, so every tile that holds the square draws the same tree (mulberry32, seeded
 * with a mix of the four).
 */
function squareRandom(hash, z, i, j) {
  let h = hash ^ Math.imul(z + 1, 0x9e3779b1);
  h = Math.imul(h ^ (i | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (j | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The distance, in squares, from each square of a grid to the nearest square where target is
 * truthy, in steps of 1 straight and √2 diagonally (two passes); Infinity if there is none.
 *
 * @param target one value per square, row by row
 * @returns {Float32Array}
 */
export function chamferDistances(target, columns, rows) {
  const d = new Float32Array(columns * rows);
  for (let k = 0; k < d.length; k++) d[k] = target[k] ? 0 : Infinity;
  const at = (i, j) =>
    i < 0 || j < 0 || i >= columns || j >= rows ? Infinity : d[j * columns + i];
  const D = Math.SQRT2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const k = j * columns + i;
      d[k] = Math.min(
        d[k],
        at(i - 1, j) + 1,
        at(i - 1, j - 1) + D,
        at(i, j - 1) + 1,
        at(i + 1, j - 1) + D,
      );
    }
  }
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = columns - 1; i >= 0; i--) {
      const k = j * columns + i;
      d[k] = Math.min(
        d[k],
        at(i + 1, j) + 1,
        at(i + 1, j + 1) + D,
        at(i, j + 1) + 1,
        at(i - 1, j + 1) + D,
      );
    }
  }
  return d;
}

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

/**
 * The trees of the squares of a grid anchored in the world, `cell` wide, at level z: at most one
 * per square, anywhere in it, kept at a chance that follows the land. Each square's tree depends
 * only on the seed, the level and where the square is, so neighbouring tiles agree.
 *
 * - A biome with a mark grows its own kind, thinning over the INNER squares inside its border.
 * - Dry land beside a river (rivers.js banks) grows broadleaf trees, as gallery forests.
 * - Open land (HOSTS) grows the kind of the nearest forest it may host, up to SPILL squares out.
 * - The woodland noise groups trees into stands and glades; slopes and the tree line thin them.
 * - A tree a river would cut, at any zoom its level is drawn at, is left out.
 *
 * @param sampler {WorldSampler}
 * @param area the squares that reach into it are returned, and one more on each side,
 *             [minX, minY, maxX, maxY]
 * @returns {{origin: Number[], size: Number[], texels: Uint8Array}} the first square's column
 *          and row, the number of columns and rows, and 4 bytes per square, row by row from
 *          origin: the tree's kind (0 for none), a random byte for its size and shade, and its
 *          position in the square, x then y, the centre at (byte + 0.5) / 256 of the square
 */
export function treeGrid(sampler, z, cell, [minX, minY, maxX, maxY]) {
  const [i0, j0] = [Math.floor(minX / cell) - 1, Math.floor(minY / cell) - 1];
  const columns = Math.floor(maxX / cell) + 1 - i0 + 1;
  const rows = Math.floor(maxY / cell) + 1 - j0 + 1;
  const texels = new Uint8Array(4 * columns * rows);

  // The kind of each square's centre, SPILL + 1 squares further out than the trees on each side,
  // so that the distances of the trees' squares are whole
  const M = SPILL + 1;
  const [wide, high] = [columns + 2 * M, rows + 2 * M];
  const kinds = new Uint8Array(wide * high);
  for (let j = 0; j < high; j++) {
    for (let i = 0; i < wide; i++) {
      const [x, y] = [(i0 - M + i + 0.5) * cell, (j0 - M + j + 0.5) * cell];
      kinds[j * wide + i] = OWN[sampler.sampleAt(x, y, z).biome];
    }
  }
  // Per kind, computed when first needed: the distance to its squares, and from its squares
  // to the nearest other
  const toKind = [];
  const fromKind = [];
  const distanceTo = (kind) =>
    (toKind[kind] ??= chamferDistances(
      kinds.map((k) => (k === kind ? 1 : 0)),
      wide,
      high,
    ));
  const distanceOut = (kind) =>
    (fromKind[kind] ??= chamferDistances(
      kinds.map((k) => (k === kind ? 0 : 1)),
      wide,
      high,
    ));

  const margin = TREE_REACH * cell;
  const box = [i0 * cell, j0 * cell, (i0 + columns) * cell, (j0 + rows) * cell];
  const bank = banks(sampler, z, box);
  const river = nearRivers(sampler, z, box, margin);
  const noise = woodland(sampler.seed);
  // All 32 bits of the seed's hash, apart from the world's: hashSeed keeps only 16, for the noise
  const hash = fnv1a(`${sampler.seed}:trees`);
  const scale = WOODLAND_SQUARES * cell;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const [i, j] = [i0 + c, j0 + r];
      const random = squareRandom(hash, z, i, j);
      const [bx, by, byte, roll] = [
        Math.floor(random() * 256),
        Math.floor(random() * 256),
        Math.floor(random() * 256),
        random(),
      ];
      const [x, y] = [(i + (bx + 0.5) / 256) * cell, (j + (by + 0.5) / 256) * cell];
      const sample = sampler.sampleAt(x, y, z);
      if (!sample.land || sample.altitude < BEACH || sample.altitude >= MOUNTAIN) continue;
      const g = (r + M) * wide + (c + M);
      let kind = OWN[sample.biome];
      let chance;
      if (kind) {
        const d = distanceOut(kind)[g];
        chance = DENSITY[kind] * (EDGE_IN + (1 - EDGE_IN) * clamp01((d - 1) / (INNER - 1)));
      } else if (bank(x, y, sample.biome)) {
        kind = 1;
        chance = FLOODPLAIN_DENSITY;
      } else {
        let nearest = Infinity;
        for (const host of HOSTS[sample.biome]) {
          const d = distanceTo(host)[g];
          if (d < nearest) [nearest, kind] = [d, host];
        }
        if (nearest > SPILL) continue;
        chance = DENSITY[kind] * EDGE_OUT * ((SPILL - Math.max(nearest, 1)) / (SPILL - 1));
      }
      chance *= Math.max(
        0,
        0.75 +
          CLUMPING[kind] *
            Math.min(Math.max(NOISE_GAIN * noise.simplex2(x / scale, y / scale), -1), 1),
      );
      if (roll >= chance) continue;
      // The tree line and slopes only lower the chance: test them once the cheap rolls passed
      chance *= clamp01((MOUNTAIN - sample.altitude) / (MOUNTAIN - TREE_LINE));
      const steep = RELIEF * Math.hypot(...sampler.slopeAt(x, y, z));
      chance *= 1 - (1 - STEEP_MIN) * clamp01((steep - STEEP_FROM) / (STEEP_TO - STEEP_FROM));
      if (roll >= chance || river(x, y)) continue;
      texels.set([kind, byte, bx, by], 4 * (r * columns + c));
    }
  }
  return { origin: [i0, j0], size: [columns, rows], texels };
}

/**
 * The trees of a grid (see treeGrid), with their square's column and row and their centre in
 * the world.
 *
 * @returns {{i: Number, j: Number, kind: Number, byte: Number, x: Number, y: Number}[]}
 */
export function treesOf({ origin, size, texels }, cell) {
  const trees = [];
  for (let r = 0; r < size[1]; r++) {
    for (let c = 0; c < size[0]; c++) {
      const k = 4 * (r * size[0] + c);
      if (!texels[k]) continue;
      const [i, j] = [origin[0] + c, origin[1] + r];
      trees.push({
        i,
        j,
        kind: texels[k],
        byte: texels[k + 1],
        x: (i + (texels[k + 2] + 0.5) / 256) * cell,
        y: (j + (texels[k + 3] + 0.5) / 256) * cell,
      });
    }
  }
  return trees;
}
