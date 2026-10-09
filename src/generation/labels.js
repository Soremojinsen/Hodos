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
import { settlementFeatures } from "./settlements.js";
import { cultureAt, nameFeatures, placeCultureCentres } from "./names/names.js";

/**
 * Larger kinds win a place first, see overlay/labels.js placeLabels: capitals right after the
 * ocean, continents and seas, cities below ranges, towns above lakes and rivers, villages last.
 */
export const KIND_RANK = {
  village: 1,
  river: 2,
  lake: 3,
  town: 4,
  island: 5,
  city: 6,
  range: 7,
  capital: 8,
  sea: 9,
  continent: 10,
  ocean: 11,
};

/**
 * How much a settlement's score (see settlements.js scorePoints) counts in its priority.
 */
export const SCORE_PRIORITY = 500;

/**
 * A label's priority: its kind, then its size (flow for rivers, score for settlements, span in
 * tens of units otherwise).
 */
export const priorityOf = (feature) =>
  KIND_RANK[feature.kind] * 1000 +
  Math.min(
    999,
    Math.round(
      feature.kind === "river"
        ? feature.flow
        : feature.score !== undefined
          ? feature.score * SCORE_PRIORITY
          : feature.span / 10,
    ),
  );

/**
 * The atlas of a world that could not be named: the map shows no labels.
 */
export const EMPTY_ATLAS = { labels: [], lookup: null };

/**
 * The named features of a world, then its settlements, and where their labels go, with the lookups the hover panel
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
  // Settlements are named after every other feature, so those keep the names they had
  const used = new Set();
  const names = nameFeatures(base.seed, features, used);
  const settlements = settlementFeatures(base, sampler, world, centres);
  const settlementNames = nameFeatures(base.seed, settlements, used);
  const labels = [
    ...features.map((feature, i) => ({
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
    })),
    ...settlements.map((settlement, i) => ({
      id: settlement.id,
      kind: settlement.kind,
      culture: settlement.culture,
      name: settlementNames[i],
      priority: priorityOf(settlement),
      anchors: [[settlement.x, settlement.y]],
      angle: 0,
      span: 0,
      path: null,
      flow: 0,
    })),
  ];

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
