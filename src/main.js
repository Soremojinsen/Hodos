import "./styles/map.scss";
import { getRandomSeed } from "./generation/util.js";
import { WorldMap } from "./map/map.js";
import { DEFAULT_GRID, parseState } from "./state/url-state.js";
import { setupControls } from "./ui/controls.js";
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

/**
 * The state a link to the current map carries, see state/url-state.js.
 */
const currentState = () => ({
  seed: worldMap.generator.seed,
  x: worldMap.camera.posX,
  y: worldMap.camera.posY,
  z: worldMap.camera.zoom,
  mode: worldMap.renderer.renderingMode,
  grid: DEFAULT_GRID,
});
const urlSync = startUrlSync(worldMap.renderer, currentState);

const resize = () => worldMap.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", resize);

setupControls(worldMap);
setupModals();
setupLanguageSwitch();
setupNavigation(currentState, urlSync);
setupViewButtons(worldMap);
// Browsers restore form fields on reload: the link decides the mode
document.querySelector(`#mode-form input[value="${initialState.mode}"]`).checked = true;

worldMap
  .load()
  .then(() => {
    resize();
    worldMap.renderer.setRenderingMode(initialState.mode);
    worldMap.controller.setView(initialState.x, initialState.y, initialState.z);
    worldMap.startRender();
    for (const element of document.getElementsByClassName("seed-placeholder")) {
      element.value = worldMap.generator.seed;
    }
    // A random seed goes into the address bar right away, so a refresh keeps the map
    urlSync.syncNow();
    document.documentElement.dataset.map = "ready";
  })
  .catch((error) => {
    console.error("Could not load the map:", error);
    document.documentElement.dataset.map = "error";
  });
