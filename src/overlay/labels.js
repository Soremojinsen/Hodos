import { worldToScreen, zoomOf } from "../map/view.js";

/**
 * How each kind of label is drawn: its font size in CSS pixels, italic or not, in capitals or
 * not, the space between letters as a share of the size, its ink, the zooms it shows at, and how
 * much wider than its feature it may be (an island's name may reach over the water around it).
 */
export const LABEL_STYLES = {
  ocean: {
    size: 22,
    italic: true,
    caps: true,
    tracking: 0.4,
    ink: "water",
    zooms: [0, 3],
    overflow: 1,
  },
  continent: {
    size: 20,
    italic: false,
    caps: true,
    tracking: 0.3,
    ink: "land",
    zooms: [0, 4],
    overflow: 1,
  },
  sea: {
    size: 15,
    italic: true,
    caps: false,
    tracking: 0.15,
    ink: "water",
    zooms: [1, 5],
    overflow: 1,
  },
  range: {
    size: 13,
    italic: false,
    caps: true,
    tracking: 0.25,
    ink: "land",
    zooms: [1, 6],
    overflow: 1,
  },
  island: {
    size: 13,
    italic: false,
    caps: false,
    tracking: 0.05,
    ink: "land",
    zooms: [2, 7],
    overflow: 2,
  },
  lake: {
    size: 12,
    italic: true,
    caps: false,
    tracking: 0.05,
    ink: "water",
    zooms: [3, 7],
    overflow: 1.2,
  },
  river: {
    size: 11,
    italic: true,
    caps: false,
    tracking: 0.05,
    ink: "water",
    zooms: [2, 7],
    overflow: 1,
  },
};

/**
 * A feature larger than MAX_SPAN_VIEWPORTS times the view loses its label: zoomed in that far,
 * its seas, ranges and rivers say more.
 */
export const MAX_SPAN_VIEWPORTS = 1.5;

/**
 * Labels placed in the last frame rank PREVIOUS_BONUS higher, less than a kind's 1000, so that
 * panning does not make labels of a kind swap places.
 */
export const PREVIOUS_BONUS = 500;

/**
 * The room kept around each letter, in pixels.
 */
export const BOX_PADDING = 2;

export const fontOf = (style) =>
  `${style.italic ? "italic " : ""}${style.size}px "IM Fell Double Pica", serif`;

// The letters of a straight label centred on p, along a screen angle
const straightGlyphs = (p, angle, widths, gap, total) => {
  const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
  const glyphs = [];
  let s = -total / 2;
  for (const width of widths) {
    const c = s + width / 2;
    glyphs.push({ x: p.x + ux * c, y: p.y + uy * c, angle });
    s += width + gap;
  }
  return glyphs;
};

// Where a straight label of a feature may go: one place per anchor
function areaLayouts(view, label, style, width) {
  const spanPx = label.span * view.pixelsPerUnit;
  if (width > spanPx * style.overflow) return [];
  if (spanPx > MAX_SPAN_VIEWPORTS * Math.max(view.width, view.height)) return [];
  // World angles go counter-clockwise with y up, screen angles clockwise with y down
  return label.anchors.map(([x, y], index) => ({
    key: `${label.id}#${index}`,
    glyphs: (widths, gap) =>
      straightGlyphs(worldToScreen(view, x, y), -label.angle, widths, gap, width),
  }));
}

// The box a letter covers, half the gap either side, turned by its angle
const glyphBox = (glyph, width, gap, size) => {
  const [hw, hh] = [(width + gap) / 2 + BOX_PADDING, size * 0.6 + BOX_PADDING];
  const [c, s] = [Math.abs(Math.cos(glyph.angle)), Math.abs(Math.sin(glyph.angle))];
  const [w, h] = [c * hw + s * hh, s * hw + c * hh];
  return { minX: glyph.x - w, minY: glyph.y - h, maxX: glyph.x + w, maxY: glyph.y + h };
};

const overlaps = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * The labels that show in a view, and where each letter goes. Labels whose kind shows at the
 * view's zoom and that fit their feature are placed by rank (priority, plus PREVIOUS_BONUS for
 * those placed last frame), each left out if a letter would overlap a letter placed before.
 *
 * @param view    see map/view.js, in CSS pixels
 * @param labels  see generation/labels.js buildAtlas
 * @param options {{text: function(label): string, measure: function(string, string): Number,
 *                previous: Set<string>}} measure gives a text's width in a CSS font; previous
 *                holds the keys placed last frame
 * @returns {{key: string, label: Object, style: Object, text: string,
 *            glyphs: {char: string, x: Number, y: Number, angle: Number}[]}[]}
 */
export function placeLabels(view, labels, { text, measure, previous = new Set() }) {
  const zoom = zoomOf(view);
  const candidates = [];
  for (const label of labels) {
    const style = LABEL_STYLES[label.kind];
    if (zoom < style.zooms[0] || zoom > style.zooms[1]) continue;
    const content = style.caps ? text(label).toLocaleUpperCase() : text(label);
    const chars = [...content];
    const font = fontOf(style);
    const widths = chars.map((char) => measure(char, font));
    const gap = style.tracking * style.size;
    const width = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
    const layouts =
      label.kind === "river"
        ? riverLayouts(view, label, width)
        : areaLayouts(view, label, style, width);
    for (const layout of layouts) {
      const rank = label.priority + (previous.has(layout.key) ? PREVIOUS_BONUS : 0);
      candidates.push({ layout, label, style, content, chars, widths, gap, rank });
    }
  }
  candidates.sort(
    (a, b) =>
      b.rank - a.rank || (a.layout.key < b.layout.key ? -1 : a.layout.key > b.layout.key ? 1 : 0),
  );
  const screen = { minX: 0, minY: 0, maxX: view.width, maxY: view.height };
  const boxes = [];
  const placed = [];
  for (const { layout, label, style, content, chars, widths, gap } of candidates) {
    const glyphs = layout.glyphs(widths, gap);
    const own = glyphs.map((glyph, i) => glyphBox(glyph, widths[i], gap, style.size));
    if (!own.some((box) => overlaps(box, screen))) continue;
    if (own.some((box) => boxes.some((other) => overlaps(box, other)))) continue;
    boxes.push(...own);
    placed.push({
      key: layout.key,
      label,
      style,
      text: content,
      glyphs: glyphs.map((glyph, i) => ({ ...glyph, char: chars[i] })),
    });
  }
  return placed;
}

/**
 * A river is named once per RIVER_REPEAT_PX of its course on screen, on stretches that turn by
 * at most MAX_RIVER_BEND in all, RIVER_OFFSET_PX above its course so the letters stay off the
 * water (rivers meander around their course up close).
 */
export const RIVER_REPEAT_PX = 400;
export const MAX_RIVER_BEND = Math.PI / 4;
export const RIVER_OFFSET_PX = 8;

// The course on screen, and the length along it at each point
const screenPath = (view, path) => {
  const points = [];
  const lengths = [];
  for (let i = 0; i < path.length; i += 2) {
    const p = worldToScreen(view, path[i], path[i + 1]);
    const last = points.at(-1);
    lengths.push(last ? lengths.at(-1) + Math.hypot(p.x - last.x, p.y - last.y) : 0);
    points.push(p);
  }
  return { points, lengths };
};

// The point at a length along the course, and the course's direction there
const pointAt = ({ points, lengths }, s) => {
  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (lengths[mid] <= s) low = mid;
    else high = mid;
  }
  const [a, b] = [points[low], points[high]];
  const length = lengths[high] - lengths[low] || 1;
  const t = Math.min(Math.max((s - lengths[low]) / length, 0), 1);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    dx: (b.x - a.x) / length,
    dy: (b.y - a.y) / length,
  };
};

// How much the course turns between two lengths along it, in radians
const bendWithin = ({ points, lengths }, start, end) => {
  let bend = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    if (lengths[i] <= start || lengths[i] >= end) continue;
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const turn = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    bend += Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
  }
  return bend;
};

// The letters of a stretch of the course from start, reading left to right
const pathGlyphs = (course, start, widths, gap, total) => {
  const [a, b] = [pointAt(course, start), pointAt(course, start + total)];
  const reverse = b.x < a.x;
  const glyphs = [];
  let s = 0;
  for (const width of widths) {
    const centre = reverse ? start + total - (s + width / 2) : start + s + width / 2;
    const p = pointAt(course, centre);
    const [tx, ty] = reverse ? [-p.dx, -p.dy] : [p.dx, p.dy];
    // Above the reading direction: its left on a screen whose y grows downwards
    glyphs.push({
      x: p.x + ty * RIVER_OFFSET_PX,
      y: p.y - tx * RIVER_OFFSET_PX,
      angle: Math.atan2(ty, tx),
    });
    s += width + gap;
  }
  return glyphs;
};

// Where a river's name may go: the stretches of its course that are straight enough
function riverLayouts(view, label, width) {
  const course = screenPath(view, label.path);
  const total = course.lengths.at(-1);
  if (total < width) return [];
  const layouts = [];
  const count = Math.max(1, Math.floor(total / RIVER_REPEAT_PX));
  for (let k = 0; k < count; k++) {
    const centre = total < RIVER_REPEAT_PX ? total / 2 : (k + 0.5) * RIVER_REPEAT_PX;
    const start = centre - width / 2;
    if (start < 0 || start + width > total) continue;
    if (bendWithin(course, start, start + width) > MAX_RIVER_BEND) continue;
    layouts.push({
      key: `${label.id}@${k}`,
      glyphs: (widths, gap) => pathGlyphs(course, start, widths, gap, width),
    });
  }
  return layouts;
}

/**
 * The inks of each rendering mode: land and water labels, and the halo that keeps them legible
 * over the map. Debug mode has no labels.
 */
export const INKS = {
  default: { land: "rgb(52, 38, 26)", water: "rgb(54, 76, 98)", halo: "rgba(240, 228, 200, 0.85)" },
  biomes: { land: "rgb(20, 20, 20)", water: "rgb(20, 40, 90)", halo: "rgba(255, 255, 255, 0.85)" },
};
export const HALO_WIDTH = 3;

/**
 * Draws placed labels, letter by letter, each over its halo.
 *
 * @param placed see placeLabels
 * @param mode   "default", "biomes" or "debug" (draws nothing)
 */
export function drawLabels(context, placed, mode) {
  const inks = INKS[mode];
  if (!inks) return;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = HALO_WIDTH;
  context.strokeStyle = inks.halo;
  for (const { style, glyphs } of placed) {
    context.font = fontOf(style);
    context.fillStyle = inks[style.ink];
    for (const glyph of glyphs) {
      context.save();
      context.translate(glyph.x, glyph.y);
      context.rotate(glyph.angle);
      context.strokeText(glyph.char, 0, 0);
      context.fillText(glyph.char, 0, 0);
      context.restore();
    }
  }
  context.restore();
}

/**
 * How much larger than on screen labels are drawn in an image: as the grid's lines, see
 * export/export.js gridLineWidth, one more CSS pixel per 1024 pixels of the longest side.
 */
export const labelScale = (width, height) => Math.max(1, Math.max(width, height) / 1024);

/**
 * Places the labels of a view as a screen scale times smaller would, then draws them scale times
 * larger: an export shows the labels the screen would, not tiny ones.
 *
 * @returns see placeLabels, in the smaller view's pixels
 */
export function layoutAndDraw(context, view, labels, { mode, text, measure, previous, scale = 1 }) {
  const layoutView = {
    ...view,
    width: view.width / scale,
    height: view.height / scale,
    pixelsPerUnit: view.pixelsPerUnit / scale,
  };
  const placed = placeLabels(layoutView, labels, { text, measure, previous });
  context.save();
  context.scale(scale, scale);
  drawLabels(context, placed, mode);
  context.restore();
  return placed;
}
