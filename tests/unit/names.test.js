import { expect, test } from "vitest";
import { CULTURES } from "../../src/generation/names/cultures.js";
import {
  MAX_ROOT_LENGTH,
  MIN_ROOT_LENGTH,
  isAllowed,
  makeRoot,
  startsWithVowel,
} from "../../src/generation/names/names.js";
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
