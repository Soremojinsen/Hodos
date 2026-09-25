import { WORLD_SIZE } from "../constants.js";
import { BIOMES, BIOMESPOOL } from "./biomes.js";
import { normalFunction } from "./util.js";

/**
 * A convex polygon and its barycenter.
 */
export class Cell {
  #center;
  #ring = Array();
  biome;

  /**
   * Constructs a world cell.
   *
   * @param x           {Number}   the X coordinate of the cell's centroid
   * @param y           {Number}   the Y coordinate of the cell's centroid
   * @param z           {Number}   the altitude of the cell's centroid
   */
  constructor(x, y, z) {
    this.#center = new Point(x, y, z);
    this.#ring = Array();
    this.continentNumber = 0;
    this.biome = BIOMES["ocean"];
  }

  get ring() {
    return this.#ring;
  }

  get z() {
    return this.#center.z;
  }

  set z(value) {
    this.#center.z = value;
  }

  get center() {
    return this.#center;
  }

  /**
   * @returns {GlColor} the color to draw this cell with in debug mode
   */
  get debugColor() {
    return this.biome.debugColor;
  }

  addPolygonPoint(point) {
    this.#ring.push(point);
  }

  removePolygonPoint() {
    return this.#ring.pop();
  }

  setContinent(nb) {
    this.continentNumber = nb;
  }

  setEarth() {
    this.biome = BIOMES["continent"];
  }

  isContinent() {
    return this.biome.isContinent();
  }

  isMaritime() {
    return this.biome.isMaritime();
  }

  getListOfLatitudeBiomesProbability() {
    let latitudeBiomesProbability = {};
    let sumOfAllProbabilities = 0;
    /*Value between 0 and 1 telling how North is a cell*/
    let latitudeRatio = this.#center.y / WORLD_SIZE;
    for (const biomeCategory in BIOMESPOOL) {
      let μ = BIOMES[BIOMESPOOL[biomeCategory][0]].latitudeAverage;
      let s = BIOMES[BIOMESPOOL[biomeCategory][0]].latitudeSigma;
      let res = normalFunction(latitudeRatio * 100, μ, s);
      latitudeBiomesProbability[biomeCategory] = res;
      sumOfAllProbabilities += res;
    }
    return [latitudeBiomesProbability, sumOfAllProbabilities];
  }

  getBiomeType(random) {
    let biomeProba = this.getListOfLatitudeBiomesProbability();
    let biomeDico = biomeProba[0];
    let normalisationValue = biomeProba[1];
    let prob = random();
    let check = 0;
    for (let b in biomeDico) {
      check += biomeDico[b] / normalisationValue;
      if (prob < check) return b;
    }
  }

  getBiomePool() {
    return this.biome.biomePool;
  }
}

/**
 * A 3D point object.
 */
export class Point {
  #x;
  #y;
  #z;

  /**
   *
   * @param {Number} x x coordinate of the point
   * @param {Number} y y coordinate of the point
   * @param {Number} z z coordinate of the point
   */
  constructor(x, y, z) {
    this.#x = x;
    this.#y = y;
    this.#z = z;
  }

  get x() {
    return this.#x;
  }

  set x(value) {
    this.#x = value;
  }

  get y() {
    return this.#y;
  }

  set y(value) {
    this.#y = value;
  }

  get z() {
    return this.#z;
  }

  set z(value) {
    this.#z = value;
  }

  get coordinates() {
    return [this.#x, this.#y, this.#z];
  }
}
