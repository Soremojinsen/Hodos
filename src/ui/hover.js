import { inspectAt } from "../map/inspect.js";
import { screenToWorld } from "../map/view.js";
import { readPreference, writePreference } from "../state/preferences.js";
import { applyTranslations } from "./language.js";

/**
 * How far a finger may move, in pixels, for a touch to count as a tap.
 */
const TAP_DISTANCE = 6;

/**
 * Shows what is under the pointer (or a tap) in a corner panel, when the setting is on.
 */
export function setupHoverInfo(worldMap) {
  const mapElement = document.getElementById("map");
  const toggle = document.getElementById("hover-toggle");
  const panel = document.getElementById("hover-info");
  const biome = document.getElementById("hover-biome");
  const relief = document.getElementById("hover-relief");
  const landLine = document.getElementById("hover-land-line");
  const land = document.getElementById("hover-land");

  toggle.checked = readPreference("hover") === "on";
  toggle.addEventListener("change", () => {
    writePreference("hover", toggle.checked ? "on" : "off");
    if (!toggle.checked) panel.hidden = true;
  });

  // Values are set as translation keys, so a language switch translates them
  const setText = (element, key, params = {}) => {
    element.dataset.i18n = key;
    element.dataset.i18nParams = JSON.stringify(params);
    applyTranslations(element);
  };

  const show = (clientX, clientY) => {
    const rect = worldMap.renderer.canvas.getBoundingClientRect();
    const point = screenToWorld(worldMap.camera.view, clientX - rect.left, clientY - rect.top);
    const info = inspectAt(worldMap.generator, point.x, point.y);
    if (!info) {
      panel.hidden = true;
      return;
    }
    setText(biome, `biome.${info.biome}`);
    setText(relief, `relief.${info.relief}`);
    landLine.hidden = !info.landmass;
    if (info.landmass?.type === "continent") {
      setText(land, "land.continent", { n: info.landmass.number });
    } else if (info.landmass) {
      setText(land, "land.island");
    }
    panel.hidden = false;
  };

  // Not before the map is generated
  const active = () => toggle.checked && worldMap.generator.cells !== undefined;

  let pending = null;
  let frame = null;
  mapElement.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !active()) return;
    pending = event;
    // At most one lookup per frame
    frame ??= requestAnimationFrame(() => {
      frame = null;
      show(pending.clientX, pending.clientY);
    });
  });
  mapElement.addEventListener("pointerleave", () => (panel.hidden = true));

  let tapStart = null;
  mapElement.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") tapStart = { x: event.clientX, y: event.clientY };
  });
  mapElement.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !tapStart) return;
    const moved = Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y);
    tapStart = null;
    if (moved <= TAP_DISTANCE && active()) show(event.clientX, event.clientY);
  });
}
