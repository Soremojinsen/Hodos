import { expect, test } from "vitest";
import {
  DEFAULT_GRID,
  normalizeGrid,
  parseState,
  serializeState,
} from "../../src/state/url-state.js";

const DEFAULTS = { x: 0, y: 0, z: 1, mode: "default", grid: DEFAULT_GRID };

test("a seed alone gives the default view, as links made before this version", () => {
  expect(parseState("?seed=12345")).toEqual({ seed: "12345", ...DEFAULTS });
});

test("a missing, empty or too long seed is no seed", () => {
  expect(parseState("").seed).toBeNull();
  expect(parseState("?seed=").seed).toBeNull();
  expect(parseState(`?seed=${"a".repeat(201)}`).seed).toBeNull();
  expect(parseState(`?seed=${"a".repeat(200)}`).seed).toBe("a".repeat(200));
});

test("an untouched map serializes to its seed only", () => {
  expect(serializeState({ seed: "12345", ...DEFAULTS })).toBe("?seed=12345");
});

test("the full state round-trips", () => {
  const state = {
    seed: "12345",
    x: -1200,
    y: 350,
    z: 3.25,
    mode: "biomes",
    grid: { type: "hex", size: 500, opacity: 80 },
  };
  const search = serializeState(state);
  expect(search).toBe("?seed=12345&x=-1200&y=350&z=3.25&mode=biomes&grid=hex&gs=500&go=80");
  expect(parseState(search)).toEqual(state);
});

test.each(["Terre du Milieu & co #1", "a+b=c", "Élysée/çà", "🐉", "?seed=x"])(
  "the seed %j round-trips",
  (seed) => {
    expect(parseState(serializeState({ seed, ...DEFAULTS })).seed).toBe(seed);
  },
);

test("positions are rounded to units and zoom to hundredths", () => {
  const search = serializeState({ seed: "s", ...DEFAULTS, x: 195.3125, y: -0.4, z: 1.23456 });
  expect(search).toBe("?seed=s&x=195&z=1.23");
});

test("grid size and opacity are only written for a grid, and only when not default", () => {
  expect(
    serializeState({ seed: "s", ...DEFAULTS, grid: { type: "none", size: 500, opacity: 90 } }),
  ).toBe("?seed=s");
  expect(
    serializeState({ seed: "s", ...DEFAULTS, grid: { type: "square", size: 250, opacity: 40 } }),
  ).toBe("?seed=s&grid=square");
});

test("bad or out-of-range values are ignored or clamped", () => {
  expect(parseState("?seed=s&x=abc&y=99999&z=99&mode=satellite&grid=triangle&gs=7&go=500")).toEqual(
    {
      seed: "s",
      x: 0,
      y: 5000,
      z: 7,
      mode: "default",
      grid: { type: "none", size: 100, opacity: 100 },
    },
  );
  expect(parseState("?seed=s&x=&y=%20&z=-3").z).toBe(0);
  expect(parseState("?seed=s&x=&y=%20").x).toBe(0);
});

test("grid sizes snap to steps of 50 within 100 to 1000", () => {
  expect(normalizeGrid({ type: "hex", size: 274, opacity: 40 }).size).toBe(250);
  expect(normalizeGrid({ type: "hex", size: 276, opacity: 40 }).size).toBe(300);
  expect(normalizeGrid({ type: "hex", size: 5000, opacity: 40 }).size).toBe(1000);
  expect(normalizeGrid({ type: "hex", size: NaN, opacity: NaN })).toEqual({
    type: "hex",
    size: 250,
    opacity: 40,
  });
});
