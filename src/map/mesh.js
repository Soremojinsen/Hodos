import { RIVER } from "../generation/rivers.js";
import { DebugWorldShaderProgram, WorldShaderProgram } from "./shader.js";

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
  #riverIndexCount;

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
      slopes: upload(gl.ARRAY_BUFFER, data.slopes),
      indices: upload(gl.ELEMENT_ARRAY_BUFFER, data.indices),
      riverPositions: upload(gl.ARRAY_BUFFER, data.riverPositions),
      riverShapes: upload(gl.ARRAY_BUFFER, data.riverShapes),
      riverIndices: upload(gl.ELEMENT_ARRAY_BUFFER, data.riverIndices),
    };
    this.#indexCount = data.indices.length;
    this.#riverIndexCount = data.riverIndices.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // The arrays now live on the GPU
    this.#data = null;
  }

  render(shaderProgram) {
    if (!(shaderProgram instanceof WorldShaderProgram)) {
      console.error("Tile render expects a WorldShaderProgram");
      return;
    }
    const gl = shaderProgram.gl;
    const buffers = this.#buffers;
    shaderProgram.setLevel(this.#z);
    shaderProgram.bindSurfaceVertexPositionBuffer(buffers.positions);
    shaderProgram.bindDebugSurfaceColorsBuffer(buffers.debugColors);
    shaderProgram.bindBiomeIdBuffer(buffers.biomeIds);
    shaderProgram.bindSlopeBuffer(buffers.slopes);
    shaderProgram.bindRiverShapeBuffer(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    gl.drawElements(gl.TRIANGLES, this.#indexCount, gl.UNSIGNED_SHORT, 0);
    // Debug mode shows the raw cells, without the rivers drawn over them
    if (shaderProgram instanceof DebugWorldShaderProgram || this.#riverIndexCount === 0) return;
    shaderProgram.bindSurfaceVertexPositionBuffer(buffers.riverPositions);
    shaderProgram.setBiomeId(RIVER);
    shaderProgram.bindSlopeBuffer(null);
    shaderProgram.bindRiverShapeBuffer(buffers.riverShapes);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.riverIndices);
    gl.drawElements(gl.TRIANGLES, this.#riverIndexCount, gl.UNSIGNED_SHORT, 0);
  }

  destroy(gl) {
    for (const buffer of Object.values(this.#buffers)) gl.deleteBuffer(buffer);
  }
}
