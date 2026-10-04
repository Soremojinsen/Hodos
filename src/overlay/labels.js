import { worldToScreen, zoomOf } from "../map/view.js";

/**
 * The typefaces of labels: IM Fell Double Pica, an old face, for the large capitals of continents,
 * oceans, seas and ranges, and Alegreya, plainer and clearer at small sizes, for the names of
 * rivers, lakes and islands.
 */
export const LABEL_FACES = { fell: "IM Fell Double Pica", alegreya: "Alegreya" };

/**
 * How each kind of label is drawn: its face (see LABEL_FACES), its font size in CSS pixels,
 * italic or not, in capitals or not, the space between letters as a share of the size, its ink,
 * the zooms it shows at, and how much wider than its feature it may be (an island's name may
 * reach over the water around it).
 */
export const LABEL_STYLES = {
  ocean: {
    face: "fell",
    size: 18,
    italic: true,
    caps: true,
    tracking: 0.3,
    ink: "water",
    zooms: [1, 3],
    overflow: 1.5,
  },
  continent: {
    face: "fell",
    size: 20,
    italic: false,
    caps: true,
    tracking: 0.3,
    ink: "land",
    zooms: [0, 4],
    overflow: 1.5,
  },
  sea: {
    face: "fell",
    size: 15,
    italic: true,
    caps: false,
    tracking: 0.15,
    ink: "water",
    zooms: [2, 5],
    overflow: 1,
  },
  range: {
    face: "fell",
    size: 13,
    italic: false,
    caps: true,
    tracking: 0.25,
    ink: "land",
    zooms: [1, 6],
    overflow: 1,
  },
  island: {
    face: "alegreya",
    size: 14,
    italic: false,
    caps: false,
    tracking: 0.05,
    ink: "land",
    zooms: [2, 7],
    overflow: 2,
  },
  lake: {
    face: "alegreya",
    size: 15,
    italic: true,
    caps: false,
    tracking: 0.05,
    ink: "water",
    zooms: [3, 7],
    overflow: 1.2,
  },
  river: {
    face: "alegreya",
    size: 14,
    italic: true,
    caps: false,
    tracking: 0.08,
    ink: "water",
    zooms: [4, 7],
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
  `${style.italic ? "italic " : ""}${style.size}px "${LABEL_FACES[style.face]}", serif`;

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
  return label.anchors.map(([x, y], index) => {
    const p = worldToScreen(view, x, y);
    return {
      key: `${label.id}#${index}`,
      center: { x: p.x, y: p.y, angle: -label.angle, width },
      glyphs: (widths, gap) => straightGlyphs(p, -label.angle, widths, gap, width),
    };
  });
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
 *            glyphs: {char: string, x: Number, y: Number, angle: Number}[],
 *            center?: {x: Number, y: Number, angle: Number, width: Number}}[]} center is a
 *            straight label's middle, screen angle and width as laid out
 */
export function placeLabels(view, labels, { text, measure, previous = new Set() }) {
  const zoom = zoomOf(view);
  const candidates = [];
  for (const label of labels) {
    const style = LABEL_STYLES[label.kind];
    if (zoom < style.zooms[0] || zoom > style.zooms[1]) continue;
    // Composed, so that each letter with its accents is one character
    const content = (style.caps ? text(label).toLocaleUpperCase() : text(label)).normalize("NFC");
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
      ...(layout.center && { center: layout.center }),
    });
  }
  return placed;
}

/**
 * A river is named once per RIVER_REPEAT_PX of its course on screen, on the stretch of it that
 * turns least, tried every RIVER_SLIDE_PX, if it turns by at most MAX_RIVER_BEND in all, and
 * RIVER_OFFSET_PX above its course so the letters stay off the water (rivers meander around
 * their course up close). The course is first smoothed of turns closer than RIVER_SMOOTHING_PX to
 * a straight line: the water mesh's jitter, which the eye does not see as bends. Each letter
 * turns as its stretch does over RIVER_TANGENT_PX either side of it, on a line drawn every
 * RIVER_LINE_STEP_PX.
 */
export const RIVER_REPEAT_PX = 300;
export const MAX_RIVER_BEND = Math.PI / 3;
export const RIVER_OFFSET_PX = 8;
export const RIVER_SMOOTHING_PX = 3;
export const RIVER_SLIDE_PX = 10;
export const RIVER_TANGENT_PX = 10;
export const RIVER_LINE_STEP_PX = 2;

// The points to keep of a line so that none left out is more than tolerance from it
// (Douglas–Peucker)
const simplify = (points, tolerance) => {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [a, b] = [points[first], points[last]];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let [far, farthest] = [-1, tolerance];
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const distance =
        length > 0
          ? Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length
          : Math.hypot(p.x - a.x, p.y - a.y);
      if (distance > farthest) [far, farthest] = [i, distance];
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([first, far], [far, last]);
  }
  return points.filter((_, i) => keep[i]);
};

// The course on screen, smoothed of the mesh's jitter, the length along it at each point and how
// much it has turned by each point, in radians
const screenPath = (view, path) => {
  const drawn = [];
  for (let i = 0; i < path.length; i += 2) drawn.push(worldToScreen(view, path[i], path[i + 1]));
  const points = drawn.length > 2 ? simplify(drawn, RIVER_SMOOTHING_PX) : drawn;
  const lengths = [0];
  const turned = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    const turn = c ? Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x) : 0;
    turned.push(turned[i - 1] + Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))));
  }
  return { points, lengths, turned };
};

// The last point at or before a length along the course
const pointBefore = (lengths, s) => {
  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (lengths[mid] <= s) low = mid;
    else high = mid;
  }
  return lengths[high] <= s ? high : low;
};

// The point at a length along the course, and the course's direction there
const pointAt = ({ points, lengths }, s) => {
  const low = Math.min(pointBefore(lengths, s), lengths.length - 2);
  const high = low + 1;
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
const bendWithin = ({ lengths, turned }, start, end) => {
  // The points strictly between start and end are first + 1 to last
  const first = pointBefore(lengths, start);
  let last = pointBefore(lengths, end);
  if (lengths[last] >= end) last--;
  return last > first ? turned[last] - turned[first] : 0;
};

// A line's direction at a length along it, over RIVER_TANGENT_PX either side within low to high
const directionAt = (line, s, low, high) => {
  const [a, b] = [
    pointAt(line, Math.max(s - RIVER_TANGENT_PX, low)),
    pointAt(line, Math.min(s + RIVER_TANGENT_PX, high)),
  ];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return [(b.x - a.x) / length, (b.y - a.y) / length];
};

// The letters of a stretch of the course from start, reading left to right
const pathGlyphs = (course, start, widths, gap, total) => {
  const end = start + total;
  const sign = pointAt(course, end).x < pointAt(course, start).x ? -1 : 1;
  // The line the letters sit on, in reading order: RIVER_OFFSET_PX above the stretch, on its
  // left on a screen whose y grows downwards, and straight on past its ends. Letters are spaced
  // along it, so they neither part nor bunch where it bends, and only the stretch turns them.
  const half = Math.ceil((total / 2 + RIVER_OFFSET_PX + RIVER_TANGENT_PX) / RIVER_LINE_STEP_PX);
  const line = { points: [], lengths: [] };
  for (let j = -half; j <= half; j++) {
    const s = start + total / 2 + sign * j * RIVER_LINE_STEP_PX;
    const on = Math.min(Math.max(s, start), end);
    const p = pointAt(course, on);
    const [dx, dy] = directionAt(course, on, start, end);
    const point = {
      x: p.x + (s - on) * dx + sign * dy * RIVER_OFFSET_PX,
      y: p.y + (s - on) * dy - sign * dx * RIVER_OFFSET_PX,
    };
    const last = line.points.at(-1);
    line.lengths.push(
      last ? line.lengths.at(-1) + Math.hypot(point.x - last.x, point.y - last.y) : 0,
    );
    line.points.push(point);
  }
  // Centred where the stretch's middle is
  const glyphs = [];
  let s = line.lengths[half] - total / 2;
  for (const width of widths) {
    const p = pointAt(line, s + width / 2);
    const [dx, dy] = directionAt(line, s + width / 2, 0, line.lengths.at(-1));
    glyphs.push({ x: p.x, y: p.y, angle: Math.atan2(dy, dx) });
    s += width + gap;
  }
  return glyphs;
};

// The world box around each course, computed once
const courseBoxes = new WeakMap();

// Whether a course comes near enough a view for its name to show there
const nearView = (view, path) => {
  let box = courseBoxes.get(path);
  if (!box) {
    box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let i = 0; i < path.length; i += 2) {
      box.minX = Math.min(box.minX, path[i]);
      box.maxX = Math.max(box.maxX, path[i]);
      box.minY = Math.min(box.minY, path[i + 1]);
      box.maxY = Math.max(box.maxY, path[i + 1]);
    }
    courseBoxes.set(path, box);
  }
  // The letters sit RIVER_OFFSET_PX off the course, and are at most as tall as they are wide
  const margin = (RIVER_OFFSET_PX + 2 * LABEL_STYLES.river.size) / view.pixelsPerUnit;
  const [halfWidth, halfHeight] = [view.width, view.height].map(
    (side) => side / 2 / view.pixelsPerUnit + margin,
  );
  return (
    box.minX < view.centerX + halfWidth &&
    box.maxX > view.centerX - halfWidth &&
    box.minY < view.centerY + halfHeight &&
    box.maxY > view.centerY - halfHeight
  );
};

// Where a river's name may go: in each RIVER_REPEAT_PX of its course, the straightest stretch,
// if straight enough
function riverLayouts(view, label, width) {
  if (!nearView(view, label.path)) return [];
  const course = screenPath(view, label.path);
  const total = course.lengths.at(-1);
  if (total < width) return [];
  const layouts = [];
  const count = Math.max(1, Math.floor(total / RIVER_REPEAT_PX));
  for (let k = 0; k < count; k++) {
    const [low, high] = [k * RIVER_REPEAT_PX, k + 1 < count ? (k + 1) * RIVER_REPEAT_PX : total];
    if (high - low < width) continue;
    // From the middle of the stretch outwards, so a straight course is named at the middle, and
    // repeated names stay at least half RIVER_REPEAT_PX apart
    const centred = (low + high - width) / 2;
    const reach = Math.min((high - low - width) / 2, count > 1 ? RIVER_REPEAT_PX / 4 : Infinity);
    const bendAt = (s) => bendWithin(course, s, s + width);
    let [start, bend] = [centred, bendAt(centred)];
    for (let shift = RIVER_SLIDE_PX; shift <= reach; shift += RIVER_SLIDE_PX) {
      for (const s of [centred - shift, centred + shift]) {
        const b = bendAt(s);
        if (b < bend) [start, bend] = [s, b];
      }
    }
    if (bend > MAX_RIVER_BEND) continue;
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
export const HALO_WIDTH = 4;

// A point moved onto the nearest whole device pixel, under a context's scale and translation
const snapped = (context, x, y) => {
  const m = context.getTransform?.();
  if (!m || m.b !== 0 || m.c !== 0 || m.a === 0 || m.d === 0) return [Math.round(x), Math.round(y)];
  return [(Math.round(x * m.a + m.e) - m.e) / m.a, (Math.round(y * m.d + m.f) - m.f) / m.d];
};

// A straight label as one string over its halo: the font's kerning holds, and its baseline and
// left end sit on whole pixels, so the letters are not smeared across two. It starts where
// placeLabels laid its first letter out: kerning only makes the whole string narrower than its
// letters' widths summed, so it stays within the boxes they were placed by.
const drawWhole = (context, { text, center, style }) => {
  const gap = style.tracking * style.size;
  const { width } = center;
  context.save();
  context.letterSpacing = "0px";
  context.textAlign = "left";
  context.textBaseline = "middle";
  const metrics = context.measureText(text);
  // How far below the label's middle its baseline is: drawn from the baseline, on a whole pixel
  let down = 0;
  if (typeof metrics.alphabeticBaseline === "number") {
    down = -metrics.alphabeticBaseline;
    context.textBaseline = "alphabetic";
  }
  context.letterSpacing = `${gap}px`;
  let [x, y] = [center.x - width / 2, center.y + down];
  if (center.angle !== 0) {
    context.translate(...snapped(context, center.x, center.y));
    context.rotate(center.angle);
    [x, y] = [-width / 2, down];
  }
  [x, y] = snapped(context, x, y);
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
  context.restore();
};

// A label letter by letter, each turned as its stretch of the line
const drawGlyphs = (context, glyphs) => {
  if ("letterSpacing" in context) context.letterSpacing = "0px";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const glyph of glyphs) {
    context.save();
    context.translate(glyph.x, glyph.y);
    context.rotate(glyph.angle);
    context.strokeText(glyph.char, 0, 0);
    context.fillText(glyph.char, 0, 0);
    context.restore();
  }
};

/**
 * Draws placed labels, each over its halo: a straight label as one string on whole pixels, a
 * river's letter by letter along its course (and every label so, where canvas text has no
 * letterSpacing).
 *
 * @param placed see placeLabels
 * @param mode   "default", "biomes" or "debug" (draws nothing)
 */
export function drawLabels(context, placed, mode) {
  const inks = INKS[mode];
  if (!inks) return;
  const whole = "letterSpacing" in context;
  context.save();
  context.lineJoin = "round";
  context.lineWidth = HALO_WIDTH;
  context.strokeStyle = inks.halo;
  for (const label of placed) {
    context.font = fontOf(label.style);
    context.fillStyle = inks[label.style.ink];
    if (whole && label.center) drawWhole(context, label);
    else drawGlyphs(context, label.glyphs);
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
