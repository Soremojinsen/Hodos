import { expect, test } from "vitest";
import { CULTURES } from "../../src/generation/names/cultures.js";
import {
  ADJECTIVES,
  CULTURE_SPACING,
  DESCRIPTIVE_KINDS,
  MAX_ROOT_LENGTH,
  MIN_ROOT_LENGTH,
  cultureAt,
  isAllowed,
  makeRoot,
  nameFeatures,
  placeCultureCentres,
  startsWithVowel,
} from "../../src/generation/names/names.js";
import { BIOME_DEFINITIONS } from "../../src/generation/biomes.js";
import { generateWorld } from "../../src/generation/world.js";
import { aleaPRNG } from "../../src/vendor/alea-prng.js";

const rootsOf = (culture, count, seed = "test") => {
  const random = aleaPRNG(seed);
  return Array.from({ length: count }, () => makeRoot(culture, random));
};

const lettersOf = (culture) =>
  new Set(
    [
      ...Object.keys(culture.onsets),
      ...Object.keys(culture.nuclei),
      ...Object.keys(culture.codas),
      ...culture.signatures.map((s) => s.text),
    ].join(""),
  );

test("there are six cultures with their own names", () => {
  expect(CULTURES).toHaveLength(6);
  expect(new Set(CULTURES.map((c) => c.name)).size).toBe(6);
});

test("roots are the same for the same random stream", () => {
  for (const culture of CULTURES) expect(rootsOf(culture, 20)).toEqual(rootsOf(culture, 20));
});

test("roots are capitalised, 4 to 10 letters long and allowed", () => {
  for (const culture of CULTURES) {
    for (const root of rootsOf(culture, 500)) {
      expect(root.length).toBeGreaterThanOrEqual(MIN_ROOT_LENGTH);
      expect(root.length).toBeLessThanOrEqual(MAX_ROOT_LENGTH);
      expect(root[0]).toBe(root[0].toUpperCase());
      expect(isAllowed(root)).toBe(true);
      expect(root).not.toMatch(/(.)\1\1/i);
    }
  }
});

test("each culture's roots use its own letters only", () => {
  for (const culture of CULTURES) {
    const letters = lettersOf(culture);
    for (const root of rootsOf(culture, 300)) {
      for (const letter of root.toLowerCase()) expect(letters).toContain(letter);
    }
  }
});

test("about a third of a culture's roots start or end with one of its signatures", () => {
  for (const culture of CULTURES) {
    const roots = rootsOf(culture, 600).map((r) => r.toLowerCase());
    const signed = roots.filter((root) =>
      culture.signatures.some((s) =>
        s.at === "start" ? root.startsWith(s.text) : root.endsWith(s.text),
      ),
    );
    expect(signed.length / roots.length).toBeGreaterThan(0.25);
  }
});

test("two cultures rarely make the same root", () => {
  for (let a = 0; a < CULTURES.length; a++) {
    const own = new Set(rootsOf(CULTURES[a], 300));
    for (let b = a + 1; b < CULTURES.length; b++) {
      const shared = rootsOf(CULTURES[b], 300).filter((root) => own.has(root));
      expect(shared.length).toBeLessThan(10);
    }
  }
});

test("rude and real words are not allowed, accents or not", () => {
  expect(isAllowed("Merdan")).toBe(false);
  expect(isAllowed("Mérdo")).toBe(false);
  expect(isAllowed("Con")).toBe(false);
  expect(isAllowed("Velorn")).toBe(true);
});

test("a root starts with a vowel for the French elision", () => {
  expect(startsWithVowel("Aleni")).toBe(true);
  expect(startsWithVowel("Øsvik")).toBe(true);
  expect(startsWithVowel("Krodh")).toBe(false);
});

test("roots contain none of their culture's forbidden pairs", () => {
  for (const culture of CULTURES) {
    expect(culture.forbidden.length).toBeGreaterThan(0);
    for (const root of rootsOf(culture, 400)) {
      for (const pair of culture.forbidden) expect(root.toLowerCase()).not.toContain(pair);
    }
  }
});

const landSitesOf = (base) => {
  const sites = [];
  base.biomes.forEach((biome, i) => {
    if (!BIOME_DEFINITIONS[biome].maritime) sites.push(base.sites[2 * i], base.sites[2 * i + 1]);
  });
  return sites;
};

test("culture centres sit on land, far apart, each with its own culture", () => {
  const sites = landSitesOf(generateWorld("12345"));
  const centres = placeCultureCentres("12345", sites);
  expect(centres.length).toBeGreaterThanOrEqual(3);
  expect(centres.length).toBeLessThanOrEqual(6);
  expect(new Set(centres.map((c) => c.culture)).size).toBe(centres.length);
  for (const [a, centre] of centres.entries()) {
    const onLand = sites.some((v, i) => i % 2 === 0 && v === centre.x && sites[i + 1] === centre.y);
    expect(onLand).toBe(true);
    for (const other of centres.slice(a + 1)) {
      expect(Math.hypot(other.x - centre.x, other.y - centre.y)).toBeGreaterThanOrEqual(
        CULTURE_SPACING,
      );
    }
  }
  expect(placeCultureCentres("12345", sites)).toEqual(centres);
});

test("a point takes its nearest centre's culture, and culture 0 with no land", () => {
  const centres = [
    { x: 0, y: 0, culture: 4 },
    { x: 1000, y: 0, culture: 2 },
  ];
  expect(cultureAt(centres, 100, 50)).toBe(4);
  expect(cultureAt(centres, 900, -50)).toBe(2);
  expect(placeCultureCentres("12345", [])).toEqual([]);
  expect(cultureAt([], 5, 5)).toBe(0);
});

const KINDS = ["island", "range", "lake", "sea", "river", "continent", "ocean"];
const TERRAINS = ["water", "dry", "wood", "cold", "high", "dark", "plain"];
const fakeFeatures = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `${KINDS[i % 7]}:${i}`,
    kind: KINDS[i % 7],
    terrain: TERRAINS[Math.floor(i / 7) % 7],
    culture: i % 6,
  }));

test("names depend on the seed and the feature, not on the other features' order", () => {
  const features = fakeFeatures(140);
  const names = nameFeatures("12345", features);
  expect(nameFeatures("12345", features)).toEqual(names);
  const reversed = [...features].reverse();
  expect(nameFeatures("12345", reversed)).toEqual([...names].reverse());
  expect(nameFeatures("999", features)).not.toEqual(names);
});

test("no two features share a root, nor a kind and an adjective", () => {
  const features = fakeFeatures(700);
  const keys = nameFeatures("12345", features).map((name, i) =>
    name.root ? name.root.toLowerCase() : `${features[i].kind}:${name.adjective}`,
  );
  expect(new Set(keys).size).toBe(keys.length);
});

test("about one feature in seven of the descriptive kinds gets a descriptive name", () => {
  // pooled over small worlds, as the one-name-per-kind-and-adjective cap limits big ones
  let eligible = 0;
  let descriptive = 0;
  for (let s = 0; s < 20; s++) {
    const features = fakeFeatures(70);
    const names = nameFeatures(`seed${s}`, features);
    names.forEach((name, i) => {
      if (!DESCRIPTIVE_KINDS.has(features[i].kind)) {
        expect(name.root).toBeDefined();
        return;
      }
      eligible++;
      if (name.adjective) {
        descriptive++;
        expect(ADJECTIVES[features[i].terrain]).toContain(name.adjective);
      }
    });
  }
  const share = descriptive / eligible;
  expect(share).toBeGreaterThan(0.08);
  expect(share).toBeLessThan(0.22);
});

test("names drawn with the names already used avoid them, and the first call is unchanged", () => {
  const feature = (id, kind, culture) => ({ id, kind, terrain: "plain", culture });
  const first = [feature("island:1", "island", 0), feature("lake:1", "lake", 1)];
  const second = Array.from({ length: 40 }, (_, i) => feature(`settlement:${i}`, "town", i % 3));
  const used = new Set();
  const a = nameFeatures("names-test", first, used);
  expect(a).toEqual(nameFeatures("names-test", first));
  const b = nameFeatures("names-test", second, used);
  const roots = new Set(a.filter((n) => n.root).map((n) => n.root.toLowerCase()));
  for (const name of b) {
    expect(name.root).toBeTruthy();
    expect(roots.has(name.root.toLowerCase())).toBe(false);
  }
});
