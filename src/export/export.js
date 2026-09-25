import { WORLD_SIZE } from "../constants.js";
import { subView } from "../map/view.js";
import { drawGrid } from "../overlay/grid.js";

/**
 * The largest image browsers reliably handle: iOS Safari limits canvases to 16.7 M pixels.
 */
export const MAX_EXPORT_SIDE = 4096;
export const MAX_EXPORT_PIXELS = 16777216;

/**
 * Export sizes: pixels for the whole world, factors of the screen for the current view.
 */
export const WORLD_SIZES = [1024, 2048, 4096];
export const VIEW_FACTORS = [1, 2, 4];

export const isExportable = (width, height) =>
  width <= MAX_EXPORT_SIDE && height <= MAX_EXPORT_SIDE && width * height <= MAX_EXPORT_PIXELS;

/**
 * The view to export.
 *
 * @param area        {string} "world": the whole world as a size × size square;
 *                    "view": what the screen shows, size times larger
 * @param size        {Number}
 * @param screenView  the camera's view, see map/view.js
 */
export function exportView(area, size, screenView) {
  if (area === "world") {
    return {
      centerX: WORLD_SIZE / 2,
      centerY: WORLD_SIZE / 2,
      pixelsPerUnit: size / WORLD_SIZE,
      width: size,
      height: size,
    };
  }
  return {
    ...screenView,
    pixelsPerUnit: screenView.pixelsPerUnit * size,
    width: Math.round(screenView.width * size),
    height: Math.round(screenView.height * size),
  };
}

/**
 * The sizes offered for an area, with their pixel size and whether browsers can handle them.
 */
export function exportOptions(area, screenView) {
  const sizes = area === "world" ? WORLD_SIZES : VIEW_FACTORS;
  return sizes.map((size) => {
    const { width, height } = exportView(area, size, screenView);
    return { size, width, height, allowed: isExportable(width, height) };
  });
}

/**
 * Cuts an image into rectangles of at most chunkSize pixels a side, row by row from the top left.
 */
export function chunkRects(width, height, chunkSize) {
  const rects = [];
  for (let y = 0; y < height; y += chunkSize) {
    for (let x = 0; x < width; x += chunkSize) {
      rects.push({
        x,
        y,
        width: Math.min(chunkSize, width - x),
        height: Math.min(chunkSize, height - y),
      });
    }
  }
  return rects;
}

/**
 * Grid lines get thicker in large exports, so they look as on screen rather than as hairlines.
 */
export const gridLineWidth = (width, height) =>
  Math.max(1, Math.round(Math.max(width, height) / 1024));

/**
 * Draws a view of the map offscreen, chunk by chunk, then the grid over it.
 *
 * @param renderer  {MapRenderer} or anything with maxChunkSize and renderToPixels(view)
 * @param view      see map/view.js
 * @param grid      {Object|null} the grid settings, or null for no grid
 * @returns {HTMLCanvasElement}
 */
export function renderImage(renderer, view, grid) {
  const canvas = document.createElement("canvas");
  canvas.width = view.width;
  canvas.height = view.height;
  const context = canvas.getContext("2d");
  for (const rect of chunkRects(view.width, view.height, renderer.maxChunkSize)) {
    const pixels = renderer.renderToPixels(subView(view, rect));
    context.putImageData(new ImageData(pixels, rect.width, rect.height), rect.x, rect.y);
  }
  if (grid) drawGrid(context, view, grid, gridLineWidth(view.width, view.height));
  return canvas;
}

export const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded"))),
      "image/png",
    );
  });
