import { expect, test } from "vitest";
import {
  getRandomInRange,
  getRandomPointsIn2dRange,
  hashSeed,
  randomElement,
  taxiDistance,
} from "../../src/generation/util.js";

test("getRandomInRange stays in [min, max)", () => {
  for (let i = 0; i < 1000; i++) {
    const value = getRandomInRange(0, 1, Math.random);
    expect(value >= 0 && value < 1).toBe(true);
  }
});

test("getRandomPointsIn2dRange stays in bounds", () => {
  const points = getRandomPointsIn2dRange(1000, 0, 1000, Math.random);
  expect(points).toHaveLength(1000);
  for (const [x, y] of points) {
    expect(x >= 0 && x < 1000).toBe(true);
    expect(y >= 0 && y < 1000).toBe(true);
  }
});

test("randomElement can pick every element", () => {
  const array = ["a", "b", "c"];
  expect(randomElement(array, () => 0)).toBe("a");
  expect(randomElement(array, () => 0.5)).toBe("b");
  expect(randomElement(array, () => 0.99)).toBe("c");
});

test("taxiDistance", () => {
  expect(taxiDistance(0, 0, 5, 6)).toBe(6);
  expect(taxiDistance(-2, 6, 5, 6)).toBe(7);
});

test("hashSeed maps any string to a noise seed in [0, 65536)", () => {
  for (const seed of ["", "0", "12345", "dragon", "Hodos, voyagez avec audace !"]) {
    const hash = hashSeed(seed);
    expect(Number.isInteger(hash) && hash >= 0 && hash < 65536).toBe(true);
  }
  expect(hashSeed("dragon")).toBe(hashSeed("dragon"));
});
