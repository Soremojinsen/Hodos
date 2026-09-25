import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { downloadBlob, screenshotFileName } from "./screenshot.js";

/**
 * Connects the zoom buttons, pointer gestures, mouse wheel, rendering mode form
 * and screenshot button to the map.
 *
 * @param worldMap {WorldMap}
 */
export function setupControls(worldMap) {
  const mapElement = document.getElementById("map");

  document.getElementById("map-zoom-in-button").addEventListener("click", () => {
    worldMap.controller.zoom(1);
  });
  document.getElementById("map-zoom-out-button").addEventListener("click", () => {
    worldMap.controller.zoom(-1);
  });

  // Move by dragging with one pointer (mouse, finger or pen), zoom by pinching with two fingers
  const activePointers = new Map(); // pointerId -> last {x, y}
  let lastPinchDistance = null;

  const pinchDistance = () => {
    const [a, b] = activePointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  mapElement.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinchDistance = activePointers.size === 2 ? pinchDistance() : null;
  });

  document.addEventListener("pointermove", (e) => {
    const last = activePointers.get(e.pointerId);
    if (!last) return;
    if (activePointers.size === 1) {
      const sizeFactor = WORLD_SIZE / (TILE_PIXEL_SIZE * Math.pow(2, worldMap.camera.zoom));
      const deltaX = last.x - e.clientX;
      const deltaY = e.clientY - last.y;
      worldMap.controller.move(deltaX * sizeFactor, deltaY * sizeFactor);
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const distance = pinchDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        // Doubling the distance between fingers zooms in by one level
        worldMap.controller.zoom(Math.log2(distance / lastPinchDistance));
      }
      lastPinchDistance = distance;
    }
  });

  const releasePointer = (e) => {
    activePointers.delete(e.pointerId);
    lastPinchDistance = null;
  };
  document.addEventListener("pointerup", releasePointer);
  document.addEventListener("pointercancel", releasePointer);
  document.addEventListener("contextmenu", () => {
    activePointers.clear();
    lastPinchDistance = null;
  });

  mapElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    worldMap.controller.zoom(e.deltaY < 0 ? 0.4 : -0.4);
  });

  for (const input of document.querySelectorAll("#mode-form input")) {
    input.addEventListener("change", () => worldMap.renderer.setRenderingMode(input.value));
  }

  document.getElementById("screenshot").addEventListener("click", () => {
    if (document.documentElement.dataset.map !== "ready") return;
    const renderer = worldMap.renderer;
    const { width, height } = renderer.canvas;
    // Without preserveDrawingBuffer, a frame is only readable in the task that drew it
    renderer.renderNow();
    renderer.canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, screenshotFileName(worldMap.generator.seed, width, height));
    }, "image/png");
  });
}
