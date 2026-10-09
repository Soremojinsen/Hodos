import { aleaPRNG } from "../../vendor/alea-prng.js";
import { CULTURES } from "./cultures.js";

/**
 * How long a root is, in letters.
 */
export const MIN_ROOT_LENGTH = 4;
export const MAX_ROOT_LENGTH = 10;

/**
 * The share of roots that start or end with one of their culture's signatures.
 */
export const SIGNATURE_CHANCE = 1 / 3;

/**
 * Roots may not contain these, nor be one of the short words after them, accents aside.
 */
const BANNED_PARTS = ["fuck", "shit", "cunt", "nazi", "nigg", "rape", "merd", "pute", "salop"];
const BANNED_WORDS = ["con", "cul", "bite", "anus", "sexe", "porn", "slut", "whore"];

const plain = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Whether a root is clear of rude and real words.
 */
export const isAllowed = (root) => {
  const text = plain(root);
  return !BANNED_PARTS.some((part) => text.includes(part)) && !BANNED_WORDS.includes(text);
};

// Whether a root holds one of its culture's forbidden pairs
const hasForbiddenPair = (root, culture) =>
  culture.forbidden.some((pair) => root.toLowerCase().includes(pair));

/**
 * Whether a root starts with a vowel, which French elides before: "Mer d’Aleni".
 */
export const startsWithVowel = (root) => /^[aeiouyàâäéèêëîïôöûüøæœ]/.test(root.toLowerCase());

// One key of a {key: weight} object, at random by weight
const pick = (weights, random) => {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, weight] of entries) total += weight;
  let r = random() * total;
  for (const [key, weight] of entries) {
    r -= weight;
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
};

const PARTS = { C: "onsets", V: "nuclei", F: "codas" };

const syllable = (culture, random) => {
  let text = "";
  for (const part of pick(culture.shapes, random)) text += pick(culture[PARTS[part]], random);
  return text;
};

/**
 * A root from a culture's sounds: its syllables, sometimes with one of its signatures in place
 * of a syllable, with triple letters made double. Roots of the wrong length, not allowed or with a forbidden pair are
 * drawn again, from the same stream.
 *
 * @param culture see cultures.js
 * @param random  {function} from aleaPRNG
 * @returns {string} capitalised
 */
export function makeRoot(culture, random) {
  for (;;) {
    const [min, max] = culture.syllables;
    let count = min + Math.floor(random() * (max - min + 1));
    let signature = null;
    if (random() < SIGNATURE_CHANCE) {
      signature = culture.signatures[Math.floor(random() * culture.signatures.length)];
      count = Math.max(1, count - 1);
    }
    let text = "";
    for (let i = 0; i < count; i++) text += syllable(culture, random);
    if (signature?.at === "start") text = signature.text + text;
    if (signature?.at === "end") text += signature.text;
    text = text.replace(/(.)\1\1+/g, "$1$1");
    if (
      text.length >= MIN_ROOT_LENGTH &&
      text.length <= MAX_ROOT_LENGTH &&
      isAllowed(text) &&
      !hasForbiddenPair(text, culture)
    ) {
      return text[0].toUpperCase() + text.slice(1);
    }
  }
}

/**
 * A world has one culture per LAND_CELLS_PER_CULTURE coarse land cells (about 185 of 1000 are
 * land), from 3 to every culture, their centres at least CULTURE_SPACING world units apart.
 */
export const LAND_CELLS_PER_CULTURE = 40;
export const MIN_CULTURES = 3;
export const CULTURE_SPACING = 1500;

// Fisher-Yates, in place
const shuffle = (array, random) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

/**
 * The centres of the world's cultures: land cells drawn at random, each far enough from those
 * drawn before, each with a culture of its own. A crowded world may get fewer than wanted.
 *
 * @param landSites x0, y0, x1, y1, … of the coarse land cells
 * @returns {{x: Number, y: Number, culture: Number}[]} culture is an index in CULTURES
 */
export function placeCultureCentres(seed, landSites) {
  const random = aleaPRNG(`${seed}:names`);
  const count = landSites.length / 2;
  const wanted = Math.min(
    Math.max(Math.round(count / LAND_CELLS_PER_CULTURE), MIN_CULTURES),
    CULTURES.length,
  );
  const order = shuffle(
    Array.from({ length: count }, (_, i) => i),
    random,
  );
  const cultures = shuffle(
    CULTURES.map((_, i) => i),
    random,
  );
  const centres = [];
  for (const i of order) {
    if (centres.length === wanted) break;
    const [x, y] = [landSites[2 * i], landSites[2 * i + 1]];
    if (centres.every((c) => Math.hypot(c.x - x, c.y - y) >= CULTURE_SPACING)) {
      centres.push({ x, y, culture: cultures[centres.length] });
    }
  }
  return centres;
}

/**
 * The culture of the centre nearest to (x, y), or 0 in a world without centres.
 */
export function cultureAt(centres, x, y) {
  let culture = 0;
  let best = Infinity;
  for (const centre of centres) {
    const distance = (centre.x - x) ** 2 + (centre.y - y) ** 2;
    if (distance < best) [culture, best] = [centre.culture, distance];
  }
  return culture;
}

/**
 * The adjectives of descriptive names, by the terrain of the feature they name. Their texts are
 * the i18n keys adj.<adjective>.<gender>, see overlay/label-text.js.
 */
export const ADJECTIVES = {
  water: ["grey", "blue", "silent", "misty", "stormy", "green"],
  dry: ["red", "golden", "pale"],
  wood: ["green", "black", "misty"],
  cold: ["white", "grey", "cold", "pale"],
  high: ["grey", "white", "black", "red", "misty"],
  dark: ["black", "grey", "silent"],
  plain: ["green", "golden", "silent", "pale"],
};

/**
 * The share of features of DESCRIPTIVE_KINDS named by an adjective rather than a root.
 */
export const DESCRIPTIVE_CHANCE = 1 / 7;
export const DESCRIPTIVE_KINDS = new Set(["island", "range", "lake", "sea", "river"]);

const drawName = (random, { kind, terrain, culture }) => {
  if (DESCRIPTIVE_KINDS.has(kind) && random() < DESCRIPTIVE_CHANCE) {
    const choices = ADJECTIVES[terrain] ?? ADJECTIVES.plain;
    return { adjective: choices[Math.floor(random() * choices.length)] };
  }
  return { root: makeRoot(CULTURES[culture], random) };
};

const nameKey = (kind, name) =>
  name.root ? `root:${name.root.toLowerCase()}` : `${kind}:${name.adjective}`;

/**
 * Names features from their own random stream, seed + ":" + id, so a name depends on its seed
 * and feature alone. A name another feature already has, in this call or in used, is drawn
 * again, the lower id keeping it within a call.
 *
 * @param features {{id: string, kind: string, terrain: string, culture: Number}[]}
 * @param used     {Set<string>} the names taken before, filled with those drawn here
 * @returns {({root: string}|{adjective: string})[]} in the order of features
 */
export function nameFeatures(seed, features, used = new Set()) {
  const order = features
    .map((_, i) => i)
    .sort((a, b) => (features[a].id < features[b].id ? -1 : 1));
  const names = new Array(features.length);
  for (const i of order) {
    const feature = features[i];
    const random = aleaPRNG(`${seed}:${feature.id}`);
    let name = drawName(random, feature);
    while (used.has(nameKey(feature.kind, name))) name = drawName(random, feature);
    used.add(nameKey(feature.kind, name));
    names[i] = name;
  }
  return names;
}
