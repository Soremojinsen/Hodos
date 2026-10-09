import {
  continentFeatures,
  islandFeatures,
  lakeFeatures,
  landSitesOf,
  rangeFeatures,
  riverFeatures,
  seaFeatures,
  worldGeometry,
} from "./features.js";
import { cultureAt, nameFeatures, placeCultureCentres } from "./names/names.js";

/**
 * Larger kinds win a place first, see overlay/labels.js placeLabels.
 */
export const KIND_RANK = { river: 1, lake: 2, island: 3, range: 4, sea: 5, continent: 6, ocean: 7 };

/**
 * A label's priority: its kind, then its size (flow for rivers, span in tens of units otherwise).
 */
export const priorityOf = (feature) =>
  KIND_RANK[feature.kind] * 1000 +
  Math.min(999, Math.round(feature.kind === "river" ? feature.flow : feature.span / 10));

/**
 * The atlas of a world that could not be named: the map shows no labels.
 */
export const EMPTY_ATLAS = { labels: [], lookup: null };

/**
 * The named features of a world and where their labels go, with the lookups the hover panel
 * finds them by: by continent number, coarse cell, water point and river edge.
 *
 * @param base    see hydrology.js withWater
 * @param sampler {WorldSampler} of base
 * @returns {{labels: Object[], lookup: Object}}
 */
export function buildAtlas(base, sampler) {
  const world = worldGeometry(base);
  const centres = placeCultureCentres(base.seed, landSitesOf(base, world));
  const { seas, ocean } = seaFeatures(base, world, centres);
  const features = [
    ...continentFeatures(base, world),
    ...islandFeatures(base, world),
    ...rangeFeatures(base, world),
    ...lakeFeatures(base, world),
    ...riverFeatures(base, sampler),
    ...seas,
    ...(ocean ? [ocean] : []),
  ];
  for (const feature of features) feature.culture ??= cultureAt(centres, ...feature.anchors[0]);
  const names = nameFeatures(base.seed, features);
  const labels = features.map((feature, i) => ({
    id: feature.id,
    kind: feature.kind,
    culture: feature.culture,
    name: feature.form ? { ...names[i], form: feature.form } : names[i],
    priority: priorityOf(feature),
    anchors: feature.anchors,
    angle: feature.angle,
    span: feature.span,
    path: feature.path ?? null,
    flow: feature.flow ?? 0,
  }));

  const filled = (length) => new Int16Array(length).fill(-1);
  const lookup = {
    continent: filled(256),
    cellIsland: filled(world.count),
    cellSea: filled(world.count),
    pointLake: filled(world.side ** 2),
    pointRange: filled(world.side ** 2),
    edgeRiver: filled(base.riverFrom.length),
  };
  const arrays = {
    island: "cellIsland",
    sea: "cellSea",
    ocean: "cellSea",
    lake: "pointLake",
    range: "pointRange",
    river: "edgeRiver",
  };
  features.forEach((feature, index) => {
    if (feature.kind === "continent") {
      lookup.continent[Number(feature.id.split(":")[1])] = index;
    } else {
      for (const i of feature.members) lookup[arrays[feature.kind]][i] = index;
    }
  });
  return { labels, lookup };
}
