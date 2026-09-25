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
 * The world shader program is in charge of rendering the actual map.
 */
export class WorldShaderProgram extends ShaderProgram {
  #glCoordsAttrib;

  use() {
    super.use();
    this.#glCoordsAttrib = this.gl.getAttribLocation(this.glProgram, "coordinates");
    this.gl.enableVertexAttribArray(this.#glCoordsAttrib);
  }

  bindSurfaceVertexPositionBuffer(buffer) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.vertexAttribPointer(this.#glCoordsAttrib, 3, this.gl.FLOAT, false, 0, 0);
  }

  bindBiomeIdBuffer() {
    // This is a no-op here, but is used in case of the BiomesWorldShaderProgram
  }

  bindDebugSurfaceColorsBuffer() {
    // This is a no-op here, but is used in case of the DebugWorldShaderProgram
  }

  stopUsing() {
    this.gl.disableVertexAttribArray(this.#glCoordsAttrib);
  }

  setViewMatrix(matrix) {
    let pointer = this.gl.getUniformLocation(this.glProgram, "view");
    this.gl.uniformMatrix4fv(pointer, false, matrix);
  }

  /**
   * Sets the biome color sampling texture.
   *
   * @param biomeTexture  the gl texture handle
   * @param maxId         the maximum id stored in the texture
   */
  setBiomesColors() {
    // This is a no-op here, but is used in case of the DebugWorldShaderProgram
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

export class BiomesWorldShaderProgram extends WorldShaderProgram {
  #glBiomeIdAttrib;

  use() {
    super.use();
    this.#glBiomeIdAttrib = this.gl.getAttribLocation(this.glProgram, "biome_id");
    this.gl.enableVertexAttribArray(this.#glBiomeIdAttrib);
  }

  bindBiomeIdBuffer(buffer) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.vertexAttribPointer(this.#glBiomeIdAttrib, 1, this.gl.FLOAT, false, 0, 0);
  }

  /**
   * Sets the biome color sampling texture.
   *
   * @param biomeTexture  the gl texture handle
   * @param maxId         the maximum id stored in the texture
   */
  setBiomesColors(biomeTexture, maxId) {
    let textureUnit = 0; // from 0 to 15 is ok
    let pointer = this.gl.getUniformLocation(this.glProgram, "biomes");
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, biomeTexture);
    this.gl.uniform1i(pointer, textureUnit);
    pointer = this.gl.getUniformLocation(this.glProgram, "max_id");
    this.gl.uniform1f(pointer, maxId);
  }

  stopUsing() {
    super.stopUsing();
    this.gl.disableVertexAttribArray(this.#glBiomeIdAttrib);
  }
}
