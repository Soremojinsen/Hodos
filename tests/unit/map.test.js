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
