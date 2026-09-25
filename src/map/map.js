import { MAX_ZOOM, MIN_ZOOM, TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { MapGenerator } from "../generation/world.js";
import { MapRenderer } from "./renderer.js";
import { worldToScreen } from "./view.js";

export class WorldMap {
  #generator;
  #renderer;
  #controller;

  constructor(div, seed) {
    this.#generator = new MapGenerator(seed);
    this.#renderer = new MapRenderer(div, this.#generator);
    this.#controller = new MapController(this);
  }

  resize(width, height) {
    this.#renderer.resize(width, height);
  }

  async load() {
    await this.#renderer.load();
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

  get camera() {
    return this.#renderer.camera;
  }

  get renderer() {
    return this.#renderer;
  }

  get generator() {
    return this.#generator;
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
