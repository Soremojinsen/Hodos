import { t } from "../i18n/i18n.js";
import { labelText, rootFrame } from "../overlay/label-text.js";
import { withHidden, withName } from "../state/edits.js";

/**
 * The editor of the selected place name, in the names panel: its root between the kind's words,
 * or its full name, whether it is hidden, and a way back to the generated name. Changes apply as
 * they are typed.
 *
 * @param labelEdits {LabelEdits} see state/label-edits-store.js
 * @returns {{show: function(string|null)}}
 */
export function setupNamesEditor(labelEdits) {
  const editor = document.getElementById("names-editor");
  const pick = document.getElementById("names-pick");
  const generatedLine = document.getElementById("names-generated");
  const before = document.getElementById("names-before");
  const after = document.getElementById("names-after");
  const input = document.getElementById("names-input");
  const fullBox = document.getElementById("names-full");
  const hideBox = document.getElementById("names-hide");
  let id = null;
  // Whether the field holds a full name: the user's choice while the name is still empty
  let full = false;

  const label = () => labelEdits.labels.find((l) => l.id === id) ?? null;
  const generatedOf = (shown) => shown.generated ?? shown.name;

  const frame = () => {
    const shown = label();
    if (!shown) return;
    const generated = generatedOf(shown);
    const { before: words, after: rest } = full
      ? { before: "", after: "" }
      : rootFrame(shown.kind, generated.form, input.value || input.placeholder || "");
    before.textContent = words;
    after.textContent = rest;
  };

  const save = () => {
    const value = input.value;
    labelEdits.update((edits) =>
      withName(edits, id, value.trim() ? (full ? { full: value } : { root: value }) : null),
    );
  };

  /**
   * Shows a label in the editor, or the hint to pick one. While its field is being typed in, the
   * field keeps its text and caret.
   */
  const show = (next) => {
    const changed = next !== id;
    id = next;
    const shown = label();
    editor.hidden = !shown;
    pick.hidden = Boolean(shown);
    if (!shown) return;
    const generated = generatedOf(shown);
    const edit = labelEdits.edits.names[id];
    if (edit) full = edit.full !== undefined;
    else if (changed) full = false;
    generatedLine.textContent = t("names.generated", {
      kind: t(`names.kindOne.${shown.kind}`),
      name: labelText({ kind: shown.kind, name: generated }),
    });
    if (changed || document.activeElement !== input) {
      input.value = edit ? (edit.full ?? edit.root) : "";
    }
    input.placeholder = full
      ? labelText({ kind: shown.kind, name: generated })
      : (generated.root ?? "");
    fullBox.checked = full;
    hideBox.checked = labelEdits.edits.hidden.includes(id);
    frame();
  };

  input.addEventListener("input", () => {
    save();
    frame();
  });
  fullBox.addEventListener("change", () => {
    const shown = label();
    full = fullBox.checked;
    // The field keeps the name as it reads: the whole text, or the root it had
    const edit = labelEdits.edits.names[id];
    input.value = full ? labelText(shown) : (edit?.root ?? "");
    save();
    show(id);
  });
  hideBox.addEventListener("change", () => {
    labelEdits.update((edits) => withHidden(edits, id, hideBox.checked));
  });
  document.getElementById("names-reset").addEventListener("click", () => {
    full = false;
    input.value = "";
    labelEdits.update((edits) => withHidden(withName(edits, id, null), id, false));
    show(id);
  });

  return { show };
}
