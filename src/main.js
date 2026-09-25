import "./styles/map.scss";
import { WorldMap } from "./map/map.js";
import { setupControls } from "./ui/controls.js";
import { initLanguage, setupLanguageSwitch } from "./ui/language.js";
import { setupModals } from "./ui/modals.js";

// Texts first: the renderer shows an error as soon as it is created if WebGL is missing
initLanguage();

/**
 * The "seed" URL parameter, or null if not set.
 */
const seedFromURL = new URL(window.location.href).searchParams.get("seed");

const worldMap = new WorldMap(document.getElementById("map"), seedFromURL);
// Debug handle, for the browser console and the browser tests
window.hodos = worldMap;

const resize = () => worldMap.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", resize);

setupControls(worldMap);
setupModals();
setupLanguageSwitch();
document.getElementById("default-toggle").checked = true;

worldMap
  .load()
  .then(() => {
    resize();
    worldMap.startRender();
    worldMap.controller.zoom(1);
    for (const element of document.getElementsByClassName("seed-placeholder")) {
      element.value = worldMap.generator.seed;
    }
    document.documentElement.dataset.map = "ready";
  })
  .catch((error) => {
    console.error("Could not load the map:", error);
    document.documentElement.dataset.map = "error";
  });
