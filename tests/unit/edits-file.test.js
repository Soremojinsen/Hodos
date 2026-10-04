import { expect, test } from "vitest";
import {
  EDITS_FILE_VERSION,
  EditsFileError,
  MAX_FILE_LENGTH,
  editsFileName,
  parseEditsFile,
  serializeEditsFile,
} from "../../src/state/edits-file.js";

const edits = {
  names: { "lake:1,2": { root: "Mire" }, ocean: { full: "La Grande Bleue" } },
  hidden: ["sea:3,4"],
  kinds: { river: false },
};

test("a saved file opens to the same seed and edits", () => {
  const text = serializeEditsFile("Mon monde", edits);
  expect(JSON.parse(text).hodos).toBe(EDITS_FILE_VERSION);
  expect(parseEditsFile(text)).toEqual({
    seed: "Mon monde",
    edits: {
      names: { "lake:1,2": { root: "Mire" }, ocean: { full: "La Grande Bleue" } },
      hidden: ["sea:3,4"],
      kinds: { river: false },
    },
  });
});

test("file names carry a safe, short seed", () => {
  expect(editsFileName("12345")).toBe("hodos-12345.json");
  expect(editsFileName("Mon monde/à moi")).toBe("hodos-Mon_monde_moi.json");
  expect(editsFileName("x".repeat(100))).toBe(`hodos-${"x".repeat(40)}.json`);
  expect(editsFileName("???")).toBe("hodos-_.json");
});

const reasonOf = (text) => {
  try {
    parseEditsFile(text);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(EditsFileError);
    return error.reason;
  }
};

test("other files are refused", () => {
  expect(reasonOf("not json")).toBe("invalid");
  expect(reasonOf("[]")).toBe("invalid");
  expect(reasonOf('{"name": "package"}')).toBe("invalid");
  expect(reasonOf('{"hodos": 1}')).toBe("invalid");
  expect(reasonOf('{"hodos": 1, "seed": ""}')).toBe("invalid");
  expect(reasonOf('{"hodos": 1.5, "seed": "a"}')).toBe("invalid");
  expect(reasonOf('{"hodos": 2, "seed": "a"}')).toBe("newer");
  expect(reasonOf(" ".repeat(MAX_FILE_LENGTH + 1))).toBe("invalid");
});

test("a file without edits opens to no edits, and bad parts are dropped", () => {
  expect(parseEditsFile('{"hodos": 1, "seed": "a"}').edits).toEqual({
    names: {},
    hidden: [],
    kinds: {},
  });
  const { edits } = parseEditsFile(
    '{"hodos": 1, "seed": "a", "edits": {"names": {"lake:1,1": {"root": "<b>Mire</b>"}, "bad": {"root": "x"}}}}',
  );
  // Kept as text: the panel shows it with textContent
  expect(edits.names).toEqual({ "lake:1,1": { root: "<b>Mire</b>" } });
});
