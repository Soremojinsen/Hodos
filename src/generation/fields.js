import { Delaunay } from "d3-delaunay";
import { WORLD_SIZE } from "../constants.js";
import { createNoise } from "../vendor/perlin.js";
import { BIOME_DEFINITIONS } from "./biomes.js";
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
   * The water mesh point nearest to (x, y). The mesh is a grid with a point in each square
   * (hydrology.js computeDrainage), and the point of (x, y)'s own square is less than √2 squares
   * away, so no point 3 or more squares away can be nearer: 5 × 5 squares are enough.
   */
  #nearestWaterPoint(x, y) {
    const sites = this.#base.waterSites;
    const side = this.#waterSide;
    const step = WORLD_SIZE / side;
    const clamp = (i) => Math.min(Math.max(i, 0), side - 1);
    const [col, row] = [clamp(Math.floor(x / step)), clamp(Math.floor(y / step))];
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
   * @returns {{biome: Number, continent: Number, land: boolean, altitude: Number}}
   *          biome is an index in BIOME_DEFINITIONS; continent is 0 at sea and on islands
   */
  sampleAt(x, y, level) {
    const [wx, wy] = this.warp(x, y, level);
    // The hint only speeds up the search: find always returns the nearest site
    const cell = this.#delaunay.find(wx, wy, this.#hint);
    this.#hint = cell;
    const biome = this.#base.biomes[cell];
    const land = !MARITIME[biome];
    if (land && this.#waterSide) {
      const [lx, ly] = this.lakeWarp(x, y, level);
      if (this.#base.lakes[this.#nearestWaterPoint(lx, ly)]) {
        return { biome: LAKE, continent: 0, land: false, altitude: SEA_ALTITUDE };
      }
    }
    return {
      biome,
      continent: land ? this.#base.continents[cell] : 0,
      land,
      altitude: land ? this.altitudeAt(x, y, level) : SEA_ALTITUDE,
    };
  }
}
