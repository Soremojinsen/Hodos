import { expect, test } from "vitest";
import { zoomOf } from "../../src/map/view.js";
import { LABEL_STYLES, placeLabels } from "../../src/overlay/labels.js";

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
