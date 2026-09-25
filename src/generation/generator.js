import { Delaunay } from "d3-delaunay";
import { polygonCentroid } from "d3-polygon";
import { WORLD_SIZE } from "../constants.js";
import { Tile } from "../map/mesh.js";
import { aleaPRNG } from "../vendor/alea-prng.js";
import { noise } from "../vendor/perlin.js";
import { BIOMES, createBiomes, randomBiomeFromPool } from "./biomes.js";
import { Cell, Point } from "./geometry.js";
import {
  getRandomInRange,
  getRandomPointsIn2dRange,
  getRandomSeed,
  hashSeed,
  randomElement,
  sigma,
  chebyshevDistance,
} from "./util.js";

export class MapGenerator {
  #seed; // String (int converted to str)
  trianglesVertices; // Array [ [x0, y0], [x1, y1], ... ]
  delaunay; // d3-delaunay object
  #random;

  constructor(seed) {
    if (seed) {
      this.#seed = seed;
    } else {
      this.#seed = getRandomSeed();
    }
    this.#random = aleaPRNG(this.#seed);
    createBiomes(this.#random);
  }

  /**
   * Generates a tile so it can later be rendered.
   *
   * @param {Number} z the zoom level of the tile as an integer
   * @param {Number} x the x coordinate of the tile in the corresponding zoom level grid as an integer
   * @param {Number} y the y coordinate of the tile in the corresponding zoom level grid as an integer
   */
  generateTile(z, x, y) {
    this.seedCells = Array();
    let trianglesVertices = getRandomPointsIn2dRange(
      1000,
      0,
      WORLD_SIZE,
      this.#random
    );
    this.delaunay = Delaunay.from(trianglesVertices);
    this.lloydRelaxation(2);
    this.cells = this.createAllCells(
      this.delaunay.voronoi([0, 0, WORLD_SIZE, WORLD_SIZE])
    );
    this.generateMultipleContinentBurn(15, 0.4);
    this.generateIsland(0.01, 0.4);
    this.generateAltitude();
    this.generateBiome();
    this.generateCorruptedBurn();
    return new Tile(z, x, y, this.cells);
  }

  // create cell from the voronoid diagram
  createAllCells(voronoid) {
    let cells = Array();
    // All previously created point are temporary store here
    let createdPoint = new Map();
    // For every cell in Delaunay Graph create a Cell
    for (let i = 0; i < this.delaunay.points.length; i += 2) {
      cells.push(
        new Cell(
          this.delaunay.points[i],
          this.delaunay.points[i + 1],
          -1
        )
      );
      //Create an arrays with the point of the polygon
      voronoid.cellPolygon(i / 2).forEach((Element) => {
        if (!createdPoint.has(Element.toString())) {
          createdPoint.set(
            Element.toString(),
            new Point(Element[0], Element[1], -1) // -1 is for point is sea y default
          );
        }
        cells[i / 2].addPolygonPoint(createdPoint.get(Element.toString()));
      });
      cells[i / 2].removePolygonPoint();
      //cells[i / 2].createPolygonFromDelaunay(voronoid.cellPolygon(i / 2));
    }
    return cells;
  }

  /* Lloyd's relaxation of voronoi cells */
  /* 1 or 2 steps are doing the job quite right */
  lloydRelaxation(totalSteps) {
    for (let i = 0; i < totalSteps; i++) {
      let polygons = Array.from(
        this.delaunay.voronoi([0, 0, WORLD_SIZE, WORLD_SIZE]).cellPolygons()
      );
      this.trianglesVertices = polygons.map(polygonCentroid);
      this.delaunay = Delaunay.from(this.trianglesVertices);
    }
  }

  /* GENERATION METHOD */

  generateMultipleContinentBurn(numberOfContinent, rate) {
    let burn = Array();
    const MAP_SIZE_PERCENT_MARGIN = 0.1;
    // select i cell to be the seed of continent
    for (let i = 0; i < numberOfContinent; i++) {
      let cellIndex = this.delaunay.find(
        getRandomInRange(
          WORLD_SIZE * MAP_SIZE_PERCENT_MARGIN,
          WORLD_SIZE * (1 - MAP_SIZE_PERCENT_MARGIN),
          this.#random
        ),
        getRandomInRange(
          WORLD_SIZE * MAP_SIZE_PERCENT_MARGIN,
          WORLD_SIZE * (1 - MAP_SIZE_PERCENT_MARGIN),
          this.#random
        )
      );
      // Two continents can pick the same cell, keep the first one
      if (this.cells[cellIndex].isContinent()) continue;
      this.#claimForContinent(cellIndex, i + 1);
      this.seedCells.push(cellIndex);
      burn.push(cellIndex);
    }
    burn.unshift(-1);
    let proba = 1.0;
    // for every cell that can be earth
    while (burn.length > 0) {
      let cellIndex = burn.pop();
      //check if one cycle is do
      if (cellIndex === -1) {
        proba -= rate;
        if (burn.length !== 0) {
          burn.unshift(-1);
        }
      } else {
        for (let next of this.delaunay.neighbors(cellIndex)) {
          let distanceFromCenter = chebyshevDistance(
            this.cells[next].center.x,
            this.cells[next].center.y,
            WORLD_SIZE / 2,
            WORLD_SIZE / 2
          );
          if (
            this.#random() < proba * sigma(distanceFromCenter, WORLD_SIZE) &&
            !this.cells[next].isContinent()
          ) {
            burn.unshift(next);
            this.#claimForContinent(next, this.cells[cellIndex].continentNumber);
          }
        }
      }
    }
  }

  /**
   * Turns a cell into land of the given continent.
   * This happens when the cell is queued, so no other cell of the burn can claim it again.
   */
  #claimForContinent(cellIndex, continentNumber) {
    let cell = this.cells[cellIndex];
    cell.setContinent(continentNumber);
    cell.setEarth();
  }

  generateIsland(rate, fairyRate) {
    this.cells.forEach((cell) => {
      if (this.#random() < rate && cell.isMaritime()) {
        let distanceFromCenter = chebyshevDistance(
          cell.center.x,
          cell.center.y,
          WORLD_SIZE / 2,
          WORLD_SIZE / 2
        );
        if (distanceFromCenter < (WORLD_SIZE * 0.95) / 2) {
          if (this.#random() < fairyRate) {
            cell.biome = BIOMES["Fairy"];
          } else {
            cell.biome = BIOMES["island"];
          }
        }
      }
    });
  }

  /* Generate altitude V1*/
  generateAltitude() {
    const frequency = (1 / WORLD_SIZE) * 15;
    noise.seed(hashSeed(this.#seed));
    // Cells share their corners, so ocean goes second:
    // a corner on the coast is always at sea level, whatever the cell order
    this.cells.filter((cell) => cell.isContinent()).forEach((cell) => {
      // + 1) / 2 is for the output is between 0 and 1
      cell.center.z =
        (noise.simplex2(
          cell.center.x * frequency,
          cell.center.y * frequency
        ) +
          1) /
        2;
      cell.ring.forEach((point) => {
        point.z =
          (noise.simplex2(point.x * frequency, point.y * frequency) + 1) / 2;
      });
    });
    this.cells.filter((cell) => cell.isMaritime()).forEach((cell) => {
      cell.center.z = -0.1;
      cell.ring.forEach((point) => {
        point.z = -0.1;
      });
    });
  }

  get seed() {
    return this.#seed;
  }

  get random() {
    return this.#random;
  }

  /**
   * Spreads biomes from the continent seeds to every continent cell.
   */
  generateBiome() {
    let burn = Array();
    this.seedCells.forEach((nbCell) => {
      let nextBiome = this.cells[nbCell].getBiomeType(this.#random);
      this.cells[nbCell].biome = randomBiomeFromPool(nextBiome, this.#random);
      if (this.cells[nbCell].z > 0.8) {
        this.cells[nbCell].biome = BIOMES["Mountain"];
      }
      burn.push(nbCell);
    });
    while (burn.length > 0) {
      let current = burn.pop();

      for (let next of this.delaunay.neighbors(current)) {
        if (
          this.cells[next].isContinent() &&
          this.cells[next].getBiomePool() === "default"
        ) {
          if (this.cells[next].center.z > 0.8) {
            this.cells[next].biome = BIOMES["Mountain"];
          } else {
            // Keep the neighbour's pool if its latitude agrees, otherwise pick a biome from the new pool
            let nextBiome = this.cells[next].getBiomeType(this.#random);
            if (this.cells[current].getBiomePool() === nextBiome) {
              this.cells[next].biome = BIOMES[this.cells[current].biome.stay()];
            } else {
              this.cells[next].biome = randomBiomeFromPool(nextBiome, this.#random);
            }
          }
          burn.unshift(next);
        }
      }
    }
  }

  /**
   * Corrupts land around a continent seed, one ring of neighbours at a time.
   * The first ring is always corrupted, and each ring after it is less likely to be.
   */
  generateCorruptedBurn() {
    const RING_COUNT = 5; // the chance drops by 1 / RING_COUNT per ring
    let seed = randomElement(this.seedCells, this.#random);
    this.cells[seed].biome = BIOMES["Corrupted"];
    let ring = [seed];
    for (let i = 0; i < RING_COUNT && ring.length > 0; i++) {
      let proba = 1 - i / RING_COUNT;
      let nextRing = Array();
      for (let currentCell of ring) {
        for (let next of this.delaunay.neighbors(currentCell)) {
          let cell = this.cells[next];
          if (
            cell.isContinent() &&
            cell.biome !== BIOMES["Corrupted"] &&
            this.#random() < proba
          ) {
            cell.biome = BIOMES["Corrupted"];
            nextRing.push(next);
          }
        }
      }
      ring = nextRing;
    }
  }
}
