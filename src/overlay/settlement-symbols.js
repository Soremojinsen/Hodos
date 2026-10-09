/**
 * The pictograms of settlements, as validated in the design: a village is three houses, a town
 * two houses by a church spire, a city houses and towers behind a crenellated wall, a capital
 * wider walls with round corner towers and a keep under a large flag. Each is a list of shapes
 * around the settlement's point, in CSS pixels with y down: a polygon (or an open line), filled
 * with the paper or the ink or not at all, outlined in ink line pixels wide (0 for none).
 */

// Points moved by (x, y) and scaled by s
const at =
  (x, y, s = 1) =>
  (points) =>
    points.map(([px, py]) => [x + px * s, y + py * s]);
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const house = (x, y, s = 1) => {
  const move = at(x, y, s);
  return [
    { points: move(rect(-2.6, -0.6, 2.6, 3)), fill: "paper", line: 0.9 },
    {
      points: move([
        [-3.3, -0.4],
        [0, -3.6],
        [3.3, -0.4],
      ]),
      fill: "ink",
      line: 0,
    },
  ];
};

// A tower h pixels tall with a pointed roof: narrow and steep for a church spire
const tower = (x, y, h, { half = 2, eave = 2.8, peak = 1 } = {}) => {
  const move = at(x, y);
  return [
    { points: move(rect(-half, 3 - h, half, 3)), fill: "paper", line: 0.9 },
    {
      points: move([
        [-eave, 3 - h],
        [0, -peak - h],
        [eave, 3 - h],
      ]),
      fill: "ink",
      line: 0,
    },
  ];
};
const spire = (x, y, h) => tower(x, y, h, { half: 1.8, eave: 2.4, peak: 4 });

const crenels = (x0, x1, y) => {
  const points = [[x0, y]];
  for (let x = x0; x < x1 - 0.5; x += 2) {
    points.push([x + 1, y], [x + 1, y - 1.2], [x + 2, y - 1.2], [x + 2, y]);
  }
  return { points, fill: null, line: 0.8, open: true };
};

const wall = (w, top = 2.5, bottom = 6) => [
  { points: rect(-w, top, w, bottom), fill: "paper", line: 1 },
  crenels(-w, w, top),
];

const roundTower = (x, top, bottom) => [
  { points: rect(x - 2.6, top, x + 2.6, bottom), fill: "paper", line: 0.9 },
  crenels(x - 2.6, x + 2.6, top),
];

const keep = (h) => [
  { points: rect(-4.2, 4 - h, 4.2, 4), fill: "paper", line: 1 },
  crenels(-4.2, 4.2, 4 - h),
  {
    points: [
      [-1.2, 4],
      [-1.2, 1],
      [-0.85, 0.15],
      [0, -0.2],
      [0.85, 0.15],
      [1.2, 1],
      [1.2, 4],
    ],
    fill: "ink",
    line: 0,
  },
  {
    points: [
      [0, 3 - h],
      [0, -6 - h],
    ],
    fill: null,
    line: 0.9,
    open: true,
  },
  {
    points: [
      [0, -6 - h],
      [6, -4.2 - h],
      [0, -2.4 - h],
    ],
    fill: "ink",
    line: 0,
  },
];

const scaled = (shapes, s) =>
  shapes.map((shape) => ({ ...shape, points: at(0, 0, s)(shape.points) }));

export const SYMBOLS = {
  village: [...house(1.2, -3.2, 0.9), ...house(-4, 1.4, 1.05), ...house(4.2, 2, 1.05)],
  town: [...house(-5, 1.5), ...spire(0, 0, 9), ...house(5, 1.5)],
  city: [
    ...wall(9),
    ...house(-5, -0.5),
    ...tower(0, -1, 11),
    ...house(5, -0.5),
    ...tower(-8, 0, 6),
    ...tower(8, 0, 6),
  ],
  capital: scaled(
    [
      ...wall(12, 2, 7),
      ...roundTower(-12, -3, 7),
      ...roundTower(12, -3, 7),
      ...house(-7.4, -0.5),
      ...house(7.4, -0.5),
      ...keep(15),
    ],
    1.15,
  ),
};

/**
 * The width of the halo under a symbol, in pixels, as the land labels' (labels.js HALO_WIDTHS).
 */
export const SYMBOL_HALO = 3.4;

/**
 * Whether a kind of label is a settlement's.
 */
export const isSettlement = (kind) => Object.hasOwn(SYMBOLS, kind);

/**
 * The box each symbol covers with its halo, from its point.
 */
export const SYMBOL_BOXES = Object.fromEntries(
  Object.entries(SYMBOLS).map(([kind, shapes]) => {
    const points = shapes.flatMap((shape) => shape.points);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const h = SYMBOL_HALO / 2;
    return [
      kind,
      {
        minX: Math.min(...xs) - h,
        minY: Math.min(...ys) - h,
        maxX: Math.max(...xs) + h,
        maxY: Math.max(...ys) + h,
      },
    ];
  }),
);

/**
 * Draws a settlement's symbol on the whole pixel nearest (x, y): first its halo (every shape
 * widened by haloWidth, closed ones filled), then each shape in its colour and its ink outline.
 *
 * @param colors {{ink: string, paper: string, halo: string, haloWidth: Number}}
 */
export function drawSymbol(context, kind, x, y, colors) {
  const shapes = SYMBOLS[kind];
  context.save();
  context.translate(Math.round(x), Math.round(y));
  context.lineJoin = "round";
  const trace = ({ points, open }) => {
    context.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? context.moveTo(px, py) : context.lineTo(px, py)));
    if (!open) context.closePath();
  };
  context.fillStyle = colors.halo;
  context.strokeStyle = colors.halo;
  context.lineWidth = colors.haloWidth;
  for (const shape of shapes) {
    trace(shape);
    if (!shape.open) context.fill();
    context.stroke();
  }
  for (const shape of shapes) {
    trace(shape);
    if (shape.fill) {
      context.fillStyle = colors[shape.fill];
      context.fill();
    }
    if (shape.line) {
      context.strokeStyle = colors.ink;
      context.lineWidth = shape.line;
      context.stroke();
    }
  }
  context.restore();
}
