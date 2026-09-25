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

  let pending = null;
  let frame = null;
  // Drops a lookup queued for the next frame, so it cannot show the panel again after
  // the pointer has left the map or the setting has been turned off.
  const cancelPending = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pending = null;
  };

  toggle.checked = readPreference("hover") === "on";
  toggle.addEventListener("change", () => {
    writePreference("hover", toggle.checked ? "on" : "off");
    if (!toggle.checked) {
      cancelPending();
      panel.hidden = true;
    }
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
    const info = worldMap.inspect(point.x, point.y);
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
  const active = () => toggle.checked && worldMap.sampler !== undefined;

  mapElement.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !active()) return;
    pending = event;
    // At most one lookup per frame
    frame ??= requestAnimationFrame(() => {
      frame = null;
      // The pointer may have left the map or the setting been turned off since this was queued
      if (active()) show(pending.clientX, pending.clientY);
      pending = null;
    });
  });
  mapElement.addEventListener("pointerleave", (event) => {
    // A touch tap fires pointerup then pointerout/pointerleave right after: that must not
    // hide the panel the tap just showed. Mouse pointers still hide on leave as before.
    if (event.pointerType === "touch") return;
    cancelPending();
    panel.hidden = true;
  });

  // Keyed by pointerId so a second finger touching down (e.g. starting a pinch) cannot be
  // mistaken for the continuation of the first finger's tap.
  const tapStarts = new Map();
  mapElement.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      tapStarts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  });
  mapElement.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    const tapStart = tapStarts.get(event.pointerId);
    tapStarts.delete(event.pointerId);
    if (!tapStart) return;
    const moved = Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y);
    if (moved <= TAP_DISTANCE && active()) show(event.clientX, event.clientY);
  });
}
