const MODALS = { "debug-modal-toggle": "debug-modal", "project-modal-toggle": "project-modal" };

/**
 * Opens and closes the settings and project modals. Opening one closes the other.
 */
export function setupModals() {
  const modals = Object.values(MODALS).map((id) => document.getElementById(id));

  const toggle = (modal) => {
    const opening = modal.style.display === "none";
    for (const other of modals) {
      other.style.display = "none";
      other.style.transform = "translateY(80px)";
    }
    if (opening) {
      modal.style.display = "block";
      requestAnimationFrame(() => (modal.style.transform = "translateY(0px)"));
    }
  };

  for (const [toggleClass, id] of Object.entries(MODALS)) {
    for (const element of document.getElementsByClassName(toggleClass)) {
      element.addEventListener("click", () => toggle(document.getElementById(id)));
    }
  }
}
