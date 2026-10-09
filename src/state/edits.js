import { KIND_RANK } from "../generation/labels.js";

/**
 * A user's changes to the place names of one map: names given to features, by feature id
 * ({root} keeps the kind's word, which follows the language, {full} is shown as written), the ids
 * of labels hidden, and the kinds of labels turned off. See overlay/label-edits.js applyEdits.
 */

export const MAX_NAME_LENGTH = 60;

export const LABEL_KINDS = Object.keys(KIND_RANK);

export const EMPTY_EDITS = Object.freeze({
  names: Object.freeze({}),
  hidden: Object.freeze([]),
  kinds: Object.freeze({}),
});

// The ids generation/features.js gives, and no other: a file cannot slip in keys like __proto__
const FEATURE_ID =
  /^(?:(?:continent|island|range|lake|river|sea):-?\d+(?:,-?\d+)*|settlement:\d+|ocean)$/;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A name's text on one line, without control characters, cut to MAX_NAME_LENGTH characters
const cleanText = (text) =>
  typeof text === "string"
    ? [
        ...text
          .normalize("NFC")
          .replace(/\p{Cc}/gu, " ")
          .replace(/\s+/g, " ")
          .trim(),
      ]
        .slice(0, MAX_NAME_LENGTH)
        .join("")
        .trim()
    : "";

const cleanName = (name) => {
  if (!isObject(name)) return null;
  if ("full" in name) {
    const full = cleanText(name.full);
    return full ? { full } : null;
  }
  const root = cleanText(name.root);
  return root ? { root } : null;
};

/**
 * Makes any value valid edits: unknown ids and kinds, malformed names and empty names are left
 * out, texts are cleaned, and names and hidden ids are sorted, so equal edits serialize alike.
 */
export function normalizeEdits(raw) {
  const source = isObject(raw) ? raw : {};
  const names = {};
  if (isObject(source.names)) {
    for (const id of Object.keys(source.names).sort()) {
      const name = FEATURE_ID.test(id) ? cleanName(source.names[id]) : null;
      if (name) names[id] = name;
    }
  }
  const hidden = Array.isArray(source.hidden)
    ? [
        ...new Set(source.hidden.filter((id) => typeof id === "string" && FEATURE_ID.test(id))),
      ].sort()
    : [];
  const kinds = {};
  if (isObject(source.kinds)) {
    for (const kind of LABEL_KINDS) if (source.kinds[kind] === false) kinds[kind] = false;
  }
  return { names, hidden, kinds };
}

export const isEmpty = (edits) =>
  Object.keys(edits.names).length === 0 &&
  edits.hidden.length === 0 &&
  Object.keys(edits.kinds).length === 0;

export const sameEdits = (a, b) =>
  JSON.stringify(normalizeEdits(a)) === JSON.stringify(normalizeEdits(b));

/**
 * The edits with a feature's name set, or back to the generated one for null or an empty name.
 */
export const withName = (edits, id, name) => {
  const names = { ...edits.names };
  delete names[id];
  if (name) names[id] = name;
  return normalizeEdits({ ...edits, names });
};

export const withHidden = (edits, id, hidden) =>
  normalizeEdits({
    ...edits,
    hidden: hidden ? [...edits.hidden, id] : edits.hidden.filter((other) => other !== id),
  });

export const withKindShown = (edits, kind, shown) =>
  normalizeEdits({ ...edits, kinds: { ...edits.kinds, [kind]: shown ? undefined : false } });
