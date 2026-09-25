import { DEFAULT_GRID, normalizeGrid } from "../state/url-state.js";
import { drawGrid } from "./grid.js";

/**
 * A transparent canvas over the map, where the grid is drawn after each map frame.
 */
export class GridOverlay {
  #canvas;
  #context;
  #worldMap;
  #settings = DEFAULT_GRID;

  /**
   * @param mapElement  {HTMLElement} the element holding the map canvas
   * @param worldMap    {WorldMap}
   */
  constructor(mapElement, worldMap) {
    this.#worldMap = worldMap;
    this.#canvas = document.createElement("canvas");
    this.#canvas.classList.add("hodos-overlay");
    mapElement.appendChild(this.#canvas);
    this.#context = this.#canvas.getContext("2d");
    worldMap.renderer.addFrameListener(() => this.draw());
  }

  /**
   * The grid settings, see state/url-state.js.
   */
  get settings() {
    return this.#settings;
  }

  set settings(settings) {
    this.#settings = normalizeGrid(settings);
    this.#worldMap.renderer.requestRender();
  }

  get canvas() {
    return this.#canvas;
  }

  /**
   * Draws the grid for the current camera, at the size of the map canvas.
   */
  draw() {
    const { width, height } = this.#worldMap.renderer.canvas;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      // Resizing also clears the canvas
      this.#canvas.width = width;
      this.#canvas.height = height;
    } else {
      this.#context.clearRect(0, 0, width, height);
    }
    drawGrid(this.#context, this.#worldMap.camera.view, this.#settings);
  }
}
