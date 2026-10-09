import { expect, test } from "vitest";
import { SETTLEMENT_KINDS } from "../../src/generation/settlements.js";
import {
  SYMBOLS,
  SYMBOL_BOXES,
  SYMBOL_HALO,
  drawSymbol,
  isSettlement,
} from "../../src/overlay/settlement-symbols.js";

test("there is a symbol for each settlement kind and no other", () => {
  expect(Object.keys(SYMBOLS).sort()).toEqual([...SETTLEMENT_KINDS].sort());
  expect(isSettlement("town")).toBe(true);
  expect(isSettlement("lake")).toBe(false);
  expect(isSettlement("toString")).toBe(false);
});

test("each box holds its symbol and its halo", () => {
  for (const kind of SETTLEMENT_KINDS) {
    const box = SYMBOL_BOXES[kind];
    for (const { points } of SYMBOLS[kind]) {
      for (const [x, y] of points) {
        expect(x - SYMBOL_HALO / 2).toBeGreaterThanOrEqual(box.minX - 1e-9);
        expect(x + SYMBOL_HALO / 2).toBeLessThanOrEqual(box.maxX + 1e-9);
        expect(y - SYMBOL_HALO / 2).toBeGreaterThanOrEqual(box.minY - 1e-9);
        expect(y + SYMBOL_HALO / 2).toBeLessThanOrEqual(box.maxY + 1e-9);
      }
    }
  }
});

test("larger settlements have wider symbols", () => {
  const width = (kind) => SYMBOL_BOXES[kind].maxX - SYMBOL_BOXES[kind].minX;
  expect(width("capital")).toBeGreaterThan(width("city"));
  expect(width("city")).toBeGreaterThan(width("town"));
  expect(width("town")).toBeGreaterThan(width("village"));
});

// A context that records its calls and the colours each fill and stroke used
const recorder = () => {
  const calls = [];
  const state = { fillStyle: null, strokeStyle: null };
  const context = new Proxy(
    {},
    {
      get: (_, name) =>
        name in state
          ? state[name]
          : (...args) => {
              const colour =
                name === "fill"
                  ? state.fillStyle
                  : name === "stroke"
                    ? state.strokeStyle
                    : undefined;
              calls.push(colour === undefined ? [name, ...args] : [name, colour]);
            },
      set: (_, name, value) => {
        if (name in state) state[name] = value;
        return true;
      },
    },
  );
  return { calls, context };
};

test("a symbol is drawn on a whole pixel, over its halo, in paper and ink", () => {
  const { calls, context } = recorder();
  const colors = { ink: "INK", paper: "PAPER", halo: "HALO", haloWidth: SYMBOL_HALO };
  drawSymbol(context, "town", 100.4, 50.6, colors);
  expect(calls).toContainEqual(["translate", 100, 51]);
  const fills = calls.filter(([name]) => name === "fill").map(([, colour]) => colour);
  const shapes = SYMBOLS.town.filter((shape) => !shape.open).length;
  // Every closed shape once in the halo, then each again in its own colour
  expect(fills.slice(0, shapes)).toEqual(Array(shapes).fill("HALO"));
  expect(fills.slice(shapes)).toEqual(
    SYMBOLS.town.filter((s) => s.fill).map((s) => s.fill.toUpperCase()),
  );
  expect(calls[0]).toEqual(["save"]);
  expect(calls.at(-1)).toEqual(["restore"]);
});
