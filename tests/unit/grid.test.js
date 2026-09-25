import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import {
  drawGrid,
  hexCells,
  hexCenter,
  hexCorners,
  hexRadius,
  squareLines,
} from "../../src/overlay/grid.js";

test("square lines are multiples of the size, within the bounds and the world", () => {
  expect(squareLines(250, { minX: -100, maxX: 600, minY: 9800, maxY: 10500 })).toEqual({
    xs: [0, 250, 500],
    ys: [10000],
  });
});

test("square lines don't depend on the view: the grid is anchored to the world", () => {
  const a = squareLines(300, { minX: 1000, maxX: 2000, minY: 0, maxY: 100 }).xs;
  const b = squareLines(300, { minX: 1100, maxX: 2500, minY: 0, maxY: 100 }).xs;
  for (const x of [...a, ...b]) expect(x % 300).toBe(0);
  expect(a.filter((x) => x >= 1100)).toEqual(b.filter((x) => x <= 2000));
});

test("flat-top hexagons are size high and 2 radii wide", () => {
  const corners = hexCorners({ x: 0, y: 0 }, 300);
  const ys = corners.map((c) => c.y);
  const xs = corners.map((c) => c.x);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(300, 9);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * hexRadius(300), 9);
});

test("odd columns sit half a hexagon higher", () => {
  const radius = hexRadius(300);
  expect(hexCenter(300, 0, 0)).toEqual({ x: 0, y: 0 });
  expect(hexCenter(300, 1, 0).x).toBeCloseTo(1.5 * radius, 9);
  expect(hexCenter(300, 1, 0).y).toBe(150);
  expect(hexCenter(300, -1, 2).y).toBe(750);
  expect(hexCenter(300, 2, 1).y).toBe(300);
});

test("neighbouring hexagons share corners", () => {
  const a = hexCorners(hexCenter(300, 0, 0), 300);
  const b = hexCorners(hexCenter(300, 1, 0), 300);
  const shared = a.filter((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9));
  expect(shared).toHaveLength(2);
});

test("hexagons cover every point of the bounds inside the world", () => {
  const size = 250;
  const bounds = { minX: 4000, maxX: 5200, minY: -300, maxY: 900 };
  const cells = hexCells(size, bounds);
  const radius = hexRadius(size);
  for (let x = 4000; x <= 5200; x += 37) {
    for (let y = 0; y <= 900; y += 41) {
      const nearest = Math.min(...cells.map((c) => Math.hypot(c.center.x - x, c.center.y - y)));
      expect(nearest).toBeLessThanOrEqual(radius + 1e-9);
    }
  }
});

test("no hexagons outside the world", () => {
  expect(hexCells(250, { minX: -3000, maxX: -1000, minY: 0, maxY: 500 })).toEqual([]);
  expect(
    hexCells(250, { minX: 0, maxX: 500, minY: WORLD_SIZE + 500, maxY: WORLD_SIZE + 900 }),
  ).toEqual([]);
});

// A 2D context that records what is drawn
const recorder = () => {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    rect: record("rect"),
    clip: record("clip"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    stroke: record("stroke"),
    set strokeStyle(value) {
      calls.push(["strokeStyle", value]);
    },
    set lineWidth(value) {
      calls.push(["lineWidth", value]);
    },
  };
};

const view = { centerX: 5000, centerY: 5000, pixelsPerUnit: 0.1, width: 1000, height: 700 };
const count = (context, name) => context.calls.filter((c) => c[0] === name).length;

test("no grid, nothing drawn", () => {
  const context = recorder();
  drawGrid(context, view, { type: "none", size: 250, opacity: 40 });
  expect(context.calls).toEqual([]);
});

test("cells smaller than 6 pixels are not drawn", () => {
  const context = recorder();
  drawGrid(context, { ...view, pixelsPerUnit: 0.02 }, { type: "square", size: 250, opacity: 40 });
  expect(count(context, "stroke")).toBe(0);
});

test("a square grid is one stroke of one line per multiple, clipped to the world", () => {
  const context = recorder();
  drawGrid(context, view, { type: "square", size: 250, opacity: 50 }, 3);
  // The view shows x 0..10000 and y 1500..8500
  expect(count(context, "moveTo")).toBe(41 + 29);
  expect(count(context, "stroke")).toBe(1);
  expect(count(context, "clip")).toBe(1);
  expect(context.calls).toContainEqual(["strokeStyle", "rgba(40, 30, 20, 0.5)"]);
  expect(context.calls).toContainEqual(["lineWidth", 3]);
});

test("a hex grid draws one closed hexagon per cell", () => {
  const context = recorder();
  drawGrid(context, view, { type: "hex", size: 500, opacity: 40 });
  expect(count(context, "closePath")).toBe(count(context, "moveTo"));
  expect(count(context, "lineTo")).toBe(5 * count(context, "moveTo"));
  expect(count(context, "stroke")).toBe(1);
});
