import { expect, test } from "vitest";
import { pageRects, printSize } from "../../src/export/print.js";

test("one page is the whole image", () => {
  expect(pageRects(4096, 4096, 1)).toEqual([
    { row: 0, col: 0, x: 0, y: 0, width: 4096, height: 4096 },
  ]);
});

test("2×2 pages overlap by 5% and reach the edges", () => {
  const rects = pageRects(1000, 1000, 2);
  expect(rects.map((r) => [r.row, r.col])).toEqual([
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
  expect(rects[0]).toEqual({ row: 0, col: 0, x: 0, y: 0, width: 513, height: 513 });
  expect(rects[1].x).toBe(487);
  expect(rects[1].x + rects[1].width).toBe(1000);
  expect(rects[3].y + rects[3].height).toBe(1000);
  const overlap = rects[0].width - rects[1].x;
  expect(overlap / rects[0].width).toBeCloseTo(0.05, 2);
});

test("3×3 pages cover the image and stay inside it", () => {
  const width = 4096;
  const height = 2867;
  const rects = pageRects(width, height, 3);
  expect(rects).toHaveLength(9);
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width);
    expect(r.y + r.height).toBeLessThanOrEqual(height);
  }
  for (let x = 0; x < width; x += 97) {
    for (let y = 0; y < height; y += 89) {
      expect(
        rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height),
      ).toBe(true);
    }
  }
});

test("prints are 4096 px on their longest side", () => {
  expect(printSize("world", { width: 1000, height: 700 })).toBe(4096);
  expect(printSize("view", { width: 1000, height: 700 })).toBeCloseTo(4.096, 9);
  expect(printSize("view", { width: 400, height: 800 })).toBeCloseTo(5.12, 9);
});
