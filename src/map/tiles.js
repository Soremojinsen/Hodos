import { tileKey } from "./tile-grid.js";

/**
 * How many tiles the worker may be building at once. Few, so a zoom or pan quickly takes over.
 */
export const MAX_TILE_REQUESTS = 2;

/**
 * How many baked tiles are kept beyond the ones in use (about 0.25 MB of GPU memory each).
 */
export const TILE_CACHE_SIZE = 128;

const keyOf = ({ z, x, y }) => tileKey(z, x, y);

const tileOf = (key) => {
  const [z, x, y] = key.split("/").map(Number);
  return { z, x, y };
};

/**
 * Decides which tiles to build, keeps the baked ones, and says what to draw while some are
 * missing. It knows nothing of workers or WebGL: they come in as functions.
 */
export class TileManager {
  #request;
  #bake;
  #destroy;
  #onChange;
  #maxInFlight;
  #cacheSize;
  // Baked tiles by key, least recently used first
  #ready = new Map();
  #inFlight = new Set();
  // Tiles that failed while wanted: not requested again until they stop being wanted
  #failed = new Set();
  #wanted = [];
  // Pin counts of the tiles ensure() holds
  #pins = new Map();
  // ensure() calls waiting for their tiles: {keys, resolve, reject}
  #waiters = [];

  /**
   * @param request     {function({z, x, y})} starts building a tile
   * @param bake        {function(data)} turns built data (with z, x, y) into a drawable tile
   * @param destroy     {function(baked)} frees a drawable tile
   * @param onChange    {function()} called when a tile arrives or fails
   */
  constructor({
    request,
    bake,
    destroy,
    onChange,
    maxInFlight = MAX_TILE_REQUESTS,
    cacheSize = TILE_CACHE_SIZE,
  }) {
    this.#request = request;
    this.#bake = bake;
    this.#destroy = destroy;
    this.#onChange = onChange;
    this.#maxInFlight = maxInFlight;
    this.#cacheSize = cacheSize;
  }

  /**
   * Sets the tiles the camera wants, most important first. Tiles no longer wanted are not
   * requested anymore; those already requested are still kept when they arrive.
   */
  want(tiles) {
    this.#wanted = tiles.map(keyOf);
    const wanted = new Set(this.#wanted);
    for (const key of this.#failed) {
      if (!wanted.has(key) && !this.#pins.has(key)) this.#failed.delete(key);
    }
    this.#pump();
  }

  /**
   * Waits until every tile is ready, requesting them before the camera's tiles.
   * The tiles are kept until the returned release function is called.
   *
   * @returns {Promise<function()>} rejects, releasing the tiles, if one fails
   */
  ensure(tiles) {
    const keys = tiles.map(keyOf);
    for (const key of keys) {
      this.#pins.set(key, (this.#pins.get(key) ?? 0) + 1);
      this.#failed.delete(key);
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const key of keys) {
        const count = this.#pins.get(key) - 1;
        if (count > 0) this.#pins.set(key, count);
        else this.#pins.delete(key);
      }
      this.#evict();
    };
    return new Promise((resolve, reject) => {
      this.#waiters.push({
        keys,
        resolve: () => resolve(release),
        reject: (error) => {
          release();
          reject(error);
        },
      });
      this.#resolveWaiters();
      this.#pump();
    });
  }

  /**
   * Takes a built tile from the worker.
   */
  receive(data) {
    const key = keyOf(data);
    this.#inFlight.delete(key);
    if (!this.#ready.has(key)) this.#ready.set(key, this.#bake(data));
    this.#resolveWaiters();
    this.#evict();
    this.#pump();
    this.#onChange();
  }

  /**
   * Notes that a tile could not be built.
   */
  fail(tile, error = new Error(`Tile ${keyOf(tile)} could not be built`)) {
    const key = keyOf(tile);
    this.#inFlight.delete(key);
    this.#failed.add(key);
    const failing = this.#waiters.filter((waiter) => waiter.keys.includes(key));
    this.#waiters = this.#waiters.filter((waiter) => !waiter.keys.includes(key));
    for (const waiter of failing) waiter.reject(error);
    this.#pump();
    this.#onChange();
  }

  /**
   * The drawable tiles to draw a view at a level, coarsest first. tilesAtLevel(k) gives the
   * tiles of level k that cover the view.
   *
   * A tile keeps only the cells whose site is inside it, so a strip along its edge is drawn by
   * its neighbours' cells: a missing tile leaves a gap inside its ready neighbours too, which
   * its own ancestor does not cover. So each level is drawn whole: when the level has a missing
   * tile, the ready tiles of the coarser levels are drawn under it, up to the first complete
   * level (level 0 is pinned, so always complete). Every point then shows the finest ready tile
   * that owns it.
   */
  drawList(tilesAtLevel, level) {
    const levels = [];
    for (let k = level; k >= 0; k--) {
      const keys = tilesAtLevel(k).map(keyOf);
      const ready = keys.filter((key) => this.#ready.has(key));
      levels.unshift(ready);
      if (ready.length === keys.length) break;
    }
    return levels.flat().map((key) => this.#use(key));
  }

  /**
   * Whether every wanted tile has arrived or failed, and no ensure() is waiting.
   */
  get settled() {
    return (
      this.#inFlight.size === 0 &&
      this.#waiters.length === 0 &&
      this.#wanted.every((key) => this.#ready.has(key) || this.#failed.has(key))
    );
  }

  // Marks a tile as just used, for the least-recently-used order
  #use(key) {
    const baked = this.#ready.get(key);
    this.#ready.delete(key);
    this.#ready.set(key, baked);
    return baked;
  }

  #resolveWaiters() {
    const done = this.#waiters.filter((waiter) => waiter.keys.every((key) => this.#ready.has(key)));
    this.#waiters = this.#waiters.filter((waiter) => !done.includes(waiter));
    for (const waiter of done) waiter.resolve();
  }

  #pump() {
    const candidates = [...this.#waiters.flatMap((waiter) => waiter.keys), ...this.#wanted];
    for (const key of candidates) {
      if (this.#inFlight.size >= this.#maxInFlight) return;
      if (this.#ready.has(key) || this.#inFlight.has(key) || this.#failed.has(key)) continue;
      this.#inFlight.add(key);
      this.#request(tileOf(key));
    }
  }

  // Frees the least recently used tiles beyond the cache size, except those in use
  #evict() {
    const wanted = new Set(this.#wanted);
    for (const [key, baked] of this.#ready) {
      if (this.#ready.size <= this.#cacheSize) return;
      if (wanted.has(key) || this.#pins.has(key)) continue;
      this.#ready.delete(key);
      this.#destroy(baked);
    }
  }
}
