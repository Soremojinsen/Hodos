import { TILE_PIXEL_SIZE, WORLD_SIZE } from "../constants.js";
import { BIOMES } from "../generation/biomes.js";
import { BiomesWorldShaderProgram, DebugWorldShaderProgram, WorldShaderProgram } from "./shader.js";
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
      this.showError("Hodos a besoin de WebGL pour dessiner la carte, mais votre navigateur ne le supporte pas ou l'a désactivé. " +
          "(Hodos needs WebGL to draw the map, but this browser does not support it or has it disabled.)");
    }
    this.#generator = generator;
    this.#camera = new Camera(this);
  }

  resize(width, height) {
    if (!this.#gl) return;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    this.camera.scaleX = TILE_PIXEL_SIZE / WORLD_SIZE / (width / 2);
    this.camera.scaleY = TILE_PIXEL_SIZE / WORLD_SIZE / (height / 2);
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
      this.showError("La carte n'a pas pu être dessinée. (The map could not be drawn, see the browser console for details.)");
      throw error;
    }
  }

  /**
   * Displays an error message over the map, in place of the canvas.
   *
   * @param message {string} the message to display
   */
  showError(message) {
    let error = document.createElement("p");
    error.classList.add("hodos-error");
    error.innerText = message;
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
    this.#gl.clearColor(0.278, 0.470, 0.525, 1);
    this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
    this.tileTest.render(this.#activeWorldShaderProgram);
    this.#frameCount++;
    const frameTime = performance.now() - start;
    this.#debugSpan.innerText =
      `Frames: ${this.#frameCount}` +
      ` | Frame time: ${frameTime.toFixed(1)}ms` +
      ` | Zoom: ${this.camera.zoom}` +
      ` | PosX: ${this.camera.posX}` +
      ` | PosY: ${this.camera.posY}`;
  }

  /**
   * The number of frames drawn so far.
   */
  get frameCount() {
    return this.#frameCount;
  }

  #loadShaders() {
    this.#defaultWorldShaderProgram = new WorldShaderProgram(this.#gl, "world_default", defaultVertex, defaultFragment);
    this.#biomeWorldShaderProgram = new BiomesWorldShaderProgram(this.#gl, "world_biomes", biomesVertex, biomesFragment);
    this.#debugWorldShaderProgram = new DebugWorldShaderProgram(this.#gl, "world_debug", debugVertex, debugFragment);
    this.#defaultWorldShaderProgram.compile();
    this.#biomeWorldShaderProgram.compile();
    this.#debugWorldShaderProgram.compile();
    this.#activeWorldShaderProgram = this.#defaultWorldShaderProgram;
    this.#activeWorldShaderProgram.use();
  }

  async #loadData() {
    this.tileTest = this.#generator.generateTile(0, 0, 0);
    this.tileTest.bake(this.#gl);

    // Biome texture
    let biomes = Object.values(BIOMES);
    this.#maxBiomeId = Math.max(...biomes.map(b => b.id));
    let colorArray = new Array(this.#maxBiomeId);
    biomes.forEach(biome => {
      colorArray[6 * biome.id] = biome.lowColor.red * 0xFF;
      colorArray[6 * biome.id + 1] = biome.lowColor.green * 0xFF;
      colorArray[6 * biome.id + 2] = biome.lowColor.blue * 0xFF;
      colorArray[6 * biome.id + 3] = biome.highColor.red * 0xFF;
      colorArray[6 * biome.id + 4] = biome.highColor.green * 0xFF;
      colorArray[6 * biome.id + 5] = biome.highColor.blue * 0xFF;
    });
    this.#biomeTexture = this.#gl.createTexture();
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#biomeTexture);
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGB,
        Math.ceil(colorArray.length / 3), 1, 0,
        this.#gl.RGB, this.#gl.UNSIGNED_BYTE, new Uint8Array(colorArray));
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
        break;
      case "debug":
        newProgram = this.#debugWorldShaderProgram;
        debug = true;
        break;
      case "biomes":
        newProgram = this.#biomeWorldShaderProgram;
        break;
      default:
        console.warn(`Unknown rendering mode "${mode}", falling back to default`);
        newProgram = this.#defaultWorldShaderProgram;
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

  get canvas(){
    return this.#canvas;
  }

}

export class Camera {

  #renderer;

  scaleX = 1;
  scaleY = 1;
  posX = 0;
  posY = 0;
  zoom = 0;

  constructor(renderer) {
    this.#renderer = renderer;
  }

  /**
   * Updates the WebGL context so the values in this camera are used for rendering.
   */
  updateGl() {
    let program = this.#renderer.worldShaderProgram;
    if (!program) return; // Not loaded (yet)
    let zoomFactor = Math.pow(2, this.zoom);
    let scaleX = this.scaleX * zoomFactor;
    let scaleY = this.scaleY * zoomFactor;
    let deltaX = - (this.posX + WORLD_SIZE / 2) * scaleX;
    let deltaY = - (this.posY + WORLD_SIZE / 2) * scaleY;
    let matrix = new Float32Array(
        [scaleX, 0,      0, 0,
          0,      scaleY, 0, 0,
          0,      0,      0, 0,
          deltaX, deltaY, 0, 1]);
    program.setViewMatrix(matrix);
    this.#renderer.requestRender();
  }

}