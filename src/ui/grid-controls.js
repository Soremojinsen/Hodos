/**
 * Connects the grid controls of the settings dialog to the overlay.
 * The size and opacity sliders are disabled while there is no grid.
 *
 * @param overlay     {GridOverlay}
 * @param initialGrid {Object} the grid settings of the link
 */
export function setupGridControls(overlay, initialGrid) {
  const form = document.getElementById("grid-form");
  const radios = [...form.querySelectorAll('input[name="grid-type"]')];
  const size = document.getElementById("grid-size");
  const opacity = document.getElementById("grid-opacity");

  const show = (grid) => {
    for (const radio of radios) radio.checked = radio.value === grid.type;
    size.value = grid.size;
    opacity.value = grid.opacity;
    size.disabled = opacity.disabled = grid.type === "none";
  };

  const update = () => {
    overlay.settings = {
      type: radios.find((radio) => radio.checked).value,
      size: Number(size.value),
      opacity: Number(opacity.value),
    };
    show(overlay.settings);
  };

  for (const input of [...radios, size, opacity]) input.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());

  overlay.settings = initialGrid;
  show(overlay.settings);
}
