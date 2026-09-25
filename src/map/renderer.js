import { BIOMES } from "../generation/biomes.js";
import { t } from "../i18n/i18n.js";
import { flipRows } from "./pixels.js";
import { BiomesWorldShaderProgram, DebugWorldShaderProgram, WorldShaderProgram } from "./shader.js";
import { Tile } from "./mesh.js";
import { cameraView, viewMatrix } from "./view.js";
import biomesFragment from "./shaders/world_biomes.frag?raw";
import biomesVertex from "./shaders/world_biomes.vert?raw";
import debugFragment from "./shaders/world_debug.frag?raw";
import debugVertex from "./shaders/world_debug.vert?raw";
import defaultFragment from "./shaders/world_default.frag?raw";
import defaultVertex from "./shaders/world_default.vert?raw";

export class MapRenderer {
  #activeWorldShaderProgram;
  #defaultWorldShaderProgram;
  #biomeWorldShaderProgram;
  #debugWorldShaderProgram;
  #div;
  #canvas;
  #debugSpan;
  #gl;
  #camera;
  #frameRequested = false;
  #frameCount = 0;
  #frameListeners = [];
  #renderingMode = "default";

  #biomeTexture;
  #maxBiomeId;

  #generator;

  constructor(div, generator) {
    this.#div = div;
    this.#div.classList.add("hodos-map");
    this.#canvas = document.createElement("canvas");
    this.#canvas.classList.add("hodos-canvas");
    div.appendChild(this.#canvas);
    this.#debugSpan = document.createElement("span");
    this.#debugSpan.classList.add("hodos-debug");
    this.#debugSpan.style.visibility = "hidden";
    div.appendChild(this.#debugSpan);
    this.#gl = this.#canvas.getContext("webgl");
    if (!this.#gl) {
      this.showError("error.webgl");
    }
    this.#generator = generator;
    this.#camera = new Camera(this);
  }

  resize(width, height) {
    if (!this.#gl) return;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    this.camera.updateGl();
  }

  async load() {
    if (!this.#gl) {
      throw new Error("WebGL is unavailable");
    }
    try {
      // Data needs the shader programs to be linked, so this is sequential
      this.#loadShaders();
      await this.#loadData();
    } catch (error) {
      this.showError("error.render");
      throw error;
    }
  }

  /**
   * Displays an error message over the map, in place of the canvas.
   *
   * @param key {string} the translation key of the message
   */
  showError(key) {
    let error = document.createElement("p");
    error.classList.add("hodos-error");
    error.dataset.i18n = key;
    error.textContent = t(key);
    this.#canvas.remove();
    this.#div.appendChild(error);
  }

  /**
   * Schedules drawing a frame, unless one is already scheduled.
   * Call it whenever something visible changes; nothing is drawn otherwise.
   */
  requestRender() {
    if (this.#frameRequested || !this.tileTest) return;
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
    if (!this.tileTest) return;
    const start = performance.now();
    this.#drawScene();
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
   * Draws the map with the active program and view matrix, into the bound framebuffer.
   */
  #drawScene() {
    this.#gl.clearColor(0.278, 0.47, 0.525, 1);
    this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
    this.tileTest.render(this.#activeWorldShaderProgram);
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
   * Draws a view offscreen, in the current rendering mode, and reads its pixels.
   * The map on screen and the camera are left as they were, even if this throws.
   *
   * @param view see view.js; width and height at most maxChunkSize
   * @returns {Uint8ClampedArray} RGBA, top row first, opaque
   */
  renderToPixels(view) {
    const gl = this.#gl;
    const { width, height } = view;
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
      this.#activeWorldShaderProgram.setViewMatrix(viewMatrix(view));
      this.#drawScene();
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return flipRows(pixels, width, height);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
      // Puts the camera's matrix back and redraws the screen
      this.camera.updateGl();
    }
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
      defaultFragment,
    );
    this.#biomeWorldShaderProgram = new BiomesWorldShaderProgram(
      this.#gl,
      "world_biomes",
      biomesVertex,
      biomesFragment,
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

  async #loadData() {
    this.#generator.generate();
    this.tileTest = new Tile(0, 0, 0, this.#generator.cells);
    this.tileTest.bake(this.#gl);

    // Biome texture
    let biomes = Object.values(BIOMES);
    this.#maxBiomeId = Math.max(...biomes.map((b) => b.id));
    let colorArray = new Array(this.#maxBiomeId);
    biomes.forEach((biome) => {
      colorArray[6 * biome.id] = biome.lowColor.red * 0xff;
      colorArray[6 * biome.id + 1] = biome.lowColor.green * 0xff;
      colorArray[6 * biome.id + 2] = biome.lowColor.blue * 0xff;
      colorArray[6 * biome.id + 3] = biome.highColor.red * 0xff;
      colorArray[6 * biome.id + 4] = biome.highColor.green * 0xff;
      colorArray[6 * biome.id + 5] = biome.highColor.blue * 0xff;
    });
    this.#biomeTexture = this.#gl.createTexture();
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#biomeTexture);
    this.#gl.texImage2D(
      this.#gl.TEXTURE_2D,
      0,
      this.#gl.RGB,
      Math.ceil(colorArray.length / 3),
      1,
      0,
      this.#gl.RGB,
      this.#gl.UNSIGNED_BYTE,
      new Uint8Array(colorArray),
    );
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.NEAREST);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, this.#gl.NEAREST);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE);
    this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE);
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, null);
    this.#setBiomes();
  }

  #setBiomes() {
    this.#activeWorldShaderProgram.setBiomesColors(this.#biomeTexture, this.#maxBiomeId);
  }

  #changeShaderProgram(newShaders) {
    this.#activeWorldShaderProgram.stopUsing();
    newShaders.use();
    this.#activeWorldShaderProgram = newShaders;
    this.camera.updateGl();
    this.#setBiomes();
  }

  setRenderingMode(mode) {
    let newProgram;
    let debug = false;
    switch (mode) {
      case "default":
        newProgram = this.#defaultWorldShaderProgram;
        this.#renderingMode = mode;
        break;
      case "debug":
        newProgram = this.#debugWorldShaderProgram;
        debug = true;
        this.#renderingMode = mode;
        break;
      case "biomes":
        newProgram = this.#biomeWorldShaderProgram;
        this.#renderingMode = mode;
        break;
      default:
        console.warn(`Unknown rendering mode "${mode}", falling back to default`);
        newProgram = this.#defaultWorldShaderProgram;
        this.#renderingMode = "default";
    }
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
   * What the camera shows on the map canvas, see view.js.
   */
  get view() {
    const canvas = this.#renderer.canvas;
    return cameraView(this, canvas.width, canvas.height);
  }

  /**
   * Updates the WebGL context so the values in this camera are used for rendering.
   */
  updateGl() {
    let program = this.#renderer.worldShaderProgram;
    if (!program) return; // Not loaded (yet)
    program.setViewMatrix(viewMatrix(this.view));
    this.#renderer.requestRender();
  }
}
