import { GlColor } from "../color.js";
import { Counter, randomElement } from "./util.js";

/**
 * Every biome, in id order. Colors are normalized rgb.
 *
 * - pool: biomes of the same pool alternate while spreading ("default" means not assigned yet)
 * - low/high: map color at altitude 0 and 1
 * - debug: color in debug rendering mode
 * - latitude: where the pool is likely, as a normal distribution over 0 (south) to 100 (north)
 * - stay: when spreading within its pool, the chance to keep this biome, and the alternative
 */
export const BIOME_DEFINITIONS = [
  {
    name: "ocean",
    pool: "default",
    maritime: true,
    low: [0.28, 0.47, 0.53],
    high: [0.28, 0.47, 0.53],
    debug: [0, 0, 1],
  },
  { name: "continent", pool: "default", low: [0, 0, 0], high: [1, 1, 1], debug: [0, 1, 0] },
  { name: "island", pool: "Island", low: [1, 0.69, 0.11], high: [0.77, 0.64, 0.21], debug: [0, 0, 0] },
  {
    name: "Tundra",
    pool: "Cold",
    low: [0.94, 0.97, 0.97],
    high: [0.8, 0.82, 0.82],
    debug: [0.8, 0.8, 0.8],
    latitude: { average: 80, sigma: 4 },
    stay: { chance: 0.7, then: "Tundra", otherwise: "Taiga" },
  },
  {
    name: "Taiga",
    pool: "Cold",
    low: [0.83, 0.93, 0.98],
    high: [0.49, 0.73, 0.75],
    debug: [1, 1, 1],
    latitude: { average: 80, sigma: 4 },
    stay: { chance: 0.3, then: "Tundra", otherwise: "Taiga" },
  },
  {
    name: "Forest",
    pool: "Temperate",
    low: [0.21, 0.65, 0.35],
    high: [0.15, 0.47, 0.25],
    debug: [0, 1, 0],
    latitude: { average: 55, sigma: 12 },
    stay: { chance: 0.7, then: "Forest", otherwise: "Plain" },
  },
  {
    name: "Plain",
    pool: "Temperate",
    low: [0.74, 0.91, 0.55],
    high: [0.57, 0.67, 0.46],
    debug: [0, 0.8, 0],
    latitude: { average: 55, sigma: 12 },
    stay: { chance: 0.3, then: "Forest", otherwise: "Plain" },
  },
  {
    name: "Swamp",
    pool: "Humid",
    low: [0.45, 0.5, 0.3],
    high: [0.33, 0.35, 0.25],
    debug: [0, 1, 1],
    latitude: { average: 31, sigma: 4.5 },
    stay: { chance: 0.6, then: "Swamp", otherwise: "Jungle" },
  },
  {
    name: "Jungle",
    pool: "Humid",
    low: [0.22, 0.37, 0.07],
    high: [0.16, 0.27, 0.05],
    debug: [0, 0.8, 0.8],
    latitude: { average: 31, sigma: 4.5 },
    stay: { chance: 0.2, then: "Swamp", otherwise: "Jungle" },
  },
  {
    name: "Desert",
    pool: "Dry",
    low: [0.94, 0.82, 0.58],
    high: [0.74, 0.65, 0.49],
    debug: [1, 0, 0],
    latitude: { average: 17.5, sigma: 3.5 },
    stay: { chance: 0.8, then: "Desert", otherwise: "Savana" },
  },
  {
    name: "Savana",
    pool: "Dry",
    low: [0.97, 0.89, 0.29],
    high: [0.67, 0.63, 0.36],
    debug: [0.8, 0, 0],
    latitude: { average: 17.5, sigma: 3.5 },
    stay: { chance: 0.2, then: "Desert", otherwise: "Savana" },
  },
  {
    name: "Mountain",
    pool: "Mountain",
    low: [0.27, 0.25, 0.21],
    high: [0.72, 0.71, 0.67],
    debug: [0.5, 0.5, 0.5],
  },
  {
    name: "Corrupted",
    pool: "Special",
    low: [0.43, 0.12, 0.12],
    high: [0.19, 0.1, 0.1],
    debug: [0.5, 0, 1],
  },
  {
    name: "Fairy",
    pool: "Special",
    low: [0.9, 0.79, 0.87],
    high: [0.64, 0.48, 0.59],
    debug: [1, 0.75, 0.8],
  },
];

/**
 * A biome, built from one of BIOME_DEFINITIONS.
 */
export class Biome {
  #id;
  #definition;
  #random;
  #lowColor;
  #highColor;
  #debugColor;

  /**
   * @param id          {Number}   a unique id the renderer uses to refer to this biome
   * @param definition  {Object}   an entry of BIOME_DEFINITIONS
   * @param random      {function} a function that generates a number between 0 and 1
   */
  constructor(id, definition, random) {
    this.#id = id;
    this.#definition = definition;
    this.#random = random;
    this.#lowColor = new GlColor(...definition.low);
    this.#highColor = new GlColor(...definition.high);
    this.#debugColor = new GlColor(...definition.debug);
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#definition.name;
  }

  get biomePool() {
    return this.#definition.pool;
  }

  /**
   * The color of the map at a given point is interpolated between lowColor at altitude 0 and highColor at altitude 1.
   * @returns {GlColor}
   */
  get lowColor() {
    return this.#lowColor;
  }

  /**
   * @returns {GlColor} see lowColor
   */
  get highColor() {
    return this.#highColor;
  }

  /**
   * @returns {GlColor} the color of this biome in debug rendering mode
   */
  get debugColor() {
    return this.#debugColor;
  }

  get latitudeAverage() {
    return this.#definition.latitude?.average;
  }

  get latitudeSigma() {
    return this.#definition.latitude?.sigma;
  }

  isContinent() {
    return !this.#definition.maritime;
  }

  isMaritime() {
    return !this.isContinent();
  }

  /**
   * Picks the biome of a neighbour spreading from this one, within the same pool.
   * Draws one random number for pool biomes, none for the others.
   *
   * @returns {string} a biome name
   */
  stay() {
    const stay = this.#definition.stay;
    if (!stay) return this.name;
    return this.#random() < stay.chance ? stay.then : stay.otherwise;
  }
}

/**
 * The biomes of each pool. Key order matters: latitude probabilities are accumulated in this order.
 */
export const BIOMESPOOL = {
  Temperate: ["Forest", "Plain"],
  Dry: ["Desert", "Savana"],
  Humid: ["Swamp", "Jungle"],
  Cold: ["Taiga", "Tundra"],
};

/**
 * The biome registry, by name. Set by createBiomes().
 */
export let BIOMES;

/**
 * Instantiates every biome and stores them in BIOMES. Ids follow BIOME_DEFINITIONS, starting at 0.
 *
 * @param {function} random a function that generates a number between 0 and 1
 * @returns {Object}        the new biome registry
 */
export const createBiomes = (random) => {
  const ids = new Counter(0);
  BIOMES = Object.fromEntries(
    BIOME_DEFINITIONS.map((definition) => [definition.name, new Biome(ids.next(), definition, random)]),
  );
  return BIOMES;
};

/**
 * Picks a biome of the given pool uniformly.
 *
 * @param {string} pool       a key of BIOMESPOOL
 * @param {function} random   a function that generates a number between 0 and 1
 * @returns {Biome}
 */
export const randomBiomeFromPool = (pool, random) => BIOMES[randomElement(BIOMESPOOL[pool], random)];
