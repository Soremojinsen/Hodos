import { expect, test } from "vitest";
import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../../src/constants.js";
import {
  cameraView,
  screenToWorld,
  subView,
  viewBounds,
  viewMatrix,
  worldToScreen,
} from "../../src/map/view.js";

// The matrix Camera.updateGl computed before views existed
const legacyMatrix = (posX, posY, zoom, width, height) => {
  const zoomFactor = 2 ** zoom;
  const scaleX = (TILE_PIXEL_SIZE / WORLD_SIZE / (width / 2)) * zoomFactor;
  const scaleY = (TILE_PIXEL_SIZE / WORLD_SIZE / (height / 2)) * zoomFactor;
  // prettier-ignore
  return new Float32Array([
    scaleX, 0, 0, 0,
    0, scaleY, 0, 0,
    0, 0, 0, 0,
    -(posX + WORLD_SIZE / 2) * scaleX, -(posY + WORLD_SIZE / 2) * scaleY, 0, 1,
  ]);
};

test.each([
  [0, 0, 1, 1000, 700],
  [120, -340, 2.4, 1000, 700],
  [-5000, 5000, 7, 400, 800],
])(
  "the camera matrix is unchanged at %d, %d, zoom %d, %dx%d",
  (posX, posY, zoom, width, height) => {
    const matrix = viewMatrix(cameraView({ posX, posY, zoom }, width, height));
    const legacy = legacyMatrix(posX, posY, zoom, width, height);
    expect(matrix).toBeInstanceOf(Float32Array);
    expect(matrix).toHaveLength(16);
    matrix.forEach((value, i) => {
      expect(Math.abs(value - legacy[i])).toBeLessThanOrEqual(Math.abs(legacy[i]) * 1e-6);
    });
  },
);

test("the camera view is centred on the camera and scaled by the zoom", () => {
  expect(cameraView({ posX: 100, posY: -200, zoom: 1 }, 1000, 700)).toEqual({
    centerX: 5100,
    centerY: 4800,
    pixelsPerUnit: (TILE_PIXEL_SIZE * 2) / WORLD_SIZE,
    width: 1000,
    height: 700,
  });
});

const view = { centerX: 5000, centerY: 5000, pixelsPerUnit: 0.0512, width: 1000, height: 700 };

test("the view centre is the middle pixel, and north is up", () => {
  expect(worldToScreen(view, 5000, 5000)).toEqual({ x: 500, y: 350 });
  expect(worldToScreen(view, 5000, 6000).y).toBeLessThan(350);
  expect(worldToScreen(view, 6000, 5000).x).toBeGreaterThan(500);
});

test("screen and world conversions are inverse", () => {
  const world = screenToWorld(view, 123, 456);
  const screen = worldToScreen(view, world.x, world.y);
  expect(screen.x).toBeCloseTo(123, 9);
  expect(screen.y).toBeCloseTo(456, 9);
});

test("the bounds are the world area the view shows", () => {
  const bounds = viewBounds(view);
  expect(bounds.minX).toBeCloseTo(5000 - 500 / 0.0512, 9);
  expect(bounds.maxX).toBeCloseTo(5000 + 500 / 0.0512, 9);
  expect(bounds.minY).toBeCloseTo(5000 - 350 / 0.0512, 9);
  expect(bounds.maxY).toBeCloseTo(5000 + 350 / 0.0512, 9);
});

test("a sub view shows its part of the view at the same scale", () => {
  expect(subView(view, { x: 0, y: 0, width: 1000, height: 700 })).toEqual(view);
  const topLeft = viewBounds(subView(view, { x: 0, y: 0, width: 500, height: 350 }));
  const whole = viewBounds(view);
  expect(topLeft.minX).toBeCloseTo(whole.minX, 9);
  expect(topLeft.maxY).toBeCloseTo(whole.maxY, 9);
  expect(topLeft.maxX).toBeCloseTo(5000, 9);
  expect(topLeft.minY).toBeCloseTo(5000, 9);
});
