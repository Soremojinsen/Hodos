import { MAX_ZOOM } from "../constants.js";
import { BIOME_DEFINITIONS, markKind } from "../generation/biomes.js";
import { t } from "../i18n/i18n.js";
import { flipRows } from "./pixels.js";
import { DebugWorldShaderProgram, WorldShaderProgram } from "./shader.js";
import { Tile } from "./mesh.js";
import { levelForView, levelForZoom, paddedView, tileKey, tilesInView } from "./tile-grid.js";
import { TileManager } from "./tiles.js";
import { cameraView } from "./view.js";
import biomesFragment from "./shaders/world_biomes.frag?raw";
import biomesVertex from "./shaders/world_biomes.vert?raw";
import debugFragment from "./shaders/world_debug.frag?raw";
import debugVertex from "./shaders/world_debug.vert?raw";
import defaultFragment from "./shaders/world_default.frag?raw";
import defaultVertex from "./shaders/world_default.vert?raw";
import reliefSource from "./shaders/relief.glsl?raw";

/**
 * The most device pixels per CSS pixel the map is drawn with: denser screens (3 on many phones)
 * would shade over twice as many pixels for a difference hardly seen.
 */
export const MAX_PIXEL_RATIO = 2;

export class MapRenderer {
  #activeWorldShaderProgram;
  #defaultWorldShaderProgram;
  #biomeWorldShaderProgram;
  #debugWorldShaderProgram;
  #div;
  #canvas;
  // CSS pixels, see resize
  #width;
  #height;
  #pixelRatio = 1;
  #debugSpan;
  #gl;
  #camera;
  #frameRequested = false;
  #frameCount = 0;
  #frameListeners = [];
  #renderingMode = "default";

  #biomeTexture;
  #maxBiomeId;

  #tiles;
  #loaded = false;
  #drawnTiles = [];
  #errorShown = false;

  /**
   * @param requestTile {function({z, x, y})} starts building a tile, see TileManager
   * @param options     {{maxInFlight: Number}} how many tiles may be building at once
   */
  constructor(div, requestTile, { maxInFlight } = {}) {
    this.#div = div;
    this.#div.classList.add("hodos-map");
    this.#canvas = document.createElement("canvas");
    this.#canvas.classList.add("hodos-canvas");
    div.appendChild(this.#canvas);
    this.#width = this.#canvas.width;
    this.#height = this.#canvas.height;
    this.#debugSpan = document.createElement("span");
    this.#debugSpan.classList.add("hodos-debug");
    this.#debugSpan.style.visibility = "hidden";
    div.appendChild(this.#debugSpan);
    this.#gl = this.#canvas.getContext("webgl");
    if (!this.#gl) {
      this.showError("error.webgl");
    }
    this.#canvas.addEventListener("webglcontextlost", (event) => {
      // Without this the browser never gives the context back
      event.preventDefault();
      // Drawing into the lost context would do nothing, see addContextRestoredListener
      this.#loaded = false;
      this.#showMessage("error.contextLost");
    });
    this.#tiles = new TileManager({
      request: requestTile,
      maxInFlight,
      bake: (data) => {
        const tile = new Tile(data);
        tile.bake(this.#gl);
        return tile;
      },
      destroy: (tile) => tile.destroy(this.#gl),
      onChange: () => {
        this.#showTilesState();
        this.requestRender();
      },
    });
    this.#camera = new Camera(this);
  }

  /**
   * Sizes the map, in CSS pixels. The canvas has pixelRatio device pixels per CSS pixel, so
   * the map is sharp on high-density screens; the camera's view stays in CSS pixels.
   */
  resize(width, height) {
    if (!this.#gl) return;
    this.#width = width;
    this.#height = height;
    this.#pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.#canvas.width = Math.round(width * this.#pixelRatio);
    this.#canvas.height = Math.round(height * this.#pixelRatio);
    this.#canvas.style.width = `${width}px`;
    this.#canvas.style.height = `${height}px`;
    this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    this.camera.updateGl();
  }

  /**
   * The size of the map in CSS pixels, see resize.
   */
  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  /**
   * Device pixels per CSS pixel on the map canvas.
   */
  get pixelRatio() {
    return this.#pixelRatio;
  }

  async load() {
    if (!this.#gl) {
      throw new Error("WebGL is unavailable");
    }
    try {
      this.#loadShaders();
      this.#loadBiomeColors();
      // The level-0 tile is the fallback of every other tile: it is loaded first and never released
      const fallback = this.#tiles.ensure([{ z: 0, x: 0, y: 0 }]);
      // The camera's tiles come next, so the other workers build them meanwhile
      this.#wantCameraTiles();
      await fallback;
      this.#loaded = true;
    } catch (error) {
      this.showError("error.render");
      throw error;
    }
  }

  /**
   * Displays an error message over the map, in place of the canvas. A no-op once an error is
   * already shown: a failing load can reach this from two paths (its own catch and the worker
   * answering a queued tile request with an error), and only the first should be shown.
   *
   * @param key {string} the translation key of the message
   */
  showError(key) {
    if (this.#errorShown) return;
    this.#errorShown = true;
    this.#canvas.remove();
    this.#showMessage(key);
  }

  // Displays a message over the map
  #showMessage(key) {
    let message = document.createElement("p");
    message.classList.add("hodos-error");
    message.dataset.i18n = key;
    message.textContent = t(key);
    this.#div.appendChild(message);
  }

  /**
   * Calls a function when the browser gives back a WebGL context it took away (GPU reset, tab
   * in the background on mobile). Every WebGL object was lost with it: nothing is drawn after
   * the loss, and it is up to the function to start again, see main.js.
   */
  addContextRestoredListener(listener) {
    this.#canvas.addEventListener("webglcontextrestored", listener);
  }

  /**
   * Schedules drawing a frame, unless one is already scheduled.
   * Call it whenever something visible changes; nothing is drawn otherwise.
   */
  requestRender() {
    if (this.#frameRequested || !this.#loaded) return;
    this.#frameRequested = true;
    window.requestAnimationFrame(() => {
      this.#frameRequested = false;
      this.renderNow();
    });
  }

  /**
   * Draws a frame right away. The frame can be read from the canvas until the current task ends.
   */
  renderNow() {
    if (!this.#loaded) return;
    const start = performance.now();
    this.#drawScene(this.camera.view, levelForZoom(this.camera.zoom));
    this.#frameCount++;
    const frameTime = performance.now() - start;
    this.#debugSpan.innerText =
      `Frames: ${this.#frameCount}` +
      ` | Frame time: ${frameTime.toFixed(1)}ms` +
      ` | Zoom: ${this.camera.zoom}` +
      ` | PosX: ${this.camera.posX}` +
      ` | PosY: ${this.camera.posY}`;
    for (const listener of this.#frameListeners) listener();
  }

  /**
   * Draws the tiles of a level that a view shows, into the bound framebuffer. While some are
   * missing, the loaded tiles of coarser levels are drawn under them (see TileManager.drawList).
   * The view is padded (see tile-grid.js paddedView) so neighbour tiles whose cells reach past
   * the view's edge are drawn too.
   */
  #drawScene(view, level) {
    this.#gl.clearColor(0.278, 0.47, 0.525, 1);
    this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
    const tiles = this.#tiles.drawList((k) => tilesInView(paddedView(view, k), k), level);
    for (const tile of tiles) tile.render(this.#activeWorldShaderProgram);
    this.#drawnTiles = tiles.map((tile) => tileKey(tile.z, tile.x, tile.y));
  }

  /**
   * The largest image side renderToPixels can draw at once.
   */
  get maxChunkSize() {
    const gl = this.#gl;
    const [maxWidth, maxHeight] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(
      2048,
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      maxWidth,
      maxHeight,
    );
  }

  /**
   * Draws a view offscreen and reads its pixels.
   * The map on screen and the camera are left as they were, even if this throws.
   *
   * @param view see view.js; width and height at most maxChunkSize
   * @param level the tile level to draw; its tiles should be ready, see ensureTiles
   * @param mode the rendering mode to draw in, see setRenderingMode; the screen's by default
   * @returns {Uint8ClampedArray} RGBA, top row first, opaque
   */
  renderToPixels(view, level = levelForView(view), mode = this.#renderingMode) {
    const gl = this.#gl;
    const { width, height } = view;
    const screenProgram = this.#activeWorldShaderProgram;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    try {
      // Texture unit 0 holds the biome colors: use another one
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("The offscreen framebuffer is incomplete");
      }
      gl.viewport(0, 0, width, height);
      this.#useProgram(this.#programFor(mode));
      this.#activeWorldShaderProgram.setView(view);
      this.#drawScene(view, level);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return flipRows(pixels, width, height);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
      this.#useProgram(screenProgram);
      // Puts the camera's matrix back and redraws the screen
      this.camera.updateGl();
    }
  }

  /**
   * The tile manager, which receives the tiles the worker builds.
   */
  get tiles() {
    return this.#tiles;
  }

  /**
   * Waits until every tile a view needs at a level is loaded, and keeps them until released.
   * Includes the padded neighbour tiles #drawScene also draws for that view, see paddedView.
   *
   * @returns {Promise<function()>} the release function
   */
  ensureTiles(view, level) {
    return this.#tiles.ensure(tilesInView(paddedView(view, level), level));
  }

  /**
   * The keys ("z/x/y") of the tiles drawn in the last frame, on screen or offscreen.
   */
  get drawnTiles() {
    return this.#drawnTiles;
  }

  /**
   * Asks for the camera's tiles, with a ring around them, and redraws.
   */
  viewChanged() {
    if (this.#loaded) {
      this.#wantCameraTiles();
      this.#showTilesState();
    }
    this.requestRender();
  }

  // The camera's tiles with a ring around them, then, when the workers have nothing else to do,
  // those of the next level, so zooming in shows its detail at once. Zooming keeps the centre
  // of the view, and the next level is first drawn at zoom level + 0.5: the view at that zoom
  // is the largest that level will show from here.
  #wantCameraTiles() {
    const view = this.camera.view;
    const level = levelForZoom(this.camera.zoom);
    let next = [];
    if (level < MAX_ZOOM) {
      const scale = 2 ** (level + 0.5 - this.camera.zoom);
      const zoomedIn = { ...view, pixelsPerUnit: view.pixelsPerUnit * scale };
      next = tilesInView(paddedView(zoomedIn, level + 1), level + 1);
    }
    this.#tiles.want(tilesInView(view, level, 1), next);
  }

  // For tests and styles: data-tiles is "settled" when no wanted tile is still loading, and
  // "idle" once no tile at all is, not even those of the next level (whose arrival draws a frame)
  #showTilesState() {
    const tiles = this.#tiles;
    this.#div.dataset.tiles = tiles.idle ? "idle" : tiles.settled ? "settled" : "loading";
  }

  /**
   * The number of frames drawn so far.
   */
  get frameCount() {
    return this.#frameCount;
  }

  /**
   * Calls a function after every frame drawn on screen.
   */
  addFrameListener(listener) {
    this.#frameListeners.push(listener);
  }

  /**
   * The rendering mode: "default", "biomes" or "debug".
   */
  get renderingMode() {
    return this.#renderingMode;
  }

  #loadShaders() {
    this.#defaultWorldShaderProgram = new WorldShaderProgram(
      this.#gl,
      "world_default",
      defaultVertex,
      reliefSource + defaultFragment,
    );
    this.#biomeWorldShaderProgram = new WorldShaderProgram(
      this.#gl,
      "world_biomes",
      biomesVertex,
      reliefSource + biomesFragment,
    );
    this.#debugWorldShaderProgram = new DebugWorldShaderProgram(
      this.#gl,
      "world_debug",
      debugVertex,
      debugFragment,
    );
    this.#defaultWorldShaderProgram.compile();
    this.#biomeWorldShaderProgram.compile();
    this.#debugWorldShaderProgram.compile();
    this.#activeWorldShaderProgram = this.#defaultWorldShaderProgram;
    this.#activeWorldShaderProgram.use();
  }

  #loadBiomeColors() {
    // Low color, high color and mark kind of each biome, by id (the index in BIOME_DEFINITIONS),
    // see shaders/relief.glsl biomeTexel
    const colors = new Uint8Array(9 * BIOME_DEFINITIONS.length);
    BIOME_DEFINITIONS.forEach(({ low, high, mark }, id) => {
      colors.set(
        [...low, ...high].map((component) => component * 0xff),
        9 * id,
      );
      colors[9 * id + 6] = markKind(mark);
    });
    this.#maxBiomeId = BIOME_DEFINITIONS.length - 1;
    const gl = this.#gl;
    this.#biomeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.#biomeTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      colors.length / 3,
      1,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      colors,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#setBiomes();
  }

  #setBiomes() {
    this.#activeWorldShaderProgram.setBiomesColors(this.#biomeTexture, this.#maxBiomeId);
  }

  // Makes a program the one drawing, with its attributes and the biome colors
  #useProgram(program) {
    if (program === this.#activeWorldShaderProgram) return;
    this.#activeWorldShaderProgram.stopUsing();
    program.use();
    this.#activeWorldShaderProgram = program;
    this.#setBiomes();
  }

  #changeShaderProgram(newShaders) {
    this.#useProgram(newShaders);
    this.camera.updateGl();
  }

  // The program of a known rendering mode
  #programFor(mode) {
    switch (mode) {
      case "biomes":
        return this.#biomeWorldShaderProgram;
      case "debug":
        return this.#debugWorldShaderProgram;
      default:
        return this.#defaultWorldShaderProgram;
    }
  }

  setRenderingMode(mode) {
    if (!["default", "biomes", "debug"].includes(mode)) {
      console.warn(`Unknown rendering mode "${mode}", falling back to default`);
      mode = "default";
    }
    this.#renderingMode = mode;
    const newProgram = this.#programFor(mode);
    const debug = mode === "debug";
    if (debug) {
      this.#debugSpan.style.visibility = "visible";
    } else {
      this.#debugSpan.style.visibility = "hidden";
    }
    if (newProgram !== this.#activeWorldShaderProgram) {
      this.#changeShaderProgram(newProgram);
    }
  }

  get camera() {
    return this.#camera;
  }

  get worldShaderProgram() {
    return this.#activeWorldShaderProgram;
  }

  get canvas() {
    return this.#canvas;
  }
}

export class Camera {
  #renderer;

  posX = 0;
  posY = 0;
  zoom = 0;

  constructor(renderer) {
    this.#renderer = renderer;
  }

  /**
   * What the camera shows on the map, in CSS pixels, see view.js. The view matrix does not
   * depend on the pixel size, so it also draws the canvas's device pixels.
   */
  get view() {
    return cameraView(this, this.#renderer.width, this.#renderer.height);
  }

  /**
   * Updates the WebGL context so the values in this camera are used for rendering.
   */
  updateGl() {
    let program = this.#renderer.worldShaderProgram;
    if (!program) return; // Not loaded (yet)
    program.setView(this.view, this.#renderer.pixelRatio);
    this.#renderer.viewChanged();
  }
}
