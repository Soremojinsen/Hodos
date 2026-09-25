import { MAX_ZOOM, MIN_ZOOM, TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { WorldSampler } from "../generation/fields.js";
import { getRandomSeed } from "../generation/util.js";
import { inspectAt } from "./inspect.js";
import { MapRenderer } from "./renderer.js";
import { levelForZoom } from "./tile-grid.js";
import { worldToScreen } from "./view.js";

export class WorldMap {
  #seed;
  #worker;
  #sampler;
  #renderer;
  #controller;

  constructor(div, seed) {
    this.#seed = seed || getRandomSeed();
    this.#worker = new Worker(new URL("../generation/worker.js", import.meta.url), {
      type: "module",
    });
    this.#renderer = new MapRenderer(div, (tile) =>
      this.#worker.postMessage({ type: "tile", ...tile }),
    );
    this.#controller = new MapController(this);
  }

  resize(width, height) {
    this.#renderer.resize(width, height);
  }

  /**
   * Generates the world in the worker and loads the level-0 tile.
   */
  async load() {
    const world = new Promise((resolve, reject) => {
      this.#worker.onmessage = ({ data }) => {
        if (data.type === "world") {
          resolve(data.base);
        } else if (data.type === "tile") {
          this.#renderer.tiles.receive(data.tile);
        } else if (data.type === "error" && data.request.type === "init") {
          reject(new Error(data.message));
        } else if (data.type === "error") {
          const { z, x, y } = data.request;
          console.error(`Tile ${z}/${x}/${y} could not be built:`, data.message);
          this.#renderer.tiles.fail({ z, x, y }, new Error(data.message));
        }
      };
      this.#worker.onerror = (event) => {
        reject(new Error(event.message || "The map generation worker failed"));
      };
    }).catch((error) => {
      this.#renderer.showError("error.render");
      throw error;
    });
    this.#worker.postMessage({ type: "init", seed: this.#seed });
    try {
      const [base] = await Promise.all([world, this.#renderer.load()]);
      this.#sampler = new WorldSampler(base);
    } catch (error) {
      this.#worker.terminate();
      throw error;
    }
    this.#controller.setupCallback();
  }

  startRender() {
    this.#renderer.requestRender();
  }

  /**
   * Where a world point is on the map canvas, in pixels.
   */
  toScreen(x, y) {
    return worldToScreen(this.camera.view, x, y);
  }

  /**
   * What the map shows at a world point at the current zoom, see inspect.js; null before loading.
   */
  inspect(x, y) {
    if (!this.#sampler) return null;
    return inspectAt(this.#sampler, x, y, levelForZoom(this.camera.zoom));
  }

  get seed() {
    return this.#seed;
  }

  /**
   * The main thread's copy of the world, undefined until loaded.
   */
  get sampler() {
    return this.#sampler;
  }

  get camera() {
    return this.#renderer.camera;
  }

  get renderer() {
    return this.#renderer;
  }

  get controller() {
    return this.#controller;
  }
}

export class MapController {
  #map;

  constructor(map) {
    this.#map = map;
  }

  move(deltaX, deltaY) {
    this.#map.camera.posX += deltaX;
    this.#map.camera.posY += deltaY;
    this.#map.camera.updateGl();
  }

  zoom(deltaZoom) {
    let camera = this.#map.camera;
    let zoom = Math.min(Math.max(camera.zoom + deltaZoom, MIN_ZOOM), MAX_ZOOM);
    if (zoom !== camera.zoom) {
      camera.zoom = zoom;
      camera.updateGl();
    }
  }

  /**
   * Moves the camera to a position and zoom, kept within the world and the zoom limits.
   */
  setView(x, y, zoom) {
    const camera = this.#map.camera;
    const half = WORLD_SIZE / 2;
    camera.posX = Math.min(Math.max(x, -half), half);
    camera.posY = Math.min(Math.max(y, -half), half);
    camera.zoom = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    camera.updateGl();
  }

  onKeyPress(keyEvent) {
    // Let form fields (like the seed input or the language select) have their keys
    const target = keyEvent.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // The map is behind an open dialog, and Ctrl/Cmd +/- is the browser zoom
    if (document.querySelector("dialog[open]") || keyEvent.ctrlKey || keyEvent.metaKey) return;
    let zoom = this.#map.camera.zoom;
    let delta = (10 / (TILE_PIXEL_SIZE * Math.pow(2, zoom))) * WORLD_SIZE;
    switch (keyEvent.key) {
      case "ArrowLeft":
        this.move(-delta, 0);
        break;
      case "ArrowDown":
        this.move(0, -delta);
        break;
      case "ArrowRight":
        this.move(delta, 0);
        break;
      case "ArrowUp":
        this.move(0, delta);
        break;
      case "+":
        this.zoom(1);
        break;
      case "-":
        this.zoom(-1);
        break;
    }
  }

  setupCallback() {
    window.addEventListener("keydown", (e) => this.onKeyPress(e));
  }
}
