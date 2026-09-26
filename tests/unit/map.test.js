import { expect, test } from "vitest";
import { MapController } from "../../src/map/map.js";

test("zoom is clamped to [0, 7] instead of ignored", () => {
  const camera = { zoom: 1, updateGl: () => {} };
  const controller = new MapController({ camera });
  for (let i = 0; i < 5; i++) controller.zoom(-0.4);
  expect(camera.zoom).toBe(0);
  controller.zoom(10);
  expect(camera.zoom).toBe(7);
  controller.zoom(0.4);
  expect(camera.zoom).toBe(7);
});

test("moving keeps the camera within the world, as setView and links do", () => {
  const camera = { posX: 4900, posY: -4900, zoom: 3, updateGl: () => {} };
  const controller = new MapController({ camera });
  controller.move(500, -500);
  expect(camera.posX).toBe(5000);
  expect(camera.posY).toBe(-5000);
  controller.move(-20000, 20000);
  expect(camera.posX).toBe(-5000);
  expect(camera.posY).toBe(5000);
});
