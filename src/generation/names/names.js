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
