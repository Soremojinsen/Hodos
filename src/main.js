import { getRandomSeed } from "./generation/util.js";
import { WorldMap } from "./map/map.js";
import { LabelLayer } from "./overlay/label-layer.js";
import { GridOverlay } from "./overlay/overlay.js";
import { parseState } from "./state/url-state.js";
import { setupControls } from "./ui/controls.js";
import { setupExportDialog } from "./ui/export-dialog.js";
import { setupGridControls } from "./ui/grid-controls.js";
import { setupHoverInfo } from "./ui/hover.js";
import { initLanguage, setupLanguageSwitch } from "./ui/language.js";
import { setupModals } from "./ui/modals.js";
import { setupNavigation } from "./ui/navigation.js";
import { startUrlSync } from "./ui/url-sync.js";
import { setupViewButtons } from "./ui/view-buttons.js";

// Texts first: the renderer shows an error as soon as it is created if WebGL is missing
initLanguage();

const initialState = parseState(window.location.search);
const worldMap = new WorldMap(document.getElementById("map"), initialState.seed ?? getRandomSeed());
// Debug handle, for the browser console and the browser tests
window.hodos = worldMap;
const overlay = new GridOverlay(document.getElementById("map"), worldMap);
const labelLayer = new LabelLayer(worldMap);
overlay.labels = labelLayer;
// Debug handle, for the browser tests
window.hodosLabels = labelLayer;

/**
 * The mode of the settings form: the link's, until one is chosen, even while the map is
 * generating (the renderer cannot switch modes before it has loaded).
 */
const checkedMode = () => document.querySelector("#mode-form input:checked").value;

/**
 * The state a link to the current map carries, see state/url-state.js.
 *
 * While the map is still generating (data-map is not yet "ready"), the camera and rendering
 * mode the renderer exposes are still their construction defaults (zoom 0, mode "default"), not
 * what the link asked for: the initial state parsed from the URL is used instead, with the
 * map's actual seed (which is set synchronously, even for a random seed), and the mode and grid
 * of the settings, which may already have been changed.
 */
const currentState = () =>
  document.documentElement.dataset.map === "ready"
    ? {
        seed: worldMap.seed,
        x: worldMap.camera.posX,
        y: worldMap.camera.posY,
        z: worldMap.camera.zoom,
        mode: worldMap.renderer.renderingMode,
        grid: overlay.settings,
      }
    : { ...initialState, seed: worldMap.seed, mode: checkedMode(), grid: overlay.settings };
const urlSync = startUrlSync(worldMap.renderer, currentState);
// The link holds the whole state, so reloading it brings the same map back, rather than
// rebuilding every WebGL object the lost context took with it
worldMap.renderer.addContextRestoredListener(() => {
  urlSync.syncNow();
  window.location.reload();
});

const resize = () => worldMap.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", resize);
// Moving the window to a screen of another pixel density may not change its size
const watchPixelRatio = () =>
  window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
    "change",
    () => {
      resize();
      watchPixelRatio();
    },
    { once: true },
  );
watchPixelRatio();

setupControls(worldMap);
setupModals();
setupLanguageSwitch();
// The labels are drawn on the canvas: a language switch draws them again in the new language
document
  .getElementById("language-select")
  .addEventListener("change", () => worldMap.renderer.requestRender());
setupNavigation(currentState, urlSync);
setupViewButtons(worldMap);
setupGridControls(overlay, initialState.grid);
setupHoverInfo(worldMap);
const exportDialog = setupExportDialog(worldMap, overlay);
// Browsers restore form fields on reload: the link decides the mode
document.querySelector(`#mode-form input[value="${initialState.mode}"]`).checked = true;

// The link's view before loading, so its tiles are built with the first ones
resize();
worldMap.controller.setView(initialState.x, initialState.y, initialState.z);
worldMap
  .load()
  .then(() => {
    resize();
    worldMap.renderer.setRenderingMode(checkedMode());
    worldMap.controller.setView(initialState.x, initialState.y, initialState.z);
    worldMap.startRender();
    for (const element of document.getElementsByClassName("seed-placeholder")) {
      element.value = worldMap.seed;
    }
    // A random seed goes into the address bar right away, so a refresh keeps the map
    urlSync.syncNow();
    document.documentElement.dataset.map = "ready";
    // An export dialog opened while generating showed sizes for the canvas before its resize
    exportDialog.viewResized();
  })
  .catch((error) => {
    console.error("Could not load the map:", error);
    document.documentElement.dataset.map = "error";
  });
