import { expect, test } from "vitest";
import {
  levelForView,
  levelForZoom,
  parentTile,
  tileKey,
  tilesInView,
} from "../../src/map/tile-grid.js";
import { cameraView } from "../../src/map/view.js";

const keys = (tiles) => tiles.map(({ z, x, y }) => tileKey(z, x, y));

test.each([
  [0, 0],
  [0.4, 0],
  [0.5, 1],
  [1.2, 1],
  [2.0000000000000004, 2],
  [2.4999999999999996, 3],
  [6.8, 7],
  [7, 7],
  [-1, 0],
  [9, 7],
])("zoom %d draws level %i", (zoom, level) => {
  expect(levelForZoom(zoom)).toBe(level);
});

test("the camera's view gets the camera's level, so a ×1 export matches the screen", () => {
  for (let zoom = 0; zoom <= 7; zoom += 0.1) {
    const view = cameraView({ posX: 0, posY: 0, zoom }, 1000, 700);
    expect(levelForView(view)).toBe(levelForZoom(zoom));
  }
});

test("a world export at 4096 px uses level 4", () => {
  expect(
    levelForView({
      centerX: 5000,
      centerY: 5000,
      pixelsPerUnit: 4096 / 10000,
      width: 4096,
      height: 4096,
    }),
  ).toBe(4);
});

test("the tiles of a view, nearest to its centre first", () => {
  // Level 2 tiles are 2500 units; this view spans x 3000–5500, y 1000–2000
  const view = { centerX: 4250, centerY: 1500, pixelsPerUnit: 0.1, width: 250, height: 100 };
  expect(keys(tilesInView(view, 2))).toEqual(["2/1/0", "2/2/0"]);
  expect(new Set(keys(tilesInView(view, 2, 1)))).toEqual(
    new Set(["2/1/0", "2/2/0", "2/0/0", "2/3/0", "2/0/1", "2/1/1", "2/2/1", "2/3/1"]),
  );
  // The visible tiles still come first with a margin
  expect(keys(tilesInView(view, 2, 1)).slice(0, 2)).toEqual(["2/1/0", "2/2/0"]);
});

test("a view ending exactly on a tile edge does not want the next tile", () => {
  const view = { centerX: 1250, centerY: 1250, pixelsPerUnit: 0.1, width: 250, height: 250 };
  expect(keys(tilesInView(view, 2))).toEqual(["2/0/0"]);
});

test("tiles are clamped to the world", () => {
  const view = cameraView({ posX: -5000, posY: 5000, zoom: 3 }, 1000, 700);
  for (const { z, x, y } of tilesInView(view, 3, 1)) {
    expect(z).toBe(3);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(8);
    expect(y).toBeLessThan(8);
  }
});

test("a view outside the world wants no tiles", () => {
  const view = { centerX: -3000, centerY: 5000, pixelsPerUnit: 0.1, width: 100, height: 100 };
  expect(tilesInView(view, 2)).toEqual([]);
});

test("a tile's parent is the tile of the level above containing it", () => {
  expect(parentTile({ z: 3, x: 5, y: 2 })).toEqual({ z: 2, x: 2, y: 1 });
  expect(parentTile({ z: 1, x: 1, y: 1 })).toEqual({ z: 0, x: 0, y: 0 });
});
