import { labelText } from "./label-text.js";
import { LABEL_FACES, labelAt, labelLayout, labelScale, layoutAndDraw } from "./labels.js";

/**
 * How long labels wait for their faces (see labels.js LABEL_FACES), in milliseconds, before
 * using the fallback serif.
 */
export const FONT_TIMEOUT = 3000;

/**
 * The place names over the map, drawn by the overlay after each frame (see overlay.js).
 */
export class LabelLayer {
  #worldMap;
  #enabled = true;
  #ready = false;
  #placed = [];
  #widths = new Map();
  #selected = null;
  #scratch = null;

  constructor(worldMap) {
    this.#worldMap = worldMap;
    const faces = Promise.all(
      Object.values(LABEL_FACES).flatMap((family) =>
        ["16px", "italic 16px"].map((font) => document.fonts.load(`${font} "${family}"`)),
      ),
    );
    // A face that arrives late, after the timeout, changes the widths measured meanwhile
    document.fonts.addEventListener("loadingdone", () => {
      this.#widths.clear();
      worldMap.renderer.requestRender();
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT));
    Promise.race([faces, timeout])
      .catch(() => {})
      .then(() => {
        this.#ready = true;
        // Widths measured with the fallback font no longer hold
        this.#widths.clear();
        worldMap.renderer.requestRender();
      });
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(enabled) {
    this.#enabled = enabled;
    this.#worldMap.renderer.requestRender();
  }

  /**
   * The id of the label selected in the names panel, placed first and over an accent, or null.
   * Never in exports.
   */
  get selected() {
    return this.#selected;
  }

  set selected(id) {
    this.#selected = id;
    this.#worldMap.renderer.requestRender();
  }

  /**
   * A label's width in CSS pixels, as placeLabels lays it out.
   */
  textWidth(label) {
    this.#scratch ??= document.createElement("canvas").getContext("2d");
    const measure = (text, font) => this.#measure(this.#scratch, text, font);
    return labelLayout(label, labelText, measure).width;
  }

  /**
   * The label drawn at a point of the map, in CSS pixels, or null.
   */
  labelAt(x, y) {
    return labelAt(this.#placed, x, y);
  }

  /**
   * The labels placed on the last frame, see labels.js placeLabels.
   */
  get placed() {
    return this.#placed;
  }

  // A text's width in a font, measured once
  #measure(context, text, font) {
    const key = `${font}|${text}`;
    let width = this.#widths.get(key);
    if (width === undefined) {
      context.font = font;
      width = context.measureText(text).width;
      this.#widths.set(key, width);
    }
    return width;
  }

  #options(context, mode, previous, scale, selected = null) {
    return {
      selected,
      mode,
      text: labelText,
      measure: (text, font) => this.#measure(context, text, font),
      previous,
      scale,
    };
  }

  /**
   * Draws the labels of the screen's view, keeping those of the last frame in place.
   */
  draw(context, view) {
    const labels = this.#worldMap.labels;
    const mode = this.#worldMap.renderer.renderingMode;
    if (!this.#enabled || !this.#ready || labels.length === 0 || mode === "debug") {
      this.#placed = [];
      return;
    }
    const previous = new Set(this.#placed.map((p) => p.key));
    this.#placed = layoutAndDraw(
      context,
      view,
      labels,
      this.#options(context, mode, previous, 1, this.#selected),
    );
  }

  /**
   * Draws the labels of an export's view at its scale, see labels.js layoutAndDraw.
   *
   * @param context {CanvasRenderingContext2D}
   * @param view    see map/view.js
   * @param mode    {string} the rendering mode
   * @param scale   {number} the label scale: the export's factor over the screen for a view of the
   *                screen, so the labels match the screen's, sharper. Defaults to labelScale.
   */
  drawExport(context, view, mode, scale = labelScale(view.width, view.height)) {
    const labels = this.#worldMap.labels;
    if (labels.length === 0 || mode === "debug") return;
    layoutAndDraw(context, view, labels, this.#options(context, mode, new Set(), scale));
  }
}
