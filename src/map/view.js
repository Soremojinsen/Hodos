import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";

/**
 * A view is a rectangle of pixels showing part of the world:
 * { centerX, centerY, pixelsPerUnit, width, height }.
 * The center is in world units. World y grows northwards (up), pixel y grows downwards.
 * The screen, an export and each export chunk are views.
 */

/**
 * The view of the camera on a canvas of the given size.
 *
 * @param camera {{posX: Number, posY: Number, zoom: Number}}
 */
export const cameraView = (camera, width, height) => ({
  centerX: camera.posX + WORLD_SIZE / 2,
  centerY: camera.posY + WORLD_SIZE / 2,
  pixelsPerUnit: (TILE_PIXEL_SIZE * Math.pow(2, camera.zoom)) / WORLD_SIZE,
  width,
  height,
});

/**
 * The matrix the world shaders use to draw a view (world coordinates to clip space).
 */
export const viewMatrix = (view) => {
  const scaleX = (2 * view.pixelsPerUnit) / view.width;
  const scaleY = (2 * view.pixelsPerUnit) / view.height;
  // prettier-ignore
  return new Float32Array([
    scaleX, 0, 0, 0,
    0, scaleY, 0, 0,
    0, 0, 0, 0,
    -view.centerX * scaleX, -view.centerY * scaleY, 0, 1,
  ]);
};

/**
 * The world point under a pixel of the view.
 */
export const screenToWorld = (view, px, py) => ({
  x: view.centerX + (px - view.width / 2) / view.pixelsPerUnit,
  y: view.centerY + (view.height / 2 - py) / view.pixelsPerUnit,
});

/**
 * The pixel of the view where a world point is.
 */
export const worldToScreen = (view, x, y) => ({
  x: (x - view.centerX) * view.pixelsPerUnit + view.width / 2,
  y: view.height / 2 - (y - view.centerY) * view.pixelsPerUnit,
});

/**
 * The world area the view shows.
 */
export const viewBounds = (view) => {
  const halfWidth = view.width / 2 / view.pixelsPerUnit;
  const halfHeight = view.height / 2 / view.pixelsPerUnit;
  return {
    minX: view.centerX - halfWidth,
    maxX: view.centerX + halfWidth,
    minY: view.centerY - halfHeight,
    maxY: view.centerY + halfHeight,
  };
};

/**
 * The view of a pixel rectangle of another view, at the same scale.
 *
 * @param rect {{x: Number, y: Number, width: Number, height: Number}} in pixels of view
 */
export const subView = (view, rect) => {
  const center = screenToWorld(view, rect.x + rect.width / 2, rect.y + rect.height / 2);
  return {
    centerX: center.x,
    centerY: center.y,
    pixelsPerUnit: view.pixelsPerUnit,
    width: rect.width,
    height: rect.height,
  };
};
