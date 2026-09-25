/**
 * Turns pixels read with gl.readPixels (bottom row first) into image data order (top row first),
 * fully opaque.
 *
 * @param pixels {Uint8Array} RGBA
 * @returns {Uint8ClampedArray}
 */
export function flipRows(pixels, width, height) {
  const rowLength = width * 4;
  const flipped = new Uint8ClampedArray(pixels.length);
  for (let row = 0; row < height; row++) {
    const from = (height - 1 - row) * rowLength;
    flipped.set(pixels.subarray(from, from + rowLength), row * rowLength);
  }
  for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
  return flipped;
}
