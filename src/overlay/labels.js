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

// Rivers come in Task 10: until then they have no place
function riverLayouts() {
  return [];
}
