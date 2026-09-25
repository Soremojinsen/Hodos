import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, WORLD_SIZE } from "../constants.js";

/**
 * The state a link carries: the map seed, the camera, the rendering mode and the grid.
 * The parameter names (seed, x, y, z, mode, grid, gs, go) are public: links are shared, so they
 * must keep working. Change them only in a backward-compatible way.
 */

export const MAX_SEED_LENGTH = 200;
export const MODES = ["default", "biomes", "debug"];
export const GRID_TYPES = ["none", "square", "hex"];
export const GRID_SIZE = { min: 100, max: 1000, step: 50, default: 250 };
export const GRID_OPACITY = { min: 10, max: 100, default: 40 };
export const DEFAULT_GRID = {
  type: "none",
  size: GRID_SIZE.default,
  opacity: GRID_OPACITY.default,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// An absent or blank parameter is not a number, rather than 0
const number = (text) => (text === null || text.trim() === "" ? NaN : Number(text));

export const isValidSeed = (seed) =>
  typeof seed === "string" && seed.length > 0 && seed.length <= MAX_SEED_LENGTH;

/**
 * Makes grid settings valid: unknown types mean no grid, sizes snap to their step, numbers are
 * clamped, and missing numbers get their default.
 */
export const normalizeGrid = ({ type, size, opacity }) => ({
  type: GRID_TYPES.includes(type) ? type : "none",
  size: Number.isFinite(size)
    ? clamp(Math.round(size / GRID_SIZE.step) * GRID_SIZE.step, GRID_SIZE.min, GRID_SIZE.max)
    : GRID_SIZE.default,
  opacity: Number.isFinite(opacity)
    ? clamp(Math.round(opacity), GRID_OPACITY.min, GRID_OPACITY.max)
    : GRID_OPACITY.default,
});

/**
 * Reads the state from a URL query string. Invalid values fall back to their default.
 *
 * @param search {string} e.g. location.search
 * @returns {{seed: string|null, x: Number, y: Number, z: Number, mode: string, grid: Object}}
 */
export function parseState(search) {
  const params = new URLSearchParams(search);
  const seed = params.get("seed");
  const x = number(params.get("x"));
  const y = number(params.get("y"));
  const z = number(params.get("z"));
  const half = WORLD_SIZE / 2;
  return {
    seed: isValidSeed(seed) ? seed : null,
    x: Number.isFinite(x) ? clamp(x, -half, half) : DEFAULT_VIEW.x,
    y: Number.isFinite(y) ? clamp(y, -half, half) : DEFAULT_VIEW.y,
    z: Number.isFinite(z) ? clamp(z, MIN_ZOOM, MAX_ZOOM) : DEFAULT_VIEW.z,
    mode: MODES.includes(params.get("mode")) ? params.get("mode") : "default",
    grid: normalizeGrid({
      type: params.get("grid"),
      size: number(params.get("gs")),
      opacity: number(params.get("go")),
    }),
  };
}

/**
 * Writes the state as a URL query string, leaving out default values.
 */
export function serializeState(state) {
  const params = new URLSearchParams();
  params.set("seed", state.seed);
  const x = Math.round(state.x);
  const y = Math.round(state.y);
  const z = Math.round(state.z * 100) / 100;
  if (x !== DEFAULT_VIEW.x) params.set("x", x);
  if (y !== DEFAULT_VIEW.y) params.set("y", y);
  if (z !== DEFAULT_VIEW.z) params.set("z", z);
  if (state.mode !== "default") params.set("mode", state.mode);
  if (state.grid.type !== "none") {
    params.set("grid", state.grid.type);
    if (state.grid.size !== GRID_SIZE.default) params.set("gs", state.grid.size);
    if (state.grid.opacity !== GRID_OPACITY.default) params.set("go", state.grid.opacity);
  }
  return `?${params}`;
}
