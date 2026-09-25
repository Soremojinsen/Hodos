import { Delaunay } from "d3-delaunay";
import { expect, test } from "vitest";
import { WorldSampler } from "../../src/generation/fields.js";
import {
  TILE_CELLS_SIDE,
  buildTile,
  siteAt,
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
    indices: fnv(tile.indices),
  }).toMatchSnapshot();
});
