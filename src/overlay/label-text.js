import { startsWithVowel } from "../generation/names/names.js";
import { t } from "../i18n/i18n.js";

/**
 * The French gender and number each kind's adjective agrees with: m, f or mp (masculine plural).
 */
export const GENDERS = {
  sea: "f",
  lake: "m",
  island: "f",
  range: "mp",
  "river.fleuve": "m",
  "river.riviere": "f",
};

/**
 * A label's text in the current language: its root with the kind's generic word ("Lac Velorn",
 * "Mer d’Aleni"), or its descriptive name ("Monts Blancs").
 *
 * @param label {{kind: string, name: Object}} see generation/labels.js buildAtlas
 */
export function labelText({ kind, name }) {
  const key = name.form ? `${kind}.${name.form}` : kind;
  if (name.adjective) {
    return t(`label.desc.${key}`, { adj: t(`adj.${name.adjective}.${GENDERS[key]}`) });
  }
  return t(`label.${key}`, { root: name.root, de: startsWithVowel(name.root) ? "d’" : "de " });
}
