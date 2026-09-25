import { WorldShaderProgram } from "./shader.js";

/**
 * A mesh is a collection of points that gets renders into the canvas.
 */
export class Mesh {
  /**
   * Creates the WebGL objects needed to render this mesh.
   * This method needs to be implemented in a subclass, which receives the WebGL context.
   */
  bake() {
    throw new Error("Unimplemented Mesh bake method");
  }

  /**
   * Draws this tile using the given gl context and shader program.
   * This method needs to be implemented in a subclass, which receives the shader program to draw with.
   */
  render() {
    throw new Error("Unimplemented Mesh render method");
  }

  /**
   * Frees all resources held by this mesh.
   */
  destroy() {}
}

export class Tile extends Mesh {
  #z;
  #x;
  #y;
  #data;
  #buffers;
  #indexCount;

  /**
   * @param data see generation/tiles.js buildTile: z, x, y and the typed arrays to draw
   */
  constructor(data) {
    super();
    this.#z = data.z;
    this.#x = data.x;
    this.#y = data.y;
    this.#data = data;
  }

  get z() {
    return this.#z;
  }

  get x() {
    return this.#x;
  }

  get y() {
    return this.#y;
  }

  bake(gl) {
    const upload = (target, array) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, array, gl.STATIC_DRAW);
      return buffer;
    };
    const data = this.#data;
    this.#buffers = {
      positions: upload(gl.ARRAY_BUFFER, data.positions),
      debugColors: upload(gl.ARRAY_BUFFER, data.debugColors),
      biomeIds: upload(gl.ARRAY_BUFFER, data.biomeIds),
      indices: upload(gl.ELEMENT_ARRAY_BUFFER, data.indices),
    };
    this.#indexCount = data.indices.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // The arrays now live on the GPU
    this.#data = null;
  }

  render(shaderProgram) {
    if (shaderProgram instanceof WorldShaderProgram) {
      let gl = shaderProgram.gl;
      shaderProgram.bindSurfaceVertexPositionBuffer(this.#buffers.positions);
      shaderProgram.bindDebugSurfaceColorsBuffer(this.#buffers.debugColors);
      shaderProgram.bindBiomeIdBuffer(this.#buffers.biomeIds);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#buffers.indices);
      gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_SHORT, 0);
    } else {
      console.error("Tile render expects a WorldShaderProgram");
    }
  }

  destroy(gl) {
    for (const buffer of Object.values(this.#buffers)) gl.deleteBuffer(buffer);
  }
}
