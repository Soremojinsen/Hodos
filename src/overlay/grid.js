import { WORLD_SIZE } from "../constants.js";
import { viewBounds, worldToScreen } from "../map/view.js";

/**
 * Below this cell size in pixels the grid is not drawn: it would be a grey smear.
 */
export const MIN_CELL_PIXELS = 6;

/**
 * Dark ink, as rgb.
 */
export const GRID_COLOR = [40, 30, 20];

/**
 * The square grid lines within the bounds and the world: multiples of size.
 *
 * @returns {{xs: Number[], ys: Number[]}} world coordinates of the vertical and horizontal lines
 */
export function squareLines(size, bounds) {
  const lines = (min, max) => {
    const values = [];
    const last = Math.min(max, WORLD_SIZE);
    for (let i = Math.ceil(Math.max(min, 0) / size); i * size <= last; i++) values.push(i * size);
    return values;
  };
  return { xs: lines(bounds.minX, bounds.maxX), ys: lines(bounds.minY, bounds.maxY) };
}

/**
 * The radius (center to corner) of a flat-top hexagon whose flat sides are size apart.
 */
export const hexRadius = (size) => size / Math.sqrt(3);

/**
 * The center of a flat-top hexagon, in the "odd-q" layout: odd columns sit half a hexagon higher.
 * Hexagon (0, 0) is centered on the world origin.
 */
export function hexCenter(size, col, row) {
  return {
    x: col * 1.5 * hexRadius(size),
    y: row * size + (Math.abs(col) % 2 === 1 ? size / 2 : 0),
  };
}

/**
 * The six corners of a flat-top hexagon.
 */
export function hexCorners(center, size) {
  const radius = hexRadius(size);
  return Array.from({ length: 6 }, (_, i) => ({
    x: center.x + radius * Math.cos((Math.PI / 3) * i),
    y: center.y + radius * Math.sin((Math.PI / 3) * i),
  }));
}

/**
 * The hexagons touching the bounds, within the world.
 *
 * @returns {{col: Number, row: Number, center: {x: Number, y: Number}}[]}
 */
export function hexCells(size, bounds) {
  const minX = Math.max(bounds.minX, 0);
  const maxX = Math.min(bounds.maxX, WORLD_SIZE);
  const minY = Math.max(bounds.minY, 0);
  const maxY = Math.min(bounds.maxY, WORLD_SIZE);
  if (minX > maxX || minY > maxY) return [];
  const radius = hexRadius(size);
  const cells = [];
  const firstCol = Math.floor((minX - radius) / (1.5 * radius));
  const lastCol = Math.ceil((maxX + radius) / (1.5 * radius));
  for (let col = firstCol; col <= lastCol; col++) {
    for (let row = Math.floor(minY / size) - 1; row <= Math.ceil(maxY / size) + 1; row++) {
      const center = hexCenter(size, col, row);
      if (
        center.x + radius < minX ||
        center.x - radius > maxX ||
        center.y + size / 2 < minY ||
        center.y - size / 2 > maxY
      ) {
        continue;
      }
      cells.push({ col, row, center });
    }
  }
  return cells;
}

/**
 * Draws the grid on a 2D context showing a view. The grid covers the world square only.
 *
 * @param context   {CanvasRenderingContext2D}
 * @param view      see map/view.js
 * @param settings  {{type: string, size: Number, opacity: Number}} see state/url-state.js
 * @param lineWidth {Number} in pixels
 */
export function drawGrid(context, view, settings, lineWidth = 1) {
  if (settings.type === "none") return;
  if (settings.size * view.pixelsPerUnit < MIN_CELL_PIXELS) return;
  const bounds = viewBounds(view);
  const toScreen = (x, y) => worldToScreen(view, x, y);

  context.save();
  const topLeft = toScreen(0, WORLD_SIZE);
  const bottomRight = toScreen(WORLD_SIZE, 0);
  context.beginPath();
  context.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  context.clip();

  context.beginPath();
  if (settings.type === "square") {
    const { xs, ys } = squareLines(settings.size, bounds);
    const bottom = Math.max(bounds.minY, 0);
    const top = Math.min(bounds.maxY, WORLD_SIZE);
    const left = Math.max(bounds.minX, 0);
    const right = Math.min(bounds.maxX, WORLD_SIZE);
    for (const x of xs) {
      const from = toScreen(x, bottom);
      const to = toScreen(x, top);
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
    for (const y of ys) {
      const from = toScreen(left, y);
      const to = toScreen(right, y);
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
  } else {
    for (const { center } of hexCells(settings.size, bounds)) {
      const [first, ...others] = hexCorners(center, settings.size).map((c) => toScreen(c.x, c.y));
      context.moveTo(first.x, first.y);
      for (const corner of others) context.lineTo(corner.x, corner.y);
      context.closePath();
    }
  }
  // One stroke: lines shared by two cells are not darker
  context.strokeStyle = `rgba(${GRID_COLOR.join(", ")}, ${settings.opacity / 100})`;
  context.lineWidth = lineWidth;
  context.stroke();
  context.restore();
}
