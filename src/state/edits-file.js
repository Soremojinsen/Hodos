import { normalizeEdits } from "./edits.js";
import { isValidSeed } from "./url-state.js";

/**
 * The file that keeps a map's place names: its seed and its edits (see edits.js), with the
 * format's version, so later versions can read older files and refuse newer ones.
 */
export const EDITS_FILE_VERSION = 1;

/**
 * The longest file read, in characters: far more than any map's names, far less than a mistake.
 */
export const MAX_FILE_LENGTH = 1_000_000;

export class EditsFileError extends Error {
  /**
   * @param reason {"invalid"|"newer"} not a names file, or one from a newer version
   */
  constructor(reason) {
    super(`Not a names file this version can read: ${reason}`);
    this.reason = reason;
  }
}

/**
 * The file name of a map's names, e.g. "hodos-12345.json".
 */
export const editsFileName = (seed) =>
  `hodos-${String(seed)
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 40)}.json`;

export const serializeEditsFile = (seed, edits) =>
  JSON.stringify({ hodos: EDITS_FILE_VERSION, seed, edits: normalizeEdits(edits) }, null, 2);

/**
 * The seed and edits of a names file.
 *
 * @throws {EditsFileError}
 */
export function parseEditsFile(text) {
  if (typeof text !== "string" || text.length > MAX_FILE_LENGTH)
    throw new EditsFileError("invalid");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new EditsFileError("invalid");
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new EditsFileError("invalid");
  }
  if (!Number.isInteger(data.hodos) || data.hodos < 1 || !isValidSeed(data.seed)) {
    throw new EditsFileError("invalid");
  }
  if (data.hodos > EDITS_FILE_VERSION) throw new EditsFileError("newer");
  return { seed: data.seed, edits: normalizeEdits(data.edits) };
}
