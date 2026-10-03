import { expect, test } from "vitest";
import { WORLD_SIZE } from "../../src/constants.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { buildAtlas } from "../../src/generation/labels.js";
import { generateWorld } from "../../src/generation/world.js";
import { inspectAt } from "../../src/map/inspect.js";
import { namesAt } from "../../src/map/place-names.js";

const base = withWater(generateWorld("12345"));
const sampler = new WorldSampler(base);
const atlas = buildAtlas(base, sampler);
const at = (x, y, zoom) => namesAt(sampler, atlas, inspectAt(sampler, x, y, zoom), x, y, zoom);
const labelsOf = (kind) => atlas.labels.filter((l) => l.kind === kind);

test("a continent's anchor names it as the land mass", () => {
  let checked = 0;
  for (const label of labelsOf("continent")) {
    const [x, y] = label.anchors[0];
    const info = inspectAt(sampler, x, y, 2);
    if (info.landmass?.type !== "continent") continue;
    expect(at(x, y, 2).landmass).toBe(atlas.labels[atlas.lookup.continent[info.landmass.number]]);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

test("over a named lake, sea or the ocean, the feature is named", () => {
  for (const kind of ["lake", "sea", "ocean"]) {
    let found = 0;
    for (const label of labelsOf(kind)) {
      const [x, y] = label.anchors[0];
      const { feature } = at(x, y, 5);
      if (feature) {
        expect(feature.kind).toBe(kind);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  }
});

test("over a named river, the river is named, and an unnamed stream has no label", () => {
  // A river's path joins water mesh points, which its drawn course passes through
  const river = labelsOf("river")[0];
  let named = 0;
  for (let i = 0; i + 1 < river.path.length; i += 2) {
    const [x, y] = [river.path[i], river.path[i + 1]];
    if (inspectAt(sampler, x, y, 6).biome !== "river") continue;
    expect(at(x, y, 6).feature?.kind).toBe("river");
    named++;
  }
  expect(named).toBeGreaterThan(0);
  const small = [...base.riverFlow.keys()].find((k) => base.riverFlow[k] < 16);
  expect(atlas.lookup.edgeRiver[small]).toBe(-1);
});

test("hovering an unnamed feature names nothing, never another feature", () => {
  // Over rivers and lakes, the feature is of that kind, or nothing: never a sea, range or other river's name
  const unnamed = { river: 0, lake: 0 };
  const named = { river: 0, lake: 0 };
  const step = WORLD_SIZE / 200;
  for (let x = step / 2; x < WORLD_SIZE; x += step) {
    for (let y = step / 2; y < WORLD_SIZE; y += step) {
      const info = inspectAt(sampler, x, y, 6);
      if (info.biome !== "river" && info.biome !== "lake") continue;
      const { feature } = at(x, y, 6);
      if (feature) {
        expect(feature.kind).toBe(info.biome);
        named[info.biome]++;
      } else {
        unnamed[info.biome]++;
      }
    }
  }
  expect(unnamed.river + unnamed.lake).toBeGreaterThan(0);
  expect(named.river + named.lake).toBeGreaterThan(0);
}, 60000);
