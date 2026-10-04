import { applyEdits } from "../overlay/label-edits.js";
import { EMPTY_EDITS, isEmpty, normalizeEdits, sameEdits } from "./edits.js";

/**
 * Where a seed's edits are kept in the browser.
 */
export const storageKey = (seed) => `hodos.edits.${seed}`;

// The browser's storage, or null where even reaching it throws (blocked site data)
const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * A seed's edits as kept in the browser, and whether a file holds them (filed). Absent, broken or
 * unreachable, they are none.
 */
export function readStoredEdits(seed, storage = browserStorage()) {
  try {
    const text = storage?.getItem(storageKey(seed));
    if (!text) return { edits: EMPTY_EDITS, filed: true };
    const data = JSON.parse(text);
    return { edits: normalizeEdits(data?.edits), filed: data?.filed === true };
  } catch {
    return { edits: EMPTY_EDITS, filed: true };
  }
}

/**
 * Keeps a seed's edits in the browser, or forgets them when empty.
 *
 * @returns {boolean} false when the browser could not keep them
 */
export function writeStoredEdits(seed, { edits, filed }, storage = browserStorage()) {
  try {
    if (!storage) return false;
    if (isEmpty(edits)) storage.removeItem(storageKey(seed));
    else storage.setItem(storageKey(seed), JSON.stringify({ edits, filed }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The current map's edits, kept in the browser on every change, and the labels they give.
 */
export class LabelEdits {
  #seed;
  #storage;
  #onUnsaved;
  #warned = false;
  #edits = EMPTY_EDITS;
  #filed = true;
  #atlasLabels = [];
  #labels = [];
  #listeners = [];

  /**
   * @param seed              {string}
   * @param options.storage   a Storage, or null for none: localStorage by default
   * @param options.onUnsaved called once, the first time the browser cannot keep the edits
   */
  constructor(seed, { storage = browserStorage(), onUnsaved = () => {} } = {}) {
    this.#seed = seed;
    this.#storage = storage;
    this.#onUnsaved = onUnsaved;
    this.#load();
  }

  get seed() {
    return this.#seed;
  }

  /**
   * The storage key of the edits: a storage event with it means another tab changed them.
   */
  get key() {
    return storageKey(this.#seed);
  }

  get edits() {
    return this.#edits;
  }

  /**
   * Whether the last file saved or opened holds these edits.
   */
  get filed() {
    return this.#filed;
  }

  /**
   * The atlas's labels with the edits applied (see overlay/label-edits.js), or none before the atlas.
   */
  get labels() {
    return this.#labels;
  }

  setAtlasLabels(labels) {
    this.#atlasLabels = labels;
    this.#changed();
  }

  /**
   * Changes the edits.
   *
   * @param change {function(Object): Object} gives the new edits from the current ones
   */
  update(change) {
    const edits = normalizeEdits(change(this.#edits));
    if (sameEdits(edits, this.#edits)) return;
    this.#edits = edits;
    this.#filed = false;
    this.#save();
    this.#changed();
  }

  /**
   * Replaces the edits with those of an opened file.
   */
  replace(edits) {
    this.#edits = normalizeEdits(edits);
    this.#filed = true;
    this.#save();
    this.#changed();
  }

  /**
   * Notes that a file now holds the edits.
   */
  markFiled() {
    this.#filed = true;
    this.#save();
    this.#changed();
  }

  /**
   * Reads the edits again from the browser, after another tab changed them.
   */
  reload() {
    this.#load();
    this.#changed();
  }

  addListener(listener) {
    this.#listeners.push(listener);
  }

  #load() {
    ({ edits: this.#edits, filed: this.#filed } = readStoredEdits(this.#seed, this.#storage));
  }

  #save() {
    const kept = writeStoredEdits(
      this.#seed,
      { edits: this.#edits, filed: this.#filed },
      this.#storage,
    );
    if (!kept && !this.#warned) {
      this.#warned = true;
      this.#onUnsaved();
    }
  }

  #changed() {
    this.#labels = applyEdits(this.#atlasLabels, this.#edits);
    for (const listener of this.#listeners) listener();
  }
}
