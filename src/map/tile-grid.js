import { MAX_ZOOM, MIN_ZOOM, TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { TILE_CELLS_SIDE, tileSize } from "../generation/tiles.js";
import { viewBounds } from "./view.js";

/**
 * Tiles: level z has 2^z × 2^z tiles; tile z/x/y covers x·s to (x+1)·s and y·s to (y+1)·s in
 * world units, with s = WORLD_SIZE / 2^z. World y grows northwards, as everywhere else.
 */

export const tileKey = (z, x, y) => `${z}/${x}/${y}`;

/**
 * The tile level drawn at a camera zoom: the nearest whole level, so tiles are 181 to 362 px on
 * screen. The nudge keeps floating error (2.4999999999999996) on the side of the intended value.
 */
export const levelForZoom = (zoom) =>
  Math.min(Math.max(Math.round(zoom + 1e-9), MIN_ZOOM), MAX_ZOOM);

/**
 * The tile level for a view's scale: the same as levelForZoom for the camera's view.
 */
export const levelForView = (view) =>
  levelForZoom(Math.log2((view.pixelsPerUnit * WORLD_SIZE) / TILE_PIXEL_SIZE));

/**
 * The tiles of a level that a view shows, plus `margin` rings of tiles around them, inside the
 * world. Visible tiles come first, nearest to the view centre first, then the margin tiles.
 *
 * @returns {{z: Number, x: Number, y: Number}[]}
 */
export function tilesInView(view, level, margin = 0) {
  const size = WORLD_SIZE / 2 ** level;
  const count = 2 ** level;
  const bounds = viewBounds(view);
  const range = (min, max, extra) => [
    Math.max(Math.floor(min / size) - extra, 0),
    Math.min(Math.ceil(max / size) - 1 + extra, count - 1),
  ];
  const [visibleMinX, visibleMaxX] = range(bounds.minX, bounds.maxX, 0);
  const [visibleMinY, visibleMaxY] = range(bounds.minY, bounds.maxY, 0);
  const [minX, maxX] = range(bounds.minX, bounds.maxX, margin);
  const [minY, maxY] = range(bounds.minY, bounds.maxY, margin);
  const tiles = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const visible = x >= visibleMinX && x <= visibleMaxX && y >= visibleMinY && y <= visibleMaxY;
      const distance = Math.hypot((x + 0.5) * size - view.centerX, (y + 0.5) * size - view.centerY);
      tiles.push({ z: level, x, y, visible, distance });
    }
  }
  tiles.sort((a, b) => b.visible - a.visible || a.distance - b.distance);
  return tiles.map(({ z, x, y }) => ({ z, x, y }));
}

/**
 * A view padded by two cell widths of a level on every side, so tilesInView(paddedView(...))
 * also picks up the neighbour tiles whose cells can reach past their own tile's edge.
 *
 * A tile keeps only the cells whose site is inside it (generation/tiles.js tileCells), but a
 * cell's polygon is computed from its tile's 8 neighbours and can reach up to about one cell
 * width past the tile's own edge. When the neighbour that owns such a cell is not drawn, that
 * sliver is left at the clear colour, notching the tile's edge. Padding the view before finding
 * its tiles brings those neighbours in too.
 */
export function paddedView(view, level) {
  const padding = (2 * tileSize(level)) / TILE_CELLS_SIDE;
  return {
    ...view,
    width: view.width + 2 * padding * view.pixelsPerUnit,
    height: view.height + 2 * padding * view.pixelsPerUnit,
  };
}

/**
 * The tile of the level above that contains a tile.
 */
export const parentTile = ({ z, x, y }) => ({
  z: z - 1,
  x: Math.floor(x / 2),
  y: Math.floor(y / 2),
});
