import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { zoomOf } from "../../src/map/view.js";
import {
  LABEL_STYLES,
  HALO_WIDTHS,
  HIDDEN_ALPHA,
  SELECTED_HALO,
  RIVER_OFFSET_PX,
  drawLabels,
  focusView,
  fontOf,
  labelAt,
  labelScale,
  layoutAndDraw,
  placeLabels,
  SYMBOL_GAP,
} from "../../src/overlay/labels.js";
import { SYMBOL_BOXES } from "../../src/overlay/settlement-symbols.js";

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
const recorder = ({ letterSpacing = true, measureWith = measure } = {}) => {
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
    measureText: (text) => ({ width: measureWith(text, state.font), alphabeticBaseline: -3.5 }),
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
        if (name === "lineWidth") calls.push(["lineWidth", value]);
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

test("rivers, lakes, islands and seas are named in Alegreya, larger names in IM Fell", () => {
  for (const kind of ["river", "lake", "island", "sea"]) {
    expect(fontOf(LABEL_STYLES[kind])).toMatch(/px "Alegreya", serif$/);
  }
  for (const kind of ["continent", "ocean", "range"]) {
    expect(fontOf(LABEL_STYLES[kind])).toMatch(/px "IM Fell Double Pica", serif$/);
  }
  expect(fontOf(LABEL_STYLES.river)).toBe(`italic ${LABEL_STYLES.river.size}px "Alegreya", serif`);
});

test("a straight label starts where its first letter was laid out, kerning or not", () => {
  // Kerned, a string is 4 px narrower than its letters' widths summed
  const kerned = (string, font) => measure(string, font) - (string.length > 1 ? 4 : 0);
  const view = { ...viewAt(1), centerX: 5000 - 0.3 / viewAt(1).pixelsPerUnit };
  const placed = placeLabels(view, [label()], { text, measure: kerned });
  const { calls, context } = recorder({ measureWith: kerned });
  drawLabels(context, placed, "default");
  // 6 letters 10 px wide and 5 gaps of 6 px, centred at 500.3: from 455.3
  expect(placed[0].center.width).toBe(90);
  expect(placed[0].glyphs[0].x - 5).toBeCloseTo(455.3);
  const [, , x] = calls.find(([name]) => name === "fillText");
  expect(x).toBe(455);
});

test("a name's letters are composed with their accents", () => {
  const [placed] = placeLabels(viewAt(1), [label({ text: "Ve\u0301lorn" })], { text, measure });
  expect(placed.text).toBe("V\u00c9LORN");
  expect(placed.glyphs).toHaveLength(6);
});

test("water labels have a thinner halo than land labels", () => {
  expect(HALO_WIDTHS.water).toBeLessThan(HALO_WIDTHS.land);
  const sea = label({ id: "sea:1", kind: "sea", text: "Mer", priority: 5500, span: 1000 });
  const land = label({ anchors: [[5000, 4000]] });
  const placed = placeLabels(viewAt(2.5), [sea, land], { text, measure });
  expect(placed.map((p) => p.label.kind).sort()).toEqual(["continent", "sea"]);
  const { calls, context } = recorder();
  drawLabels(context, placed, "default");
  const widths = calls.filter(([name]) => name === "lineWidth").map(([, width]) => width);
  expect(widths).toEqual(placed.map((p) => HALO_WIDTHS[p.style.ink]));
});

test("hidden labels are left out, unless selected, and the selected label is placed first", () => {
  const big = label({ id: "continent:1", priority: 6900 });
  const small = label({ id: "continent:2", priority: 6100 });
  // Both at the same place: only one can show
  expect(placeLabels(viewAt(3), [big, small], { text, measure }).map((p) => p.key)).toEqual([
    "continent:1#0",
  ]);
  const placed = placeLabels(viewAt(3), [big, small], { text, measure, selected: "continent:2" });
  expect(placed.map((p) => p.key)).toEqual(["continent:2#0"]);
  expect(placed[0].selected).toBe(true);
  const hidden = { ...big, hidden: true };
  expect(placeLabels(viewAt(3), [hidden], { text, measure })).toEqual([]);
  expect(
    placeLabels(viewAt(3), [hidden], { text, measure, selected: "continent:1" }).map((p) => p.key),
  ).toEqual(["continent:1#0"]);
});

test("labelAt finds the label under a point by its letters' boxes", () => {
  const placed = placeLabels(viewAt(3), [label()], { text, measure });
  const { x, y } = placed[0].glyphs[0];
  expect(labelAt(placed, x, y).id).toBe("continent:1");
  expect(labelAt(placed, x, y + 200)).toBeNull();
  expect(labelAt([], x, y)).toBeNull();
});

test("focusView picks the first zoom where the label shows", () => {
  for (const kind of ["continent", "lake", "sea"]) {
    const small = label({ id: `${kind}:9`, kind, span: 300, anchors: [[6000, 4000]] });
    const { x, y, zoom } = focusView(small, { text, measure, width: 1000, height: 700 });
    expect([x, y]).toEqual([6000 - WORLD_SIZE / 2, 4000 - WORLD_SIZE / 2]);
    expect(zoom).toBeGreaterThanOrEqual(LABEL_STYLES[kind].zooms[0]);
    expect(zoom).toBeLessThanOrEqual(LABEL_STYLES[kind].zooms[1]);
    expect(placeLabels(viewAt(zoom, 6000, 4000), [small], { text, measure })).toHaveLength(1);
  }
});

test("a selected label is drawn over the accent halo, and faded when hidden", () => {
  const calls = [];
  const context = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    strokeText() {
      calls.push({ halo: this.strokeStyle, alpha: this.globalAlpha });
    },
    fillText() {},
  };
  const placed = placeLabels(viewAt(3), [{ ...label(), hidden: true }], {
    text,
    measure,
    selected: "continent:1",
  });
  drawLabels(context, placed, "default");
  expect(calls[0]).toEqual({ halo: SELECTED_HALO, alpha: HIDDEN_ALPHA });
});

test("focusView centres a river on the middle of its course, not its start", () => {
  // An L of 3000 then 1000 units: half of 4000 is 2000, on the first leg
  const river = label({
    id: "river:9",
    kind: "river",
    path: [1000, 1000, 4000, 1000, 4000, 2000],
    anchors: [[1000, 1000]],
  });
  const { x, y, zoom } = focusView(river, { text, measure, width: 1000, height: 700 });
  expect([x, y]).toEqual([3000 - WORLD_SIZE / 2, 1000 - WORLD_SIZE / 2]);
  expect(zoom).toBeGreaterThanOrEqual(LABEL_STYLES.river.zooms[0]);
  expect(zoom).toBeLessThanOrEqual(LABEL_STYLES.river.zooms[1]);
});

test("focusView puts the label in the middle of the part of the screen the panel leaves open", () => {
  const small = label({ id: "lake:9", kind: "lake", span: 300, anchors: [[6000, 4000]] });
  const open = { x: 0, y: 0, width: 500, height: 700 };
  const { x, y, zoom } = focusView(small, { text, measure, width: 1000, height: 700, open });
  const view = viewAt(zoom, x + WORLD_SIZE / 2, y + WORLD_SIZE / 2);
  const [placed] = placeLabels(view, [small], { text, measure, selected: "lake:9" });
  expect(placed.center.x).toBeCloseTo(250);
  expect(placed.center.y).toBeCloseTo(350);
});

const town = (overrides) =>
  label({
    id: "settlement:1",
    kind: "town",
    text: "Duvara",
    priority: 4500,
    span: 0,
    ...overrides,
  });

test("a settlement shows from its kind's zoom, its symbol on its point and its name to the right", () => {
  expect(LABEL_STYLES.town.zooms[0]).toBe(4);
  expect(placeLabels(viewAt(3.5), [town()], { text, measure })).toHaveLength(0);
  const placed = placeLabels(viewAt(4.5), [town()], { text, measure });
  expect(placed).toHaveLength(1);
  const [{ symbol, boxes, glyphs }] = placed;
  expect(symbol.x).toBeCloseTo(500);
  expect(symbol.y).toBeCloseTo(350);
  expect(boxes[0].maxX).toBeCloseTo(500 + SYMBOL_BOXES.town.maxX);
  expect(glyphs.map((g) => g.char).join("")).toBe("Duvara");
  for (const glyph of glyphs)
    expect(glyph.x).toBeGreaterThan(500 + SYMBOL_BOXES.town.maxX + SYMBOL_GAP);
});

test("a settlement whose symbol is just off screen leaves its name out too", () => {
  const view = viewAt(4.5);
  const x = 5000 + (-SYMBOL_BOXES.town.maxX - 1 - 500) / view.pixelsPerUnit;
  const off = town({ anchors: [[x, 5000]] });
  expect(placeLabels(view, [off], { text, measure })).toHaveLength(0);
  const on = town({ anchors: [[x + 2 / view.pixelsPerUnit, 5000]] });
  expect(placeLabels(view, [on], { text, measure })).toHaveLength(1);
});

// A lake label placed before the town, its middle at (dx, 0) pixels from the screen's middle
const lakeAt = (zoom, dx) =>
  label({
    id: "lake:9",
    kind: "lake",
    text: "Velorn",
    priority: 9000,
    span: 2000,
    anchors: [[5000 + dx / viewAt(zoom).pixelsPerUnit, 5000]],
  });

test("a settlement's name moves to the left when the right is taken", () => {
  const placed = placeLabels(viewAt(4.5), [town(), lakeAt(4.5, 70)], { text, measure });
  const settlement = placed.find((p) => p.label.kind === "town");
  expect(settlement).toBeDefined();
  for (const glyph of settlement.glyphs) expect(glyph.x).toBeLessThan(500);
});

test("a settlement is left out whole when its symbol is covered", () => {
  const placed = placeLabels(viewAt(4.5), [town(), lakeAt(4.5, 0)], { text, measure });
  expect(placed.map((p) => p.label.kind)).toEqual(["lake"]);
});

test("with names off, only settlements are placed, as symbols", () => {
  const placed = placeLabels(viewAt(4.5), [town(), lakeAt(4.5, 200)], {
    text,
    measure,
    names: false,
  });
  expect(placed).toHaveLength(1);
  expect(placed[0]).toMatchObject({ text: "", glyphs: [], symbol: { x: 500, y: 350 } });
  expect(placed[0].boxes).toHaveLength(1);
});

test("a hidden settlement is placed only when selected", () => {
  const hidden = town({ hidden: true });
  expect(placeLabels(viewAt(4.5), [hidden], { text, measure })).toHaveLength(0);
  const placed = placeLabels(viewAt(4.5), [hidden], { text, measure, selected: "settlement:1" });
  expect(placed).toHaveLength(1);
  expect(placed[0].selected).toBe(true);
});

test("a settlement's symbol is drawn under its name, faded when hidden and selected", () => {
  const placed = placeLabels(viewAt(4.5), [town({ hidden: true })], {
    text,
    measure,
    selected: "settlement:1",
  });
  const { calls, context } = recorder();
  drawLabels(context, placed, "default");
  const translate = calls.findIndex(
    ([name, x, y]) => name === "translate" && x === 500 && y === 350,
  );
  const fillText = calls.findIndex(([name]) => name === "fillText");
  expect(translate).toBeGreaterThanOrEqual(0);
  expect(fillText).toBeGreaterThan(translate);
});

test("a symbol alone is drawn without text", () => {
  const placed = placeLabels(viewAt(4.5), [town()], { text, measure, names: false });
  const { calls, context } = recorder();
  drawLabels(context, placed, "default");
  expect(calls.some(([name]) => name === "fill")).toBe(true);
  expect(calls.some(([name]) => name === "fillText" || name === "strokeText")).toBe(false);
});

test("the names list flies to a settlement at the town zoom or the first zoom of its kind", () => {
  for (const kind of ["capital", "city", "town"]) {
    const view = focusView(town({ kind }), { text, measure, width: 1000, height: 700 });
    expect(view.zoom).toBe(LABEL_STYLES.town.zooms[0]);
  }
  const village = focusView(town({ kind: "village" }), { text, measure, width: 1000, height: 700 });
  expect(village.zoom).toBe(LABEL_STYLES.village.zooms[0]);
  const view = focusView(town(), { text, measure, width: 1000, height: 700 });
  expect(view.x).toBeCloseTo(0);
  expect(view.y).toBeCloseTo(0);
});
