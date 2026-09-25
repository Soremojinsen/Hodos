import { canvasToBlob, exportOptions, exportView, renderImage } from "../export/export.js";
import { printImage, printSize } from "../export/print.js";
import { t } from "../i18n/i18n.js";
import { applyTranslations } from "./language.js";
import { downloadBlob, screenshotFileName } from "./screenshot.js";

/**
 * Connects the Exporter dialog: area, size, grid, download and printing.
 * The sizes are rebuilt each time the dialog opens, since they depend on the window size.
 *
 * @param worldMap  {WorldMap}
 * @param overlay   {GridOverlay}
 */
export function setupExportDialog(worldMap, overlay) {
  const dialog = document.getElementById("export-dialog");
  const form = document.getElementById("export-form");
  const sizeSelect = document.getElementById("export-size");
  const gridCheckbox = document.getElementById("export-grid");
  const status = document.getElementById("export-status");
  const downloadButton = document.getElementById("export-download");
  const printButton = document.getElementById("print-button");

  const area = () => form.querySelector('input[name="export-area"]:checked').value;

  const setStatus = (key) => {
    if (key) {
      status.dataset.i18n = key;
      applyTranslations(status);
    } else {
      delete status.dataset.i18n;
      status.textContent = "";
    }
  };

  // The spec disables the dialog's buttons while an export runs: all of them, not just submit.
  const setBusy = (busy) => {
    for (const button of dialog.querySelectorAll("button")) button.disabled = busy;
    // Restores the size-driven disabled state the blanket re-enable above just overwrote.
    if (!busy) updateSubmitButtons();
  };

  // Nothing to export at this size (e.g. "Vue actuelle" on a window wider than the browser
  // can render): the submit buttons must not offer an export that cannot happen.
  const updateSubmitButtons = () => {
    const hasEnabledSize = [...sizeSelect.options].some((option) => !option.disabled);
    downloadButton.disabled = !hasEnabledSize;
    printButton.disabled = !hasEnabledSize;
  };

  const refreshSizes = () => {
    const kind = area() === "world" ? "World" : "View";
    const previous = sizeSelect.value;
    sizeSelect.replaceChildren(
      ...exportOptions(area(), worldMap.camera.view).map((option) => {
        const element = document.createElement("option");
        element.value = option.size;
        element.disabled = !option.allowed;
        element.dataset.i18n = `export.size${kind}${option.allowed ? "" : "TooLarge"}`;
        element.dataset.i18nParams = JSON.stringify({
          width: option.width,
          height: option.height,
          factor: option.size,
        });
        applyTranslations(element);
        return element;
      }),
    );
    const options = [...sizeSelect.options].filter((option) => !option.disabled);
    const preferred =
      options.find((option) => option.value === previous) ??
      options.find((option) => option.value === (area() === "world" ? "2048" : "1")) ??
      options[0];
    if (preferred) sizeSelect.value = preferred.value;
    updateSubmitButtons();
  };

  const onOpen = () => {
    refreshSizes();
    gridCheckbox.disabled = overlay.settings.type === "none";
    gridCheckbox.checked = !gridCheckbox.disabled;
    setStatus(null);
  };

  // The window can be resized while the dialog is open: "Vue actuelle" sizes and limits must
  // keep matching the view that would actually be exported.
  window.addEventListener("resize", () => {
    if (dialog.open) refreshSizes();
  });

  /**
   * Runs an export task with the busy state and the failure message.
   */
  async function run(task) {
    if (document.documentElement.dataset.map !== "ready") return;
    setBusy(true);
    setStatus("export.preparing");
    // Let the browser show the busy state before the long rendering
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    try {
      await task();
      setStatus(null);
    } catch (error) {
      console.error("The export failed:", error);
      setStatus("export.failed");
    } finally {
      setBusy(false);
    }
  }

  const renderSelection = (selectedArea, size) =>
    renderImage(
      worldMap.renderer,
      exportView(selectedArea, size, worldMap.camera.view),
      gridCheckbox.checked && !gridCheckbox.disabled ? overlay.settings : null,
    );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const canvas = renderSelection(area(), Number(sizeSelect.value));
      const fileName = screenshotFileName(worldMap.generator.seed, canvas.width, canvas.height);
      downloadBlob(await canvasToBlob(canvas), fileName);
    });
  });
  for (const radio of form.querySelectorAll('input[name="export-area"]')) {
    radio.addEventListener("change", refreshSizes);
  }
  document.getElementById("screenshot").addEventListener("click", onOpen);

  document.getElementById("print-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const selectedArea = area();
      const canvas = renderSelection(selectedArea, printSize(selectedArea, worldMap.camera.view));
      const pages = Number(document.getElementById("print-pages").value);
      await printImage(canvas, pages, (page) =>
        t("print.caption", { seed: worldMap.generator.seed, ...page }),
      );
    });
  });
}
