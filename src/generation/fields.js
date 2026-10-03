import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { createNoise } from "../vendor/perlin.js";
import { BIOME_DEFINITIONS, SWAMP_BIOMES } from "./biomes.js";
import { hashSeed } from "./util.js";

/**
 * How far, in world units, the largest octave of the warp moves a point: about the spacing of
 * the coarse cells, so coasts and biome borders wave instead of following straight cell edges.
 */
export const WARP_AMPLITUDE = 300;

/**
 * The wavelength of the largest warp octave, in world units. Each level adds an octave with
 * half the wavelength and half the amplitude, so deeper levels add smaller wiggles.
 */
export const WARP_WAVELENGTH = 1500;

/**
 * The frequency of the base altitude noise, the same as in world.js generateAltitude.
 */
const ALTITUDE_FREQUENCY = 15 / WORLD_SIZE;

/**
 * How much the first altitude detail octave (level 1) adds; each next level adds half as much.
 */
export const ALTITUDE_DETAIL = 0.1;

export const SEA_ALTITUDE = -0.1;

/**
 * What a water mesh point is besides land, sea or lake, see hydrology.js computeWetlands: 0 for
 * nothing, SWAMP_POINT where a slow river spreads, DELTA_POINT for sea a delta turned into land.
 */
export const SWAMP_POINT = 1;
export const DELTA_POINT = 2;

/**
 * The altitude of delta land: flat, above the beach band (below 0.1), so it is drawn as lowland.
 */
export const DELTA_ALTITUDE = 0.15;

/**
 * The first level at which deltas are drawn as land. At level 0 a cell is about as large as a
 * whole delta fan, so a channel's end cell can have its site on delta land, and (river threshold
 * 256) a delta's trunk channels can be drawn while its outlets, with a smaller share of the flow,
 * are not. From level 1 (threshold 128) every channel is drawn: a delta's outlets carry at least
 * DELTA_FLOW / 2 = 128 each (see hydrology.js growDelta), and the channels upstream of them more.
 */
export const DELTA_MIN_LEVEL = 1;

/**
 * How far apart, in world units, slopeAt samples the altitude: well under the wavelength of the
 * finest altitude octave (about 5 units at level 7).
 */
export const SLOPE_STEP = 0.1;

/**
 * How far, in world units, the largest octave of the lake warp moves a point: about the water
 * mesh spacing, so lake shores wave without leaving the basin the rivers flow into.
 */
export const LAKE_WARP_AMPLITUDE = 40;

/**
 * The wavelength of the largest lake warp octave, in world units; halved at each level.
 */
export const LAKE_WARP_WAVELENGTH = 160;

const MARITIME = BIOME_DEFINITIONS.map((definition) => definition.maritime === true);

const LAKE = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "lake");

const SWAMP = BIOME_DEFINITIONS.findIndex((definition) => definition.name === "Swamp");

const SWAMPY = BIOME_DEFINITIONS.map((definition) => SWAMP_BIOMES.includes(definition.name));

/**
 * How many water grid squares around a delta point a sea sample looks for it: the lake warp
 * moves a point by at most 2 × LAKE_WARP_AMPLITUDE (80 / 39 squares rounded up, plus flooring,
 * so the square index shifts by up to 3), and the nearest water point is at most 2 squares
 * further (see #nearestWaterPoint): 5 = 3 + 2 is the exact bound. The rest of the sea skips the
 * lookup, which the rivers' search for deep water would otherwise pay thousands of times a tile.
 */
const DELTA_NEAR = 5;

/**
 * What the map is at any point and level of detail, read from the coarse world.
 * Pure: the same arguments always give the same answer, whatever was sampled before.
 */
export class WorldSampler {
  #base;
  #delaunay;
  #noise;
  #hint = 0;
  // The side of the water mesh's grid, 0 without water
  #waterSide = 0;
  #nearDelta = null;

  /**
   * @param base see world.js MapGenerator#toBaseWorld, with or without its water (see
   *             hydrology.js withWater); without water, there are no lakes nor rivers
   */
  constructor(base) {
    this.#base = base;
    this.#delaunay = new Delaunay(base.sites);
    this.#noise = createNoise();
    this.#noise.seed(hashSeed(base.seed));
    if (base.waterSites) this.#waterSide = Math.round(Math.sqrt(base.waterSites.length / 2));
    if (base.wetlands) {
      const side = this.#waterSide;
      this.#nearDelta = new Uint8Array(side * side);
      for (let i = 0; i < base.wetlands.length; i++) {
        if (base.wetlands[i] !== DELTA_POINT) continue;
        const [col, row] = [i % side, Math.floor(i / side)];
        for (
          let r = Math.max(row - DELTA_NEAR, 0);
          r <= Math.min(row + DELTA_NEAR, side - 1);
          r++
        ) {
          for (
            let c = Math.max(col - DELTA_NEAR, 0);
            c <= Math.min(col + DELTA_NEAR, side - 1);
            c++
          ) {
            this.#nearDelta[r * side + c] = 1;
          }
        }
      }
    }
  }

  get seed() {
    return this.#base.seed;
  }

  /**
   * The river edges and the water mesh they join, see hydrology.js generateWater; null without water.
   *
   * @returns {{sites: Float64Array, from: Uint32Array, to: Uint32Array, flow: Float32Array,
   *            mouth: Uint8Array}|null}
   */
  get rivers() {
    if (!this.#waterSide) return null;
    const base = this.#base;
    return {
      sites: base.waterSites,
      from: base.riverFrom,
      to: base.riverTo,
      flow: base.riverFlow,
      mouth: base.riverMouth,
    };
  }

  /**
   * The point whose nearest water mesh point tells whether (x, y) is in a lake: a smaller warp
   * than the coast's, one octave per level, so shores gain detail and stay on their basin.
   */
  lakeWarp(x, y, level) {
    let dx = 0;
    let dy = 0;
    for (let k = 0; k <= level; k++) {
      const frequency = 2 ** k / LAKE_WARP_WAVELENGTH;
      const amplitude = LAKE_WARP_AMPLITUDE / 2 ** k;
      dx += amplitude * this.#noise.simplex3(x * frequency, y * frequency, 100.5 + 2 * k);
      dy += amplitude * this.#noise.simplex3(x * frequency, y * frequency, 101.5 + 2 * k);
    }
    return [x + dx, y + dy];
  }

  /**
   * The point whose coarse cell gives the land and biome at (x, y): (x, y) moved by one noise
   * octave per level from 0 to level. The z offsets keep octaves and axes independent.
   */
  warp(x, y, level) {
    let dx = 0;
    let dy = 0;
    for (let k = 0; k <= level; k++) {
      const frequency = 2 ** k / WARP_WAVELENGTH;
      const amplitude = WARP_AMPLITUDE / 2 ** k;
      dx += amplitude * this.#noise.simplex3(x * frequency, y * frequency, 0.5 + 2 * k);
      dy += amplitude * this.#noise.simplex3(x * frequency, y * frequency, 1.5 + 2 * k);
    }
    return [x + dx, y + dy];
  }

  /**
   * The land altitude at a point, between 0 and 1: the coarse world's noise plus one smaller
   * octave per level.
   */
  altitudeAt(x, y, level) {
    let altitude = (this.#noise.simplex2(x * ALTITUDE_FREQUENCY, y * ALTITUDE_FREQUENCY) + 1) / 2;
    for (let k = 1; k <= level; k++) {
      const frequency = ALTITUDE_FREQUENCY * 2 ** k;
      altitude +=
        ALTITUDE_DETAIL *
        2 ** (1 - k) *
        this.#noise.simplex2(x * frequency + 31.7 * k, y * frequency);
    }
    return Math.min(Math.max(altitude, 0), 1);
  }

  /**
   * The slope of the land altitude at a point (see altitudeAt): its change per world unit
   * eastwards and northwards. Like altitudeAt, it does not look at land or water.
   *
   * @returns {Number[]} [dx, dy]
   */
  slopeAt(x, y, level) {
    const h = SLOPE_STEP;
    return [
      (this.altitudeAt(x + h, y, level) - this.altitudeAt(x - h, y, level)) / (2 * h),
      (this.altitudeAt(x, y + h, level) - this.altitudeAt(x, y - h, level)) / (2 * h),
    ];
  }

  /**
   * The coarse cell whose biome sampleAt reads at (x, y) and a level.
   */
  cellAt(x, y, level) {
    const [wx, wy] = this.warp(x, y, level);
    // The hint only speeds up the search: find always returns the nearest site
    const cell = this.#delaunay.find(wx, wy, this.#hint);
    this.#hint = cell;
    return cell;
  }

  /**
   * The water mesh point nearest to (x, y), or -1 in a world without water.
   */
  waterPointAt(x, y) {
    return this.#waterSide ? this.#nearestWaterPoint(x, y) : -1;
  }

  // The column and row of the water grid square of (x, y), clamped to the grid
  #square(x, y) {
    const side = this.#waterSide;
    const step = WORLD_SIZE / side;
    const clamp = (i) => Math.min(Math.max(i, 0), side - 1);
    return [clamp(Math.floor(x / step)), clamp(Math.floor(y / step))];
  }

  /**
   * The water mesh point nearest to (x, y). The mesh is a grid with a point in each square
   * (hydrology.js computeDrainage), and the point of (x, y)'s own square is less than √2 squares
   * away, so no point 3 or more squares away can be nearer: 5 × 5 squares are enough.
   */
  #nearestWaterPoint(x, y) {
    const sites = this.#base.waterSites;
    const side = this.#waterSide;
    const [col, row] = this.#square(x, y);
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let r = Math.max(row - 2, 0); r <= Math.min(row + 2, side - 1); r++) {
      for (let c = Math.max(col - 2, 0); c <= Math.min(col + 2, side - 1); c++) {
        const i = r * side + c;
        const distance = (sites[2 * i] - x) ** 2 + (sites[2 * i + 1] - y) ** 2;
        if (distance < nearestDistance) [nearest, nearestDistance] = [i, distance];
      }
    }
    return nearest;
  }

  /**
   * @returns {{biome: Number, continent: Number, land: boolean, altitude: Number, flat: boolean}}
   *          biome is an index in BIOME_DEFINITIONS; continent is 0 at sea and on islands;
   *          flat: delta land, level whatever the altitude noise (the tiles give it no slope)
   */
  sampleAt(x, y, level) {
    const cell = this.cellAt(x, y, level);
    const biome = this.#base.biomes[cell];
    const land = !MARITIME[biome];
    const base = this.#base;
    if (this.#waterSide) {
      const [col, row] = this.#square(x, y);
      if (land || (level >= DELTA_MIN_LEVEL && this.#nearDelta?.[row * this.#waterSide + col])) {
        const water = this.#nearestWaterPoint(...this.lakeWarp(x, y, level));
        if (land && base.lakes[water]) {
          return { biome: LAKE, continent: 0, land: false, altitude: SEA_ALTITUDE, flat: false };
        }
        const wetland = base.wetlands?.[water];
        if (land && wetland === SWAMP_POINT && SWAMPY[biome]) {
          return {
            biome: SWAMP,
            continent: base.continents[cell],
            land,
            altitude: this.altitudeAt(x, y, level),
            flat: false,
          };
        }
        if (!land && wetland === DELTA_POINT) {
          return {
            biome: base.deltaBiome[water],
            continent: base.deltaContinent[water],
            land: true,
            altitude: DELTA_ALTITUDE,
            flat: true,
          };
        }
      }
    }
    return {
      biome,
      continent: land ? base.continents[cell] : 0,
      land,
      altitude: land ? this.altitudeAt(x, y, level) : SEA_ALTITUDE,
      flat: false,
    };
  }
}
