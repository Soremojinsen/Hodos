import { t } from "../i18n/i18n.js";
import { isEmpty, sameEdits } from "../state/edits.js";
import {
  EditsFileError,
  MAX_FILE_LENGTH,
  editsFileName,
  parseEditsFile,
  serializeEditsFile,
} from "../state/edits-file.js";
import { readStoredEdits, writeStoredEdits } from "../state/label-edits-store.js";
import { navigateToSeed } from "./navigation.js";
import { showNotice } from "./notice.js";
import { downloadBlob } from "./screenshot.js";

/**
 * The names panel's file buttons: save the map's names to a file, and open one, which replaces
 * the names of its map, opening that map if it is another one.
 *
 * @param labelEdits   {LabelEdits} see state/label-edits-store.js
 * @param currentState {function} see url-state.js, to open another map
 * @param urlSync      {{syncNow: function}} see url-sync.js
 */
export function setupNamesFile({ labelEdits, currentState, urlSync }) {
  const input = document.getElementById("names-file-input");

  document.getElementById("names-save").addEventListener("click", () => {
    const text = serializeEditsFile(labelEdits.seed, labelEdits.edits);
    downloadBlob(new Blob([text], { type: "application/json" }), editsFileName(labelEdits.seed));
    labelEdits.markFiled();
  });

  document.getElementById("names-open").addEventListener("click", () => input.click());

  // Replacing other names kept in the browser is asked first: a file is a snapshot, not a merge
  const mayReplace = (kept, edits) =>
    isEmpty(kept) || sameEdits(kept, edits) || window.confirm(t("names.replaceConfirm"));

  const open = async (file) => {
    let parsed;
    try {
      // A character takes at most 4 bytes, so this bounds what is read before the length check
      if (file.size > MAX_FILE_LENGTH * 4) throw new EditsFileError("invalid");
      parsed = parseEditsFile(await file.text());
    } catch (error) {
      if (!(error instanceof EditsFileError))
        console.error("Could not read the names file:", error);
      showNotice(error.reason === "newer" ? "names.fileNewer" : "names.fileInvalid");
      return;
    }
    const { seed, edits } = parsed;
    if (seed === labelEdits.seed) {
      if (!mayReplace(labelEdits.edits, edits)) return;
      labelEdits.replace(edits);
      showNotice("names.opened");
      return;
    }
    if (!mayReplace(readStoredEdits(seed).edits, edits)) return;
    // The other map reads its names from the browser once opened
    if (!writeStoredEdits(seed, { edits, filed: true })) {
      showNotice("names.needsStorage");
      return;
    }
    navigateToSeed(seed, currentState, urlSync);
  };

  input.addEventListener("change", () => {
    const [file] = input.files;
    // The same file can be opened again
    input.value = "";
    if (file) open(file);
  });
}
