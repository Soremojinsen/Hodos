import { pixelSize, riverWidthUniform } from "../generation/rivers.js";
import { viewMatrix } from "./view.js";

/**
 * A WebGL shader, compiled from GLSL source bundled with the page.
 */
export class Shader {
  #gl;
  #type;
  #name;
  #source;
  #glShader;

  /**
   * @param gl      {WebGLRenderingContext}
   * @param name    {string} a name for error messages, e.g. "world_default.frag"
   * @param source  {string} the GLSL source code
   * @param type    the WebGL shader type
   */
  constructor(gl, name, source, type) {
    this.#gl = gl;
    this.#name = name;
    this.#source = source;
    this.#type = type;
  }

  /**
   * Compiles this shader, logging the GLSL error log and throwing if it fails.
   */
  compile() {
    this.#glShader = this.#gl.createShader(this.#type);
    this.#gl.shaderSource(this.#glShader, this.#source);
    this.#gl.compileShader(this.#glShader);
    if (!this.#gl.getShaderParameter(this.#glShader, this.#gl.COMPILE_STATUS)) {
      const log = this.#gl.getShaderInfoLog(this.#glShader);
      console.error(`Failed to compile shader ${this.#name}:\n${log}`);
      throw new Error(`Failed to compile shader ${this.#name}`);
    }
  }

  get name() {
    return this.#name;
  }

  /**
   * Attaches this shader to the given program.
   *
   * @param glProgram  the WebGL shader program object
   */
  linkTo(glProgram) {
    this.#gl.attachShader(glProgram, this.#glShader);
  }
}

export class VertexShader extends Shader {
  constructor(gl, name, source) {
    super(gl, name, source, gl.VERTEX_SHADER);
  }
}

export class FragmentShader extends Shader {
  constructor(gl, name, source) {
    super(gl, name, source, gl.FRAGMENT_SHADER);
  }
}

/**
 * Shader programs are responsible for doing the actual rendering.
 * They have a vertex shader and a fragment shader,
 * and manage the various variables that control those shaders' behavior.
 */
export class ShaderProgram {
  #gl;
  #name;
  #vertexShader;
  #fragmentShader;
  #glProgram;

  /**
   * @param gl              {WebGLRenderingContext}
   * @param name            {string} the program name, e.g. "world_default"
   * @param vertexSource    {string} GLSL source of the vertex shader
   * @param fragmentSource  {string} GLSL source of the fragment shader
   */
  constructor(gl, name, vertexSource, fragmentSource) {
    this.#gl = gl;
    this.#name = name;
    this.#vertexShader = new VertexShader(gl, `${name}.vert`, vertexSource);
    this.#fragmentShader = new FragmentShader(gl, `${name}.frag`, fragmentSource);
  }

  /**
   * Compiles both shaders and links them into a program.
   */
  compile() {
    this.#vertexShader.compile();
    this.#fragmentShader.compile();
    this.#glProgram = this.#gl.createProgram();
    this.#vertexShader.linkTo(this.#glProgram);
    this.#fragmentShader.linkTo(this.#glProgram);
    // Attribute 0 should always read an array: some drivers are slow otherwise, and the world
    // programs give other attributes constant values while drawing
    this.#gl.bindAttribLocation(this.#glProgram, 0, "coordinates");
    this.#gl.linkProgram(this.#glProgram);
    if (!this.#gl.getProgramParameter(this.#glProgram, this.#gl.LINK_STATUS)) {
      const log = this.#gl.getProgramInfoLog(this.#glProgram);
      console.error(`Failed to link shader program ${this.#name}:\n${log}`);
      throw new Error(`Failed to link shader program ${this.#name}`);
    }
  }

  use() {
    this.#gl.useProgram(this.#glProgram);
  }

  /**
   * Disables everything which is specific to this shader program,
   * like attributes.
   */
  stopUsing() {}

  get gl() {
    return this.#gl;
  }

  get glProgram() {
    return this.#glProgram;
  }
}

/**
 * The spacing of the vegetation marks on screen, in pixels at the level of the tile drawn: they
 * are anchored in the world, so they stay put when panning and scale with the map within a level.
 */
export const MARK_SPACING_PX = 9;

/**
 * The world shader program is in charge of rendering the actual map.
 * Programs that lack an attribute or a uniform ignore what is bound to it.
 */
export class WorldShaderProgram extends ShaderProgram {
  #glCoordsAttrib;
  // -1 in the programs that do not use them
  #glRiverShapeAttrib;
  #glBiomeIdAttrib;
  #glSlopeAttrib;

  use() {
    super.use();
    const gl = this.gl;
    this.#glCoordsAttrib = gl.getAttribLocation(this.glProgram, "coordinates");
    gl.enableVertexAttribArray(this.#glCoordsAttrib);
    this.#glRiverShapeAttrib = gl.getAttribLocation(this.glProgram, "river_shape");
    this.#glBiomeIdAttrib = gl.getAttribLocation(this.glProgram, "biome_id");
    this.#glSlopeAttrib = gl.getAttribLocation(this.glProgram, "slope");
  }

  bindSurfaceVertexPositionBuffer(buffer) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.vertexAttribPointer(this.#glCoordsAttrib, 3, this.gl.FLOAT, false, 0, 0);
  }

  // An attribute read from a buffer, or with the same value for every vertex when buffer is null
  #bindAttribute(attrib, size, buffer, value) {
    if (attrib < 0) return;
    const gl = this.gl;
    if (buffer) {
      gl.enableVertexAttribArray(attrib);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(attrib);
      gl.vertexAttrib3f(attrib, ...value);
    }
  }

  /**
   * The river shapes of the vertices drawn next (see generation/rivers.js buildRivers), or
   * null for vertices that stay where they are, like the cells'.
   */
  bindRiverShapeBuffer(buffer) {
    this.#bindAttribute(this.#glRiverShapeAttrib, 3, buffer, [0, 0, 0]);
  }

  bindBiomeIdBuffer(buffer) {
    this.#bindAttribute(this.#glBiomeIdAttrib, 1, buffer, [0, 0, 0]);
  }

  /**
   * One biome for every vertex drawn next, in place of a biome id buffer.
   */
  setBiomeId(id) {
    this.#bindAttribute(this.#glBiomeIdAttrib, 1, null, [id, 0, 0]);
  }

  /**
   * The land slopes of the vertices drawn next (see generation/tiles.js buildTile), or null for
   * flat ground, like the rivers'.
   */
  bindSlopeBuffer(buffer) {
    this.#bindAttribute(this.#glSlopeAttrib, 2, buffer, [0, 0, 0]);
  }

  bindDebugSurfaceColorsBuffer() {
    // This is a no-op here, but is used in case of the DebugWorldShaderProgram
  }

  stopUsing() {
    const gl = this.gl;
    gl.disableVertexAttribArray(this.#glCoordsAttrib);
    for (const attrib of [this.#glRiverShapeAttrib, this.#glBiomeIdAttrib, this.#glSlopeAttrib]) {
      if (attrib >= 0) gl.disableVertexAttribArray(attrib);
    }
  }

  /**
   * Draws the view next, see view.js: its matrix, the river widths at its zoom, and its pixel
   * size for the vegetation marks.
   */
  setView(view) {
    const gl = this.gl;
    gl.uniformMatrix4fv(gl.getUniformLocation(this.glProgram, "view"), false, viewMatrix(view));
    const { line, real } = riverWidthUniform(view);
    gl.uniform4fv(gl.getUniformLocation(this.glProgram, "river_width"), line);
    gl.uniform2fv(gl.getUniformLocation(this.glProgram, "river_real"), real);
    gl.uniform1f(gl.getUniformLocation(this.glProgram, "pixel_world"), 1 / view.pixelsPerUnit);
  }

  /**
   * Draws a tile of level z next: its vegetation marks are MARK_SPACING_PX apart at that level.
   */
  setLevel(z) {
    const gl = this.gl;
    gl.uniform1f(
      gl.getUniformLocation(this.glProgram, "mark_cell"),
      MARK_SPACING_PX * pixelSize(z),
    );
  }

  /**
   * Sets the biome texture: low color, high color and mark kind of each biome.
   *
   * @param biomeTexture  the gl texture handle
   * @param maxId         the maximum id stored in the texture
   */
  setBiomesColors(biomeTexture, maxId) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, biomeTexture);
    gl.uniform1i(gl.getUniformLocation(this.glProgram, "biomes"), 0);
    gl.uniform1f(gl.getUniformLocation(this.glProgram, "max_id"), maxId);
  }
}

export class DebugWorldShaderProgram extends WorldShaderProgram {
  #glColorsAttrib;

  use() {
    super.use();
    this.#glColorsAttrib = this.gl.getAttribLocation(this.glProgram, "dbg_colors");
    this.gl.enableVertexAttribArray(this.#glColorsAttrib);
  }

  bindDebugSurfaceColorsBuffer(buffer) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.vertexAttribPointer(this.#glColorsAttrib, 3, this.gl.FLOAT, false, 0, 0);
  }

  stopUsing() {
    super.stopUsing();
    this.gl.disableVertexAttribArray(this.#glColorsAttrib);
  }
}
