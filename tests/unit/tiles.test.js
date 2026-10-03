import { Delaunay } from "d3-delaunay";
import { polygonArea } from "d3-polygon";
import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { DELTA_POINT, WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { bankAt, riverThreshold } from "../../src/generation/rivers.js";
import {
  TILE_CELLS_SIDE,
  buildTile,
  siteAt,
  sitesIn,
  tileCells,
  tilePoints,
  tileSize,
} from "../../src/generation/tiles.js";
import { generateWorld } from "../../src/generation/world.js";

const SEED = "12345";
const sampler = new WorldSampler(generateWorld(SEED));

/**
 * The Voronoi cells of a tile computed from its 5 × 5 block of tiles: the reference its 3 × 3
 * computation must match, so any two neighbouring tiles agree on their shared border.
 */
const referencePolygons = (z, x, y) => {
  const size = tileSize(z);
  const blocks = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) blocks.push(...tilePoints(SEED, z, x + dx, y + dy));
  }
  const voronoi = new Delaunay(blocks).voronoi([
    (x - 2) * size,
    (y - 2) * size,
    (x + 3) * size,
    (y + 3) * size,
  ]);
  const polygons = new Map();
  for (let i = 0; i < blocks.length / 2; i++) {
    polygons.set(`${blocks[2 * i]},${blocks[2 * i + 1]}`, voronoi.cellPolygon(i).slice(0, -1));
  }
  return polygons;
};

/**
 * Whether two rings have the same points in the same cyclic order, whichever point they start at.
 */
const sameRing = (a, b) => {
  if (a.length !== b.length) return false;
  const close = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  const start = b.findIndex((point) => close(point, a[0]));
  return start >= 0 && a.every((point, i) => close(point, b[(start + i) % b.length]));
};

const fnv = (typed) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
};

test("tile points are a jittered grid inside the tile, drawn from the seed and position", () => {
  const [z, x, y] = [3, 5, 2];
  const size = tileSize(z);
  const step = size / TILE_CELLS_SIDE;
  const points = tilePoints(SEED, z, x, y);
  expect(points).toHaveLength(2 * TILE_CELLS_SIDE ** 2);
  for (let i = 0; i < points.length / 2; i++) {
    const col = i % TILE_CELLS_SIDE;
    const row = Math.floor(i / TILE_CELLS_SIDE);
    expect(points[2 * i]).toBeGreaterThan(x * size + col * step);
    expect(points[2 * i]).toBeLessThan(x * size + (col + 1) * step);
    expect(points[2 * i + 1]).toBeGreaterThan(y * size + row * step);
    expect(points[2 * i + 1]).toBeLessThan(y * size + (row + 1) * step);
  }
  expect(tilePoints(SEED, z, x, y)).toEqual(points);
  expect(tilePoints("other", z, x, y)).not.toEqual(points);
});

test.each([
  [2, 1, 1],
  [3, 0, 5],
  [5, 17, 12],
  [7, 127, 0],
])("tile %i/%i/%i: cells match a larger Voronoi, so neighbours agree", (z, x, y) => {
  const reference = referencePolygons(z, x, y);
  const cells = tileCells(SEED, z, x, y);
  expect(cells).toHaveLength(TILE_CELLS_SIDE ** 2);
  for (const cell of cells) {
    expect(sameRing(cell.ring, reference.get(cell.site.join(",")))).toBe(true);
  }
});

test("a tile is the same whatever was generated before", () => {
  const first = buildTile(sampler, 3, 4, 4);
  buildTile(sampler, 5, 1, 30);
  buildTile(sampler, 0, 0, 0);
  expect(buildTile(new WorldSampler(generateWorld(SEED)), 3, 4, 4)).toEqual(first);
  expect(buildTile(sampler, 3, 4, 4)).toEqual(first);
});

test("vertices carry the sampled altitude, sea level at sea, and each cell one biome", () => {
  const z = 3;
  const tile = buildTile(sampler, z, 2, 4);
  const vertexCount = tile.biomeIds.length;
  expect(tile.positions).toHaveLength(3 * vertexCount);
  expect(tile.debugColors).toHaveLength(3 * vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const [x, y, altitude] = tile.positions.subarray(3 * v, 3 * v + 3);
    const sample = sampler.sampleAt(x, y, z);
    // A cell centre gets its own sample; a corner gets the sample at the corner. Both are the
    // sample at the vertex position, so this holds for every vertex (within float32 rounding).
    expect(altitude).toBeCloseTo(sample.land ? sample.altitude : -0.1, 5);
  }
  for (let i = 0; i < tile.indices.length; i += 3) {
    const [a, b, c] = tile.indices.subarray(i, i + 3);
    expect(Math.max(a, b, c)).toBeLessThan(vertexCount);
    expect(tile.biomeIds[b]).toBe(tile.biomeIds[a]);
    expect(tile.biomeIds[c]).toBe(tile.biomeIds[a]);
  }
});

test("each cell vertex carries the slope of the land under it, flat at sea", () => {
  const z = 3;
  const tile = buildTile(sampler, z, 2, 4);
  const vertexCount = tile.biomeIds.length;
  expect(tile.slopes).toHaveLength(2 * vertexCount);
  let sea = 0;
  for (let v = 0; v < vertexCount; v++) {
    const [x, y, altitude] = tile.positions.subarray(3 * v, 3 * v + 3);
    const [dx, dy] = tile.slopes.subarray(2 * v, 2 * v + 2);
    if (altitude < 0) {
      sea++;
      expect([dx, dy]).toEqual([0, 0]);
    } else {
      // Positions are float32: the slope at the rounded position differs by far less than this
      const [ex, ey] = sampler.slopeAt(x, y, z);
      expect(dx).toBeCloseTo(ex, 6);
      expect(dy).toBeCloseTo(ey, 6);
    }
  }
  expect(sea).toBeGreaterThan(0);
  expect(sea).toBeLessThan(vertexCount);
});

test("siteAt finds the drawn cell, even next to its border", () => {
  for (const [z, x, y] of [
    [0, 0, 0],
    [4, 5, 6],
    [7, 64, 70],
  ]) {
    tileCells(SEED, z, x, y).forEach((cell, i) => {
      if (i % 37 !== 0) return;
      for (const [px, py] of cell.ring) {
        // 90 % of the way from the site to a corner: inside the (convex) cell, near its border
        const inside = [
          cell.site[0] + 0.9 * (px - cell.site[0]),
          cell.site[1] + 0.9 * (py - cell.site[1]),
        ];
        expect(siteAt(SEED, ...inside, z)).toEqual(cell.site);
      }
    });
  }
});

test("siteAt on the world's edge finds a drawn cell, not its mirror image outside", () => {
  for (const z of [0, 3, 7]) {
    for (const [px, py] of [
      [0, 0],
      [0, 5000],
      [5000, 0],
      [0, WORLD_SIZE],
      [WORLD_SIZE, 0],
      [WORLD_SIZE, WORLD_SIZE],
    ]) {
      const [x, y] = siteAt(SEED, px, py, z);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(WORLD_SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(WORLD_SIZE);
    }
  }
});

test("sitesIn finds the same sites as siteAt over an area, up to the world's edges", () => {
  for (const [z, area] of [
    [0, [0, 0, WORLD_SIZE, WORLD_SIZE]],
    [3, [-10, 4000, 900, 4900]],
    [7, [5000, 9800, 5300, WORLD_SIZE]],
  ]) {
    const siteOf = sitesIn(SEED, z, area);
    for (let k = 0; k <= 20; k++) {
      for (let l = 0; l <= 20; l++) {
        const px = Math.min(Math.max(area[0] + ((area[2] - area[0]) * k) / 20, 0), WORLD_SIZE);
        const py = Math.min(Math.max(area[1] + ((area[3] - area[1]) * l) / 20, 0), WORLD_SIZE);
        expect(siteOf(px, py)).toEqual(siteAt(SEED, px, py, z));
      }
    }
  }
});

test("sitesIn finds the same sites as siteAt past the world's edges, as far as trees look", () => {
  // A tile's tree grid reaches 2 cells and a square past the tile: up to 5 squares out
  for (const z of [0, 4, 7]) {
    const step = tileSize(z) / TILE_CELLS_SIDE;
    const far = 6 * step;
    const siteOf = sitesIn(SEED, z, [-far, -far, WORLD_SIZE + far, WORLD_SIZE + far]);
    for (let k = 0; k <= 60; k++) {
      const along = (WORLD_SIZE * k) / 60;
      for (let d = 0; d <= far; d += step / 4) {
        for (const [px, py] of [
          [-d, along],
          [WORLD_SIZE + d, along],
          [along, -d],
          [along, WORLD_SIZE + d],
        ]) {
          expect(siteOf(px, py)).toEqual(siteAt(SEED, px, py, z));
        }
      }
    }
  }
});

test("a world with land past its edge builds its edge tiles", () => {
  // Seed 4 has land on its left edge, which treeless land past the edge checks for floodplains
  const watered = new WorldSampler(withWater(generateWorld("4")));
  expect(() => buildTile(watered, 4, 0, 7)).not.toThrow();
});

test("a deeper level draws the same coast with more, smaller cells", () => {
  const coastalCells = (z, x, y) =>
    tileCells(SEED, z, x, y).filter((cell) => {
      const land = sampler.sampleAt(...cell.site, z).land;
      return cell.ring.some(([px, py]) => sampler.sampleAt(px, py, z).land !== land);
    }).length;
  // Tile 3/1/4 and its 16 children at level 5 cover the same area (measured ratio ≈ 4)
  const shallow = coastalCells(3, 1, 4);
  let deep = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) deep += coastalCells(5, 4 + i, 16 + j);
  expect(shallow).toBeGreaterThan(50);
  expect(deep).toBeGreaterThan(3 * shallow);
});

test("tile 2/1/1 of seed 12345 stays the same", () => {
  const tile = buildTile(sampler, 2, 1, 1);
  expect({
    vertices: tile.biomeIds.length,
    triangles: tile.indices.length / 3,
    positions: fnv(tile.positions),
    biomeIds: fnv(tile.biomeIds),
    debugColors: fnv(tile.debugColors),
    slopes: fnv(tile.slopes),
    indices: fnv(tile.indices),
  }).toMatchSnapshot();
});

test("tiles outside the world mirror the points of the tile across the world's edge", () => {
  const z = 2;
  const last = 2 ** z - 1;
  const mirrored = (points, flipX, flipY) =>
    points.map((value, i) => {
      if (i % 2 === 0) return flipX === null ? value : 2 * flipX - value;
      return flipY === null ? value : 2 * flipY - value;
    });
  const sorted = (points) => {
    const pairs = [];
    for (let i = 0; i < points.length; i += 2) pairs.push([points[i], points[i + 1]]);
    return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  const expectMirror = ([x, y], [mx, my], flipX, flipY) => {
    const expected = mirrored(tilePoints(SEED, z, mx, my), flipX, flipY);
    const actual = sorted(tilePoints(SEED, z, x, y));
    sorted(expected).forEach(([px, py], i) => {
      expect(actual[i][0]).toBeCloseTo(px, 9);
      expect(actual[i][1]).toBeCloseTo(py, 9);
    });
  };
  expectMirror([-1, 1], [0, 1], 0, null);
  expectMirror([last + 1, 2], [last, 2], WORLD_SIZE, null);
  expectMirror([3, -1], [3, 0], null, 0);
  expectMirror([-1, last + 1], [0, last], 0, WORLD_SIZE);
});

test("the cells of a level cover the world exactly: straight edges, no notches", () => {
  for (const z of [0, 1, 2]) {
    let area = 0;
    // The extreme corners, checked once per level: an expect per corner is half a million calls
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        for (const cell of tileCells(SEED, z, x, y)) {
          for (const [px, py] of cell.ring) {
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
          area += Math.abs(polygonArea(cell.ring));
        }
      }
    }
    expect(minX).toBeGreaterThanOrEqual(-1e-6);
    expect(minY).toBeGreaterThanOrEqual(-1e-6);
    expect(maxX).toBeLessThanOrEqual(WORLD_SIZE + 1e-6);
    expect(maxY).toBeLessThanOrEqual(WORLD_SIZE + 1e-6);
    expect(area / WORLD_SIZE ** 2).toBeCloseTo(1, 9);
  }
});

const watered = new WorldSampler(withWater(generateWorld(SEED)));

test("rivers are a mesh of their own, at sea level, over the same cells", () => {
  const tile = buildTile(watered, 3, 2, 3);
  const land = buildTile(sampler, 3, 2, 3);
  for (const key of ["positions", "indices", "slopes"]) {
    expect(tile[key]).toEqual(land[key]);
  }
  expect(land.riverIndices).toHaveLength(0);
  expect(tile.riverIndices.length).toBeGreaterThan(0);
  const vertexCount = tile.riverPositions.length / 3;
  expect(tile.riverShapes).toHaveLength(3 * vertexCount);
  expect(Math.max(...tile.riverIndices)).toBeLessThan(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    expect(tile.riverPositions[3 * v + 2]).toBeCloseTo(-0.1, 5);
  }
});

test("tiles stay within 16-bit indices at every level, even around a river mouth", () => {
  const { sites, to, mouth } = watered.rivers;
  const k = mouth.indexOf(1);
  const [bx, by] = [sites[2 * to[k]], sites[2 * to[k] + 1]];
  for (let z = 0; z <= 7; z++) {
    const size = tileSize(z);
    const tile = buildTile(watered, z, Math.floor(bx / size), Math.floor(by / size));
    expect(tile.biomeIds.length).toBeLessThanOrEqual(0x10000);
    expect(tile.riverPositions.length / 3).toBeLessThanOrEqual(0x10000);
  }
});

test("tile 2/1/1 of seed 12345 with water stays the same", () => {
  const tile = buildTile(watered, 2, 1, 1);
  expect({
    vertices: tile.biomeIds.length,
    triangles: tile.indices.length / 3,
    riverTriangles: tile.riverIndices.length / 3,
    positions: fnv(tile.positions),
    slopes: fnv(tile.slopes),
    biomeIds: fnv(tile.biomeIds),
    indices: fnv(tile.indices),
    riverPositions: fnv(tile.riverPositions),
    riverShapes: fnv(tile.riverShapes),
    riverIndices: fnv(tile.riverIndices),
  }).toMatchSnapshot();
});

test("delta land is flat: its vertices have no slope", () => {
  const water = withWater(generateWorld(SEED));
  const i = water.wetlands.indexOf(DELTA_POINT);
  expect(i).toBeGreaterThanOrEqual(0);
  const z = 5;
  const size = tileSize(z);
  const [x, y] = [water.waterSites[2 * i], water.waterSites[2 * i + 1]];
  const tile = buildTile(watered, z, Math.floor(x / size), Math.floor(y / size));
  let flat = 0;
  for (let v = 0; v < tile.biomeIds.length; v++) {
    const [px, py] = tile.positions.subarray(3 * v, 3 * v + 2);
    const sample = watered.sampleAt(px, py, z);
    if (!sample.flat) continue;
    flat++;
    expect([...tile.slopes.subarray(2 * v, 2 * v + 2)]).toEqual([0, 0]);
  }
  expect(flat).toBeGreaterThan(0);
});

/**
 * Tiles at levels 3 to 5 holding a point of a river drawn there that flows through a desert or
 * a savanna, where floodplains are.
 */
const dryRiverTiles = (sampler) => {
  const dry = ["Desert", "Savana"].map((n) => BIOME_DEFINITIONS.findIndex((d) => d.name === n));
  const { sites, from, flow } = sampler.rivers;
  const tiles = [];
  for (const z of [3, 4, 5]) {
    const k = from.findIndex(
      (a, e) =>
        flow[e] >= riverThreshold(z) &&
        dry.includes(sampler.sampleAt(sites[2 * a], sites[2 * a + 1], z).biome),
    );
    if (k < 0) continue;
    const size = tileSize(z);
    tiles.push([
      z,
      Math.floor(sites[2 * from[k]] / size),
      Math.floor(sites[2 * from[k] + 1] / size),
    ]);
  }
  return tiles;
};

test("cells of dry land beside a river are floodplain", () => {
  const FLOODPLAIN = BIOME_DEFINITIONS.findIndex((d) => d.name === "floodplain");
  let floodplains = 0;
  const tiles = dryRiverTiles(watered);
  expect(tiles.length).toBeGreaterThan(0);
  for (const [z, x, y] of tiles) {
    const tile = buildTile(watered, z, x, y);
    const cells = tileCells(SEED, z, x, y);
    let v = 0;
    for (const cell of cells) {
      const biome = tile.biomeIds[v];
      const sample = watered.sampleAt(cell.site[0], cell.site[1], z);
      const expected =
        sample.land && bankAt(watered, ...cell.site, z, sample.biome) ? FLOODPLAIN : sample.biome;
      expect(biome).toBe(expected);
      if (biome === FLOODPLAIN) floodplains++;
      v += 1 + cell.ring.length;
    }
  }
  expect(floodplains).toBeGreaterThan(0);
});
