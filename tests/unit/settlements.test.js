import { expect, test } from "vitest";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { RANGE_ALTITUDE, landSitesOf, worldGeometry } from "../../src/generation/features.js";
import { WorldSampler } from "../../src/generation/fields.js";
import { WATER_LEVEL, withWater } from "../../src/generation/hydrology.js";
import { placeCultureCentres } from "../../src/generation/names/names.js";
import {
  MIN_SCORE,
  SETTLEMENT_KINDS,
  SPACING,
  chooseCapitals,
  pickSites,
  riverWater,
  scorePoints,
  settlementFeatures,
  settles,
  snapSite,
} from "../../src/generation/settlements.js";
import { generateWorld } from "../../src/generation/world.js";

const worldOf = (seed) => {
  const base = withWater(generateWorld(seed));
  const sampler = new WorldSampler(base);
  const world = worldGeometry(base);
  const centres = placeCultureCentres(base.seed, landSitesOf(base, world));
  return { base, sampler, world, centres };
};

const { base, sampler, world, centres } = worldOf("12345");
const settlements = settlementFeatures(base, sampler, world, centres);

const biomeAt = (x, y) => BIOME_DEFINITIONS[sampler.sampleAt(x, y, WATER_LEVEL).biome].name;
const pointOf = (s) => Number(s.id.split(":")[1]);

test("the same seed gives the same settlements", () => {
  expect(settlementFeatures(base, sampler, world, centres)).toEqual(settlements);
});

test("settlements have unique mesh point ids and known kinds", () => {
  expect(settlements.length).toBeGreaterThan(0);
  expect(new Set(settlements.map((s) => s.id)).size).toBe(settlements.length);
  for (const s of settlements) {
    expect(s.id).toMatch(/^settlement:\d+$/);
    expect(SETTLEMENT_KINDS).toContain(s.kind);
  }
});

test("every settlement stands on land at the finest level, clear of the rivers", () => {
  for (const s of settlements) expect(settles(sampler, s.x, s.y)).toBe(true);
});

test("no settlement on mountains, tundra or swamp, nor in a desert away from a river", () => {
  const { flow } = riverWater(base);
  for (const s of settlements) {
    const i = pointOf(s);
    expect(base.waterHeight[i]).toBeLessThan(RANGE_ALTITUDE);
    const [x, y] = [base.waterSites[2 * i], base.waterSites[2 * i + 1]];
    const biome = biomeAt(x, y);
    expect(["Tundra", "Swamp", "Mountain"]).not.toContain(biome);
    if (biome === "Desert") expect(flow[i]).toBeGreaterThan(0);
  }
});

test("settlements keep the spacing of the later of each pair's passes", () => {
  const pass = { capital: "city", city: "city", town: "town", village: "village" };
  const order = ["city", "town", "village"];
  // One expectation for all pairs: a million expect calls would be slow
  const tooClose = [];
  for (let a = 0; a < settlements.length; a++) {
    for (let b = a + 1; b < settlements.length; b++) {
      const [pa, pb] = [pass[settlements[a].kind], pass[settlements[b].kind]];
      const later = order.indexOf(pa) > order.indexOf(pb) ? pa : pb;
      const [sa, sb] = [settlements[a], settlements[b]];
      if (Math.hypot(sa.x - sb.x, sa.y - sb.y) < SPACING[later] - 1e-9)
        tooClose.push([sa.id, sb.id]);
    }
  }
  expect(tooClose).toEqual([]);
});

test("one capital per culture that has a city or a town", () => {
  const capitals = settlements.filter((s) => s.kind === "capital");
  const withTowns = new Set(settlements.filter((s) => s.kind !== "village").map((s) => s.culture));
  expect(new Set(capitals.map((s) => s.culture))).toEqual(withTowns);
  expect(capitals).toHaveLength(withTowns.size);
});

test("a world has a moderate number of settlements", () => {
  // Loose until tuned by eye in Task 8, which tightens it to the measured range
  for (const seed of ["12345", "1", "hodos"]) {
    const w = worldOf(seed);
    const count = settlementFeatures(w.base, w.sampler, w.world, w.centres).length;
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThan(5000);
  }
});

test("scores are zero at sea, on lakes and on mountains, and rivers score above dry land", () => {
  const scores = scorePoints(base, sampler, world);
  const { flow } = riverWater(base);
  let [river, riverCount, dry, dryCount] = [0, 0, 0, 0];
  for (let i = 0; i < scores.length; i++) {
    if (!base.waterLand[i] || base.lakes[i] || base.waterHeight[i] >= RANGE_ALTITUDE) {
      expect(scores[i]).toBe(0);
    } else if (scores[i] > 0 && flow[i] > 0)
      [river, riverCount] = [river + scores[i], riverCount + 1];
    else if (scores[i] > 0) [dry, dryCount] = [dry + scores[i], dryCount + 1];
  }
  expect(river / riverCount).toBeGreaterThan(dry / dryCount);
});

test("a site at sea finds no land, and a site that settles stays where it is", () => {
  const sea = base.waterLand.indexOf(0);
  expect(snapSite(sampler, base.waterSites[2 * sea], base.waterSites[2 * sea + 1])).toBeNull();
  const s = settlements[0];
  expect(snapSite(sampler, s.x, s.y)).toEqual([s.x, s.y]);
});

test("picking keeps the best sites first, at each pass's spacing, and skips sites that do not settle", () => {
  // Four points on a line, 300 units apart, scores falling
  const sites = Float64Array.from([0, 0, 300, 0, 600, 0, 900, 0]);
  const scores = Float32Array.from([1, 0.9, 0.5, 0.25]);
  const snap = (x, y) => (x === 600 ? null : [x, y]);
  const picked = pickSites(scores, sites, "test", snap);
  expect(MIN_SCORE.city).toBeLessThanOrEqual(1);
  expect(picked[0]).toMatchObject({ i: 0, kind: "city" });
  // 600 does not settle, so it is never picked
  expect(picked.some((p) => p.i === 2)).toBe(false);
  for (const p of picked) expect(scores[p.i]).toBeGreaterThanOrEqual(MIN_SCORE[p.kind]);
});

test("the best city of each culture is its capital, or its best town without a city", () => {
  const s = (culture, kind, score) => ({ culture, kind, score });
  const result = chooseCapitals([
    s(0, "city", 0.9),
    s(0, "city", 1.2),
    s(1, "town", 0.5),
    s(1, "town", 0.7),
    s(2, "village", 0.9),
  ]);
  expect(result.map((r) => r.kind)).toEqual(["city", "capital", "town", "capital", "village"]);
});
