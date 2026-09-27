/**
 * Opens and closes every `data-dialog` dialog (settings, project, export).
 * Only one is open at a time; Escape, a "Retour" button or a click outside closes it.
 */
export function setupModals() {
  const dialogs = [...document.querySelectorAll("dialog.modal-box")];

  for (const opener of document.querySelectorAll("[data-dialog]")) {
    opener.addEventListener("click", () => {
      toggleDialog(document.getElementById(opener.dataset.dialog), dialogs);
    });
  }

  for (const dialog of dialogs) {
    // A click on the backdrop targets the dialog itself, but so does a drag from inside the
    // dialog released outside it (selecting text): only a press on the backdrop too closes it
    let pressedOutside = false;
    dialog.addEventListener("pointerdown", (event) => {
      pressedOutside = event.target === dialog;
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && pressedOutside) dialog.close();
    });
    for (const closer of dialog.querySelectorAll(".dialog-close")) {
      closer.addEventListener("click", () => dialog.close());
    }
  }
}

function toggleDialog(dialog, dialogs) {
  if (dialog.open) {
    dialog.close();
    return;
  }
  for (const other of dialogs) {
    if (other.open) other.close();
  }
  dialog.showModal();
}
