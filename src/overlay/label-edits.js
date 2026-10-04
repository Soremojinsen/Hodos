/**
 * The labels a map shows once the user's edits (see state/edits.js) are applied to the atlas's:
 * as many, in the same order, so the hover panel's lookups still point to them. A renamed label
 * gets its new name and keeps its generated one, and a hidden one (alone or by its kind) is
 * flagged: placement leaves it out, but the hover panel and the names list still know it.
 *
 * @param labels see generation/labels.js buildAtlas
 * @param edits  normalized edits
 */
export function applyEdits(labels, edits) {
  const hidden = new Set(edits.hidden);
  return labels.map((label) => {
    const name = Object.hasOwn(edits.names, label.id) ? edits.names[label.id] : null;
    const off = hidden.has(label.id) || edits.kinds[label.kind] === false;
    if (!name && !off) return label;
    const changed = { ...label };
    if (name) {
      // A typed root keeps a river's form (fleuve or rivière) and drops a descriptive adjective
      changed.name =
        name.full !== undefined
          ? { full: name.full }
          : { root: name.root, ...(label.name.form && { form: label.name.form }) };
      changed.generated = label.name;
      changed.edited = true;
    }
    if (off) changed.hidden = true;
    return changed;
  });
}
