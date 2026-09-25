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

const MARITIME = BIOME_DEFINITIONS.map((definition) => definition.maritime === true);

/**
 * What the map is at any point and level of detail, read from the coarse world.
 * Pure: the same arguments always give the same answer, whatever was sampled before.
 */
export class WorldSampler {
  #base;
  #delaunay;
  #noise;
  #hint = 0;

  /**
   * @param base see world.js MapGenerator#toBaseWorld
   */
  constructor(base) {
    this.#base = base;
    this.#delaunay = new Delaunay(base.sites);
    this.#noise = createNoise();
    this.#noise.seed(hashSeed(base.seed));
  }

  get seed() {
    return this.#base.seed;
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
    return {
      biome,
      continent: land ? this.#base.continents[cell] : 0,
      land,
      altitude: land ? this.altitudeAt(x, y, level) : SEA_ALTITUDE,
    };
  }
}
