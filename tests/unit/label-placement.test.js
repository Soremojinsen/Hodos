import { expect, test } from "vitest";
import { zoomOf } from "../../src/map/view.js";
import {
  LABEL_STYLES,
  RIVER_OFFSET_PX,
  drawLabels,
  fontOf,
  labelScale,
  layoutAndDraw,
  placeLabels,
} from "../../src/overlay/labels.js";

// Letters half as wide as the font size
const measure = (text, font) => text.length * 0.5 * Number(font.match(/(\d+)px/)[1]);
const text = (label) => label.text;

// A 1000 × 700 view of the world's middle at a zoom
const viewAt = (zoom, centerX = 5000, centerY = 5000) => ({
  centerX,
  centerY,
  pixelsPerUnit: (256 * 2 ** zoom) / 10_000,
  width: 1000,
  height: 700,
});

const label = (overrides) => ({
  id: "continent:1",
  kind: "continent",
  text: "Velorn",
  priority: 6500,
  anchors: [[5000, 5000]],
  angle: 0,
  span: 4000,
  path: null,
  flow: 0,
  ...overrides,
});

test("zoomOf reads a view's zoom", () => {
  expect(zoomOf(viewAt(3))).toBeCloseTo(3);
});

test("a label shows only within its kind's zooms", () => {
  // A lake that fits from zoom 2.5 on, but lakes show from zoom 3
  const lake = label({ id: "lake:1", kind: "lake", priority: 2100, span: 2000 });
  expect(LABEL_STYLES.lake.zooms[0]).toBe(3);
  expect(placeLabels(viewAt(2.5), [lake], { text, measure })).toHaveLength(0);
  expect(placeLabels(viewAt(3.2), [lake], { text, measure })).toHaveLength(1);
});

test("a label shows only when it fits its feature, and not once the feature fills the screen", () => {
  expect(placeLabels(viewAt(1), [label({ span: 100 })], { text, measure })).toHaveLength(0);
  // At zoom 3, 4000 units are 820 px: under 1.5 viewports
  expect(placeLabels(viewAt(3), [label()], { text, measure })).toHaveLength(1);
  // At zoom 4, 1640 px: over
  expect(
    placeLabels(viewAt(4), [label({ kind: "sea", priority: 5500 })], { text, measure }),
  ).toHaveLength(0);
});

test("capitals for kinds in capitals, and letters along the label's angle", () => {
  const [placed] = placeLabels(viewAt(1), [label({ angle: 0.3 })], { text, measure });
  expect(placed.text).toBe("VELORN");
  expect(placed.glyphs.map((g) => g.char).join("")).toBe("VELORN");
  for (const g of placed.glyphs) expect(g.angle).toBeCloseTo(-0.3);
  // On screen y grows downwards: a label rising eastwards has letters going up the screen
  const [first, last] = [placed.glyphs[0], placed.glyphs.at(-1)];
  expect(last.x).toBeGreaterThan(first.x);
  expect(last.y).toBeLessThan(first.y);
  expect(Math.atan2(first.y - last.y, last.x - first.x)).toBeCloseTo(0.3);
});

test("a label that would overlap one placed before it is left out", () => {
  const big = label({ id: "continent:1", priority: 6900 });
  const small = label({ id: "continent:2", priority: 6100, text: "Krodh" });
  const placed = placeLabels(viewAt(1), [small, big], { text, measure });
  expect(placed.map((p) => p.label.id)).toEqual(["continent:1"]);
});

test("a label placed in the last frame keeps its place against a slightly larger one", () => {
  const a = label({ id: "continent:1", priority: 6100 });
  const b = label({ id: "continent:2", priority: 6200, text: "Krodh" });
  const previous = new Set(["continent:1#0"]);
  const placed = placeLabels(viewAt(1), [a, b], { text, measure, previous });
  expect(placed.map((p) => p.key)).toEqual(["continent:1#0"]);
});

test("the ocean shows at each of its anchors", () => {
  const ocean = label({
    id: "ocean",
    kind: "ocean",
    priority: 7500,
    anchors: [
      [3000, 5000],
      [7000, 5000],
    ],
    span: 5000,
  });
  const placed = placeLabels(viewAt(1), [ocean], { text, measure });
  expect(placed.map((p) => p.key)).toEqual(["ocean#0", "ocean#1"]);
});

test("a label wholly off the view is left out", () => {
  expect(placeLabels(viewAt(2, 500, 500), [label()], { text, measure })).toHaveLength(0);
});

// A river through the view's middle at zoom 4, from (x0, y) to (x1, y), a point every 40 units
const river = (x0, x1, y = 5000, wiggle = 0) => {
  const count = Math.abs(x1 - x0) / 40 + 1;
  const path = new Float32Array(2 * count);
  for (let i = 0; i < count; i++) {
    path[2 * i] = x0 + Math.sign(x1 - x0) * 40 * i;
    path[2 * i + 1] = y + (i % 2 ? wiggle : 0);
  }
  return label({
    id: "river:1",
    kind: "river",
    text: "Fleuve Zahir",
    priority: 1300,
    path,
    flow: 300,
  });
};

test("a river's name runs along it, just above, reading left to right", () => {
  for (const r of [river(4000, 6000), river(6000, 4000)]) {
    const placed = placeLabels(viewAt(4), [r], { text, measure });
    expect(placed.length).toBeGreaterThan(0);
    const { glyphs } = placed[0];
    expect(glyphs.map((g) => g.char).join("")).toBe("Fleuve Zahir");
    for (let i = 1; i < glyphs.length; i++) expect(glyphs[i].x).toBeGreaterThan(glyphs[i - 1].x);
    for (const g of glyphs) {
      expect(g.angle).toBeCloseTo(0);
      // The river is at y = 350 on screen
      expect(g.y).toBeCloseTo(350 - RIVER_OFFSET_PX);
    }
  }
});

test("a long river is named several times, a short or twisting one not at all", () => {
  // 4000 units at zoom 4 are 1640 px
  const keys = placeLabels(viewAt(4), [river(3000, 7000)], { text, measure }).map((p) => p.key);
  expect(keys.length).toBeGreaterThanOrEqual(2);
  expect(keys.every((key) => key.startsWith("river:1@"))).toBe(true);
  expect(placeLabels(viewAt(4), [river(4980, 5020)], { text, measure })).toHaveLength(0);
  expect(placeLabels(viewAt(4), [river(4000, 6000, 5000, 60)], { text, measure })).toHaveLength(0);
});

test("a river whose course only jitters about a straight line is named", () => {
  // At zoom 4 a point every 16 px, each up to 2.5 px off the line: turns the eye does not see
  const jittered = river(4000, 6000);
  for (let i = 1; i < jittered.path.length / 2 - 1; i++) {
    jittered.path[2 * i + 1] += ((i * 7919) % 13) - 6;
  }
  const placed = placeLabels(viewAt(4), [jittered], { text, measure });
  expect(placed.length).toBeGreaterThan(0);
  for (const g of placed[0].glyphs) expect(Math.abs(g.angle)).toBeLessThan(0.1);
});

test("a river's name sits beside a sharp bend, not across it", () => {
  // 120 px due east to the view's middle, then 120 px due north: a right angle mid-course
  const path = [];
  for (let x = 4700; x <= 5000; x += 40) path.push(x, 5000);
  for (let y = 5040; y <= 5320; y += 40) path.push(5000, y);
  const bent = river(0, 0);
  bent.path = new Float32Array(path);
  const placed = placeLabels(viewAt(4), [bent], { text, measure });
  expect(placed).toHaveLength(1);
  const angles = placed[0].glyphs.map((g) => g.angle);
  for (const angle of angles) expect(angle).toBeCloseTo(angles[0]);
});

// A 2D context that records its calls, with a scale and translation and canvas letterSpacing
// (or none, without it), measuring as measure does
const recorder = ({ letterSpacing = true } = {}) => {
  const calls = [];
  const state = { font: "10px serif", m: [1, 0, 0, 1, 0, 0], saved: [] };
  const methods = {
    save: () => state.saved.push([...state.m]),
    restore: () => (state.m = state.saved.pop()),
    scale: (x, y) => (state.m = [state.m[0] * x, 0, 0, state.m[3] * y, state.m[4], state.m[5]]),
    translate: (x, y) =>
      (state.m = [
        ...state.m.slice(0, 4),
        state.m[4] + x * state.m[0],
        state.m[5] + y * state.m[3],
      ]),
    getTransform: () => {
      const [a, b, c, d, e, f] = state.m;
      return { a, b, c, d, e, f };
    },
    measureText: (text) => ({ width: measure(text, state.font), alphabeticBaseline: -3.5 }),
  };
  const context = new Proxy(
    {},
    {
      has: (_, name) => name !== "letterSpacing" || letterSpacing,
      get: (_, name) =>
        name in state
          ? state[name]
          : (...args) => {
              calls.push([name, ...args]);
              return methods[name]?.(...args);
            },
      set: (_, name, value) => {
        if (name === "font") state.font = value;
        return true;
      },
    },
  );
  return { calls, context };
};

test("exports lay labels out as the screen would, then scale them up", () => {
  expect(labelScale(800, 600)).toBe(1);
  expect(labelScale(4096, 2048)).toBe(4);
  const { calls, context } = recorder();
  const view = viewAt(1);
  const big = { ...view, width: 4000, height: 2800, pixelsPerUnit: view.pixelsPerUnit * 4 };
  const onScreen = placeLabels(view, [label()], { text, measure });
  const exported = layoutAndDraw(context, big, [label()], {
    mode: "default",
    text,
    measure,
    previous: new Set(),
    scale: 4,
  });
  expect(exported.map((p) => p.glyphs)).toEqual(onScreen.map((p) => p.glyphs));
  expect(calls).toContainEqual(["scale", 4, 4]);
  expect(calls.filter(([name]) => name === "fillText").map(([, text]) => text)).toEqual(["VELORN"]);
});

test("a straight label is drawn whole, over its halo, on whole pixels", () => {
  // Centred at (500.3, 350.6) on screen, leaning a little or not at all
  const view = { ...viewAt(1), centerX: 5000 - 0.3 / viewAt(1).pixelsPerUnit };
  view.centerY = 5000 + 0.6 / view.pixelsPerUnit;
  for (const angle of [0, 0.3]) {
    const placed = placeLabels(view, [label({ angle })], { text, measure });
    expect(placed).toHaveLength(1);
    const { calls, context } = recorder();
    drawLabels(context, placed, "biomes");
    const strokes = calls.filter(([name]) => name === "strokeText");
    const fills = calls.filter(([name]) => name === "fillText");
    expect(strokes.map((call) => call.slice(1))).toEqual(fills.map((call) => call.slice(1)));
    expect(fills).toHaveLength(1);
    const [, drawn, x, y] = fills[0];
    expect(drawn).toBe("VELORN");
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    // From its left end, 6 letters 10 px wide and 5 gaps of 6 px: 90 px
    if (angle === 0) expect([x, y]).toEqual([Math.round(500.3 - 45), Math.round(350.6 + 3.5)]);
    else {
      expect(calls).toContainEqual(["translate", 500, 351]);
      expect(calls).toContainEqual(["rotate", -0.3]);
      expect([x, y]).toEqual([-45, 4]);
    }
  }
});

test("a river's name is drawn letter by letter, as is every label without letterSpacing", () => {
  const placed = placeLabels(viewAt(4), [river(4000, 6000)], { text, measure });
  const { calls, context } = recorder();
  drawLabels(context, placed, "default");
  expect(calls.filter(([name]) => name === "fillText").map(([, char]) => char)).toEqual(
    placed.flatMap((p) => p.glyphs.map((g) => g.char)),
  );
  const old = recorder({ letterSpacing: false });
  drawLabels(old.context, placeLabels(viewAt(1), [label()], { text, measure }), "default");
  expect(old.calls.filter(([name]) => name === "fillText")).toHaveLength("VELORN".length);
});

test("rivers, lakes and islands are named in Alegreya, larger names in IM Fell", () => {
  for (const kind of ["river", "lake", "island"]) {
    expect(fontOf(LABEL_STYLES[kind])).toMatch(/px "Alegreya", serif$/);
  }
  for (const kind of ["continent", "ocean", "sea", "range"]) {
    expect(fontOf(LABEL_STYLES[kind])).toMatch(/px "IM Fell Double Pica", serif$/);
  }
  expect(fontOf(LABEL_STYLES.river)).toBe(`italic ${LABEL_STYLES.river.size}px "Alegreya", serif`);
});
