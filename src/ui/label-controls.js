/**
 * Connects the place names checkbox of the settings dialog to the label layer.
 *
 * @param labelLayer    {LabelLayer}
 * @param initialLabels {boolean} whether the link shows place names
 */
export function setupLabelControls(labelLayer, initialLabels) {
  const toggle = document.getElementById("labels-toggle");
  labelLayer.enabled = initialLabels;
  // Browsers restore form fields on reload: the link decides
  toggle.checked = initialLabels;
  toggle.addEventListener("change", () => {
    labelLayer.enabled = toggle.checked;
  });
}
