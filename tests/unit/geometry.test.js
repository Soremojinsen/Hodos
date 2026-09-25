import { beforeEach, expect, test } from "vitest";
import { BIOMES, createBiomes } from "../../src/generation/biomes.js";
import { Cell, Point } from "../../src/generation/geometry.js";

beforeEach(() => {
  createBiomes(Math.random);
});

test("Point constructor", () => {
  const point = new Point(404, 42, 418);
  expect([point.x, point.y, point.z]).toEqual([404, 42, 418]);
});

test("Point setters", () => {
  const point = new Point(0, 0, 0);
  point.x = 1;
  point.y = 2;
  point.z = 3;
  expect(point.coordinates).toEqual([1, 2, 3]);
});

test("Point coordinates", () => {
  expect(new Point(42, -43, 76).coordinates).toEqual([42, -43, 76]);
});

test("Cell constructor", () => {
  const cell = new Cell(404, 42, 418);
  expect(cell.center.coordinates).toEqual([404, 42, 418]);
  expect(cell.ring).toHaveLength(0);
  expect(cell.biome).toBe(BIOMES.ocean);
});

test("Cell addPolygonPoint", () => {
  const cell = new Cell(404, 42, 418);
  const point1 = new Point(1, 2, 3);
  const point2 = new Point(4, 5, 6);
  cell.addPolygonPoint(point1);
  cell.addPolygonPoint(point2);
  expect(cell.ring).toEqual([point1, point2]);
});

test("Cell removePolygonPoint", () => {
  const cell = new Cell(404, 42, 418);
  const point1 = new Point(1, 2, 3);
  const point2 = new Point(4, 5, 6);
  cell.addPolygonPoint(point1);
  cell.addPolygonPoint(point2);
  expect(cell.removePolygonPoint()).toBe(point2);
  expect(cell.ring).toEqual([point1]);
});

test("Cell setEarth", () => {
  const cell = new Cell(404, 42, 418);
  cell.setEarth();
  expect(cell.biome).toBe(BIOMES.continent);
});

test("Cell z getter returns the center altitude", () => {
  expect(new Cell(1, 2, 0.9).z).toBe(0.9);
});
