import { expect, test } from "vitest";
import {
  chunkRects,
  exportOptions,
  exportView,
  gridLineWidth,
  isExportable,
} from "../../src/export/export.js";
import { flipRows } from "../../src/map/pixels.js";
import { subView, viewBounds } from "../../src/map/view.js";

const screen = { centerX: 5100, centerY: 4900, pixelsPerUnit: 0.0512, width: 1000, height: 700 };

test.each([
  [4096, 4096, true],
  [4097, 1, false],
  [1, 4097, false],
  [4000, 2800, true],
  [5200, 2800, false],
])("%dx%d exportable: %s", (width, height, expected) => {
  expect(isExportable(width, height)).toBe(expected);
});

test("the world export is the whole world square", () => {
  const view = exportView("world", 2048, screen);
  expect(view).toEqual({
    centerX: 5000,
    centerY: 5000,
    pixelsPerUnit: 0.2048,
    width: 2048,
    height: 2048,
  });
  expect(viewBounds(view)).toEqual({ minX: 0, maxX: 10000, minY: 0, maxY: 10000 });
});

test("the view export shows what the screen shows, larger", () => {
  const view = exportView("view", 2, screen);
  expect(view.width).toBe(2000);
  expect(view.height).toBe(1400);
  const a = viewBounds(view);
  const b = viewBounds(screen);
  for (const key of ["minX", "maxX", "minY", "maxY"]) expect(a[key]).toBeCloseTo(b[key], 9);
});

test("options too large for browsers are not allowed", () => {
  const wide = { ...screen, width: 1920, height: 1080 };
  expect(exportOptions("view", wide).map((o) => [o.size, o.width, o.height, o.allowed])).toEqual([
    [1, 1920, 1080, true],
    [2, 3840, 2160, true],
    [4, 7680, 4320, false],
  ]);
  expect(exportOptions("world", wide).every((o) => o.allowed)).toBe(true);
});

test("chunks tile the image exactly", () => {
  const rects = chunkRects(5000, 3000, 2048);
  expect(rects).toHaveLength(6);
  expect(rects.reduce((sum, r) => sum + r.width * r.height, 0)).toBe(5000 * 3000);
  expect(rects.at(-1)).toEqual({ x: 4096, y: 2048, width: 904, height: 952 });
});

test("neighbouring chunks show touching world areas", () => {
  const view = exportView("world", 1000, screen);
  const [a, b] = chunkRects(1000, 1000, 400).map((rect) => viewBounds(subView(view, rect)));
  expect(a.maxX).toBeCloseTo(b.minX, 9);
  expect(a.maxY).toBeCloseTo(10000, 9);
});

test.each([
  [500, 300, 1],
  [1000, 700, 1],
  [2048, 2048, 2],
  [4000, 2800, 4],
  [4096, 4096, 4],
])("grid lines of a %dx%d export are %d px wide", (width, height, expected) => {
  expect(gridLineWidth(width, height)).toBe(expected);
});

test("pixels read from WebGL are flipped and made opaque", () => {
  // 1x2 image: bottom row red (first in WebGL order), top row green, half transparent
  const pixels = new Uint8Array([255, 0, 0, 128, 0, 255, 0, 128]);
  expect(Array.from(flipRows(pixels, 1, 2))).toEqual([0, 255, 0, 255, 255, 0, 0, 255]);
});
