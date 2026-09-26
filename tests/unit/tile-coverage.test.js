import { Delaunay } from "d3-delaunay";
import { expect, test } from "vitest";
import { tilePoints, tileSize } from "../../src/generation/tiles.js";
import { paddedView, tileKey, tilesInView } from "../../src/map/tile-grid.js";
import { TileManager } from "../../src/map/tiles.js";
import { cameraView, screenToWorld } from "../../src/map/view.js";

const SEED = "12345";

// The sites of a tile and its 8 neighbours, for nearest-site lookups: one per tile of a level
const neighbourhoods = new Map();
const neighbourhood = (z, x, y) => {
  const key = tileKey(z, x, y);
  if (!neighbourhoods.has(key)) {
    const points = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) points.push(...tilePoints(SEED, z, x + dx, y + dy));
    }
    neighbourhoods.set(key, { points, delaunay: new Delaunay(points) });
  }
  return neighbourhoods.get(key);
};

// The key of the tile of level z that owns a point: the one holding the point's nearest site
const ownerAt = (z, px, py) => {
  const size = tileSize(z);
  const { points, delaunay } = neighbourhood(z, Math.floor(px / size), Math.floor(py / size));
  const i = delaunay.find(px, py);
  return tileKey(z, Math.floor(points[2 * i] / size), Math.floor(points[2 * i + 1] / size));
};

test("every point of the view stays drawn while a finer level's tiles arrive", () => {
  const manager = new TileManager({
    request() {},
    bake: (data) => data,
    destroy() {},
    onChange() {},
    maxInFlight: 1000,
  });
  // Everything at levels 0-2 is ready, as after browsing at zoom 2
  for (let z = 0; z <= 2; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) manager.receive({ z, x, y });
    }
  }
  const view = cameraView({ posX: 300, posY: -700, zoom: 3 }, 1000, 700);
  const level = 3;
  const tilesAtLevel = (k) => tilesInView(paddedView(view, k), k);
  const wanted = tilesAtLevel(level);
  manager.want(wanted);

  // The owners of each sample point at every level, every 2 px
  const samples = [];
  for (let px = 0; px < view.width; px += 2) {
    for (let py = 0; py < view.height; py += 2) {
      const { x, y } = screenToWorld(view, px, py);
      samples.push(Array.from({ length: level + 1 }, (_, z) => ownerAt(z, x, y)));
    }
  }
  const uncovered = () => {
    const drawn = new Set(manager.drawList(tilesAtLevel, level).map((t) => tileKey(t.z, t.x, t.y)));
    return samples.filter((owners) => !owners.some((key) => drawn.has(key))).length;
  };

  const gaps = { before: uncovered() };
  for (const tile of wanted) {
    manager.receive(tile);
    gaps[tileKey(tile.z, tile.x, tile.y)] = uncovered();
  }
  expect(Object.entries(gaps).filter(([, count]) => count > 0)).toEqual([]);
});
