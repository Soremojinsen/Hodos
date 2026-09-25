/**
 * A color as used in WebGL.
 * The coordinate space is normalized rgb (each color value is between 0 and 1).
 */
export class GlColor {
  #red;
  #green;
  #blue;

  constructor(r, g, b) {
    this.#red = r;
    this.#green = g;
    this.#blue = b;
  }

  get red() {
    return this.#red;
  }

  get green() {
    return this.#green;
  }

  get blue() {
    return this.#blue;
  }

  get components() {
    return [this.red, this.green, this.blue];
  }
}
