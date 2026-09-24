/**
 * The size of a rendered map tile, in pixels on the screen.
 */
const TILE_PIXEL_SIZE = 256;

/**
 * The maximum world coordinates in the 0/0/0 tile.
 */
const WORLD_SIZE = 10_000;

/**
 * The zoom levels the camera can use.
 */
const MIN_ZOOM = 0;
const MAX_ZOOM = 7;

class WorldMap {
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
    window.requestAnimationFrame((t) => this.#renderer.render(t));
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

class MapController {
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

  toggleDebug() {
    let renderer = this.#map.renderer;
    renderer.debug = !renderer.debug;
  }

  onKeyPress(keyEvent) {
    // Let form fields (like the seed input) have their keys
    if (keyEvent.target instanceof HTMLInputElement) return;
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
    window.onkeydown = (e) => {
      this.onKeyPress(e);
    };
  }

}
