import { expect, test } from "vitest";
import { WorldSampler } from "../../src/generation/fields.js";
import { withWater } from "../../src/generation/hydrology.js";
import { KIND_RANK, buildAtlas } from "../../src/generation/labels.js";
import { generateWorld } from "../../src/generation/world.js";

const atlasOf = (seed) => {
  const base = withWater(generateWorld(seed));
  return { base, atlas: buildAtlas(base, new WorldSampler(base)) };
};

const { base, atlas } = atlasOf("12345");

test("every label has a unique id, a name and a priority by kind then size", () => {
  const { labels } = atlas;
  expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
  for (const label of labels) {
    expect(label.name.root ?? label.name.adjective).toBeTruthy();
    expect(Math.floor(label.priority / 1000)).toBe(KIND_RANK[label.kind]);
    expect(label.anchors.length).toBeGreaterThan(0);
  }
  for (const kind of ["continent", "island", "range", "lake", "river", "sea", "ocean"]) {
    expect(labels.some((l) => l.kind === kind)).toBe(true);
  }
});

test("the lookups point at labels of the right kind", () => {
  const { labels, lookup } = atlas;
  const kinds = (array) => new Set([...array].filter((i) => i >= 0).map((i) => labels[i].kind));
  expect(kinds(lookup.continent)).toEqual(new Set(["continent"]));
  expect(kinds(lookup.cellIsland)).toEqual(new Set(["island"]));
  expect(kinds(lookup.cellSea)).toEqual(new Set(["sea", "ocean"]));
  expect(kinds(lookup.pointLake)).toEqual(new Set(["lake"]));
  expect(kinds(lookup.pointRange)).toEqual(new Set(["range"]));
  expect(kinds(lookup.edgeRiver)).toEqual(new Set(["river"]));
  expect(lookup.edgeRiver).toHaveLength(base.riverFrom.length);
});

test("the atlas is the same each time", () => {
  expect(buildAtlas(base, new WorldSampler(base))).toEqual(atlas);
});

test("the atlas builds for other seeds too, with unique ids", () => {
  for (const seed of ["1", "2", "hodos", "42", "777"]) {
    const { labels } = atlasOf(seed).atlas;
    expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
  }
});

test("seed 12345 keeps its names", () => {
  expect(
    atlas.labels.map((l) => `${l.id} ${l.kind} ${l.culture} ${JSON.stringify(l.name)}`),
  ).toMatchSnapshot();
});
