/**
 * The size of a rendered map tile, in pixels on the screen.
 */
export const TILE_PIXEL_SIZE = 256;

/**
 * The spacing of the vegetation marks on screen, in pixels at the level of the tile drawn: they
 * are anchored in the world, so they stay put when panning and scale with the map within a level.
 * MARK_EDGE in map/shaders/relief.glsl is derived from it (sqrt(2) / MARK_SPACING_PX / 2) and
 * must be updated with it.
 */
export const MARK_SPACING_PX = 12;

/**
 * The maximum world coordinates in the 0/0/0 tile.
 */
export const WORLD_SIZE = 10_000;

/**
 * The zoom levels the camera can use.
 */
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 7;

/**
 * The camera position and zoom a map opens with.
 */
export const DEFAULT_VIEW = { x: 0, y: 0, z: 1 };
