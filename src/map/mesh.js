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
  #markTexture;
  #markOrigin;
  #markSize;

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
    this.#markTexture = uploadMarkSquares(gl, data.markBlocked, data.markSize);
    this.#markOrigin = data.markOrigin;
    this.#markSize = data.markSize;
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
    shaderProgram.setMarkSquares(this.#markTexture, this.#markOrigin, this.#markSize);
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
    gl.deleteTexture(this.#markTexture);
  }
}

/**
 * A texture of a tile's mark squares that rivers cover, a texel per square, see
 * generation/rivers.js riverSquares. It is bound to texture unit 1 when drawing, see
 * WorldShaderProgram.setMarkSquares; unit 0 stays active.
 */
function uploadMarkSquares(gl, blocked, [columns, rows]) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Rows of single bytes, not padded to 4
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    columns,
    rows,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    blocked,
  );
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
  return texture;
}
