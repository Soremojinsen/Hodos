/**
 * How many pixels of wheel scroll zoom in by one level: a 100 px mouse notch zooms by 0.4.
 */
const WHEEL_PIXELS_PER_ZOOM = 250;

/**
 * Pixels per wheel delta unit, by deltaMode: pixels, lines (Firefox: 3 per notch, so a notch
 * zooms as in Chrome), pages (one zoom level).
 */
const WHEEL_MODE_PIXELS = [1, 100 / 3, WHEEL_PIXELS_PER_ZOOM];

/**
 * Connects the zoom buttons, pointer gestures, mouse wheel and rendering mode form to the map.
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
      const sizeFactor = 1 / worldMap.camera.view.pixelsPerUnit;
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
    // A horizontal scroll has no vertical delta
    if (e.deltaY === 0) return;
    // By how far it scrolls: a trackpad sends many small steps where a mouse sends one notch
    const pixels = e.deltaY * (WHEEL_MODE_PIXELS[e.deltaMode] ?? 1);
    worldMap.controller.zoom(-pixels / WHEEL_PIXELS_PER_ZOOM);
  });

  for (const input of document.querySelectorAll("#mode-form input")) {
    input.addEventListener("change", () => worldMap.renderer.setRenderingMode(input.value));
  }
}
