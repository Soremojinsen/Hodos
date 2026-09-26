import { DEFAULT_VIEW } from "../constants.js";
import { applyTranslations } from "./language.js";

/**
 * Connects the recenter and fullscreen buttons.
 * The fullscreen button is hidden where the browser can't go full screen, see index.html.
 */
export function setupViewButtons(worldMap) {
  document.getElementById("map-recenter-button").addEventListener("click", () => {
    worldMap.controller.setView(DEFAULT_VIEW.x, DEFAULT_VIEW.y, DEFAULT_VIEW.z);
  });

  const button = document.getElementById("map-fullscreen-button");
  if (!document.fullscreenEnabled) return;
  button.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document
        .exitFullscreen()
        .catch((error) => console.warn("Could not leave full screen:", error));
    } else {
      document.documentElement
        .requestFullscreen()
        .catch((error) => console.warn("Full screen was refused:", error));
    }
  });
  // Also follows Escape and the browser's own full-screen controls
  document.addEventListener("fullscreenchange", () => {
    button.dataset.i18nAriaLabel = document.fullscreenElement
      ? "map.exitFullscreen"
      : "map.fullscreen";
    applyTranslations(button);
  });
}
