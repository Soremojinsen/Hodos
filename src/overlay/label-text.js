import { startsWithVowel } from "../generation/names/names.js";
import { t } from "../i18n/i18n.js";

/**
 * The French gender and number each kind’s adjective agrees with: m, f or mp (masculine plural).
 */
export const GENDERS = {
  sea: "f",
  lake: "m",
  island: "f",
  range: "mp",
  "river.fleuve": "m",
  "river.riviere": "f",
};

// The translation key of a kind, with a river’s form
const keyOf = (kind, form) => (form ? `${kind}.${form}` : kind);

// The French "de" before a root: elided before a vowel
const deOf = (root) => (startsWithVowel(root) ? "d’" : "de ");

/**
 * A label’s text in the current language: a full name as written, its root with the kind’s
 * generic word ("Lac Velorn", "Mer d’Aleni"), or its descriptive name ("Monts Blancs").
 *
 * @param label {{kind: string, name: Object}} see generation/labels.js buildAtlas and
 *              label-edits.js applyEdits
 */
export function labelText({ kind, name }) {
  if (name.full !== undefined) return name.full;
  const key = keyOf(kind, name.form);
  if (name.adjective) {
    return t(`label.desc.${key}`, { adj: t(`adj.${name.adjective}.${GENDERS[key]}`) });
  }
  return t(`label.${key}`, { root: name.root, de: deOf(name.root) });
}

/**
 * The kind’s words before and after a root in the current language, as the names editor shows
 * them around its field: "Mer d’" and "" for a French sea named "Ombre".
 */
export function rootFrame(kind, form, root) {
  const marker = "\u0001";
  const [before, after = ""] = t(`label.${keyOf(kind, form)}`, {
    root: marker,
    de: deOf(root),
  }).split(marker);
  return { before, after };
}
