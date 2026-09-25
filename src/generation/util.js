export const getRandomInRange = (min, max, randomFunction) => {
  return randomFunction() * (max - min) + min;
};

/**
 * Picks an element of an array uniformly.
 *
 * @param {Array} array             a non-empty array
 * @param {function} randomFunction a function that generates a number between 0 and 1
 * @returns {*}                     one of the array's elements
 */
export const randomElement = (array, randomFunction) => {
  return array[Math.floor(randomFunction() * array.length)];
};

/**
 * Creates an array of two-dimensional arrays of numbers between lowerBound and upperBound.
 *
 * @param {Number} n                the number of points to create
 * @param {Number} lowerBound       the lower bound for the points coordinates (inclusive)
 * @param {Number} upperBound       the upper bound for the points coordinates (exclusive)
 * @param {function} randomFunction a function that generates a number between 0 and 1
 * @returns {*[]}                   the array of random 2d points, as an array of arrays
 */
export const getRandomPointsIn2dRange = (
  n,
  lowerBound,
  upperBound,
  randomFunction
) => {
  let arrayOfPoints = [];
  while (arrayOfPoints.length < n) {
    let x = getRandomInRange(lowerBound, upperBound, randomFunction);
    let y = getRandomInRange(lowerBound, upperBound, randomFunction);
    arrayOfPoints.push([x, y]);
  }
  return arrayOfPoints;
};

/**
 * Generates a random seed to use for map generation.
 *
 * @returns {string}  the string representation of an integer in the range [0, 1e9)
 */
export const getRandomSeed = () => {
  return Math.floor(Math.random() * 1e9).toString();
};

/**
 * Hashes a seed string (FNV-1a) into a seed for the noise library, which supports 2^16 values.
 *
 * @param {string} seed the map seed, numeric or not
 * @returns {Number}    an integer in the range [0, 65536)
 */
export const hashSeed = (seed) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 16) ^ hash) & 0xffff;
};

/**
 * Mathematical function that is multiplied to the probability that a cell is burnt when creating continent.
 *
 * @param {Number} x   the distance of the current cell from the center of the map
 * @param {Number} T   the size of the map [ex : min(height, width)]
 * @returns {Number}   a value between 0 (when the cell is on the edge) and 1 (when the cell is in the middle)
 */
export const sigma = (x, T) => {
  //let lambda = 100/T;
  let lambda = 0.001;
  let exp = Math.exp(-lambda * (x - T / 2));
  return Math.max(-2 / (1 + exp) + 1, 0);
};

/**
 * The Chebyshev distance between two points: the largest of the coordinate differences
 *
 * @param {Number} x1  x coordinate of first point
 * @param {Number} y1  y coordinate of first point
 * @param {Number} x2  x coordinate of second point
 * @param {Number} y2  y coordinate of second point
 * @returns {Number}   the Chebyshev distance
 */
export const chebyshevDistance = (x1, y1, x2, y2) => {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
};

export class Counter {
  #value;

  constructor(initialValue) {
    this.#value = initialValue;
  }

  next() {
    return this.#value++;
  }
}

/**
 * Normal function as seen here : https://zupimages.net/up/22/19/y80o.png
 *
 * @param {Number} x value between 0 and 100
 * @param {Number} mu average value of gaussian
 * @param {Number} sigma sigma value of gaussian
 * @returns {Number} value between 0 and 1
 */
export const normalFunction = (x, mu, sigma) => {
  let arg = -((x - mu) ** 2) / (2 * sigma ** 2);
  return Math.exp(arg);
};
