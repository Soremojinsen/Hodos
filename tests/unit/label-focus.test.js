import { expect, test } from "vitest";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { buildAtlas } from "../../src/generation/labels.js";
import { generateWorld } from "../../src/generation/world.js";
import { cameraView } from "../../src/map/view.js";
import { labelText } from "../../src/overlay/label-text.js";
import { LABEL_STYLES, focusView, placeLabels } from "../../src/overlay/labels.js";

// Letters half as wide as the font size
const measure = (text, font) => text.length * 0.5 * Number(font.match(/(\d+)px/)[1]);

const atlasLabels = (seed) => {
  const base = withWater(generateWorld(seed));
  return buildAtlas(base, new WorldSampler(base)).labels;
};

// A wide screen with the names panel docked on the right, and a phone with it as a bottom sheet
const SCREENS = [
  { width: 1280, height: 720, open: { x: 0, y: 0, width: 830, height: 720 } },
  { width: 400, height: 800, open: { x: 0, y: 0, width: 400, height: 250 } },
];

// Whether the label is placed at the camera, all its letters in the open part of the screen
const inSight = (label, camera, { width, height, open }) => {
  const view = cameraView({ posX: camera.x, posY: camera.y, zoom: camera.zoom }, width, height);
  const placed = placeLabels(view, [label], { text: labelText, measure, selected: label.id });
  return placed.some(({ boxes }) =>
    boxes.every(
      (b) =>
        b.minX >= open.x &&
        b.minY >= open.y &&
        b.maxX <= open.x + open.width &&
        b.maxY <= open.y + open.height,
    ),
  );
};

test.each(["12345", "54321", "abc"])(
  "the names list brings each river of seed %s into sight with its name placed",
  (seed) => {
    const rivers = atlasLabels(seed).filter((l) => l.kind === "river");
    expect(rivers.length).toBeGreaterThan(10);
    for (const screen of SCREENS) {
      const missed = rivers.filter((river) => {
        const camera = focusView(river, { text: labelText, measure, ...screen });
        expect(camera.zoom).toBeGreaterThanOrEqual(LABEL_STYLES.river.zooms[0]);
        expect(camera.zoom).toBeLessThanOrEqual(LABEL_STYLES.river.zooms[1]);
        return !inSight(river, camera, screen);
      });
      expect(missed.map((r) => r.id)).toEqual([]);
    }
  },
);

test("the names list brings the ocean into the open part of the screen", () => {
  const ocean = atlasLabels("12345").find((l) => l.kind === "ocean");
  for (const screen of SCREENS) {
    const camera = focusView(ocean, { text: labelText, measure, ...screen });
    expect(inSight(ocean, camera, screen)).toBe(true);
  }
});
