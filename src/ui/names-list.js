/**
 * The order of the names list's groups: the largest kinds first.
 */
export const KIND_ORDER = ["ocean", "continent", "sea", "range", "island", "lake", "river"];

/**
 * A text as the names search compares it: lower case, without accents, with straight apostrophes.
 */
export const searchKey = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’ʼ]/g, "'")
    .toLowerCase();

/**
 * The labels the names list shows for a search, by kind in KIND_ORDER, each kind's largest first.
 * A search matches the name shown or, for a renamed place, its generated name. Kinds without a
 * match are left out.
 *
 * @param labels   see label-edits.js applyEdits
 * @param text     {function(Object): string} a label's text, see overlay/label-text.js
 * @param query    {string} the search, empty for all
 * @param selected {string|null} the id of a label listed whatever the search: the one being
 *                 edited, which a new name must not take out of the list
 */
export function groupLabels(labels, text, query, selected = null) {
  const wanted = searchKey(query.trim());
  const matches = (label, shown) =>
    searchKey(shown).includes(wanted) ||
    (label.generated !== undefined &&
      searchKey(text({ kind: label.kind, name: label.generated })).includes(wanted));
  const groups = new Map(KIND_ORDER.map((kind) => [kind, []]));
  for (const label of labels) {
    const shown = text(label);
    if (wanted && label.id !== selected && !matches(label, shown)) continue;
    groups.get(label.kind)?.push({ label, text: shown });
  }
  return [...groups]
    .filter(([, entries]) => entries.length > 0)
    .map(([kind, entries]) => ({
      kind,
      entries: entries.sort((a, b) => b.label.priority - a.label.priority),
    }));
}
