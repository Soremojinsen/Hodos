import { expect, test } from "vitest";
import {
  EMPTY_EDITS,
  LABEL_KINDS,
  MAX_NAME_LENGTH,
  isEmpty,
  normalizeEdits,
  sameEdits,
  withHidden,
  withKindShown,
  withName,
} from "../../src/state/edits.js";

test("anything that is not edits normalizes to empty edits", () => {
  for (const raw of [undefined, null, 3, "x", [], { names: 4, hidden: "a", kinds: [] }]) {
    expect(normalizeEdits(raw)).toEqual({ names: {}, hidden: [], kinds: {} });
  }
  expect(isEmpty(normalizeEdits(null))).toBe(true);
  expect(isEmpty(EMPTY_EDITS)).toBe(true);
});

test("names are trimmed, collapsed, cut, and dropped when empty or malformed", () => {
  const edits = normalizeEdits({
    names: {
      "lake:812,340": { root: "  Mire   water " },
      "sea:1200,900": { full: "The Sundering Sea" },
      "island:1,2": { root: "   " },
      "range:3,4": { full: "" },
      "river:1,2,3,4": "Not an object",
      "continent:2": { root: 42 },
      "lake:5,6": { root: "x".repeat(100) },
    },
  });
  expect(edits.names).toEqual({
    "lake:812,340": { root: "Mire water" },
    "sea:1200,900": { full: "The Sundering Sea" },
    "lake:5,6": { root: "x".repeat(MAX_NAME_LENGTH) },
  });
});

test("cutting a name never splits a character", () => {
  const name = "é".repeat(59) + "😀😀";
  const { root } = normalizeEdits({ names: { "lake:1,1": { root: name } } }).names["lake:1,1"];
  expect([...root]).toHaveLength(MAX_NAME_LENGTH);
  expect(root.endsWith("😀")).toBe(true);
});

test("only feature ids are kept, never keys like __proto__", () => {
  const raw = JSON.parse(
    '{"names": {"__proto__": {"root": "x"}, "constructor": {"root": "y"}, "ocean": {"root": "Sumi"}},' +
      ' "hidden": ["__proto__", "sea:1,2", "sea:1,2", 5, "nope"]}',
  );
  const edits = normalizeEdits(raw);
  expect(Object.keys(edits.names)).toEqual(["ocean"]);
  expect(Object.getPrototypeOf(edits.names)).toBe(Object.prototype);
  expect(edits.hidden).toEqual(["sea:1,2"]);
});

test("only known kinds turned off are kept", () => {
  const edits = normalizeEdits({ kinds: { river: false, lake: true, dragons: false, sea: 0 } });
  expect(edits.kinds).toEqual({ river: false });
  expect(LABEL_KINDS).toHaveLength(11);
});

test("updaters return new normalized edits and leave the old ones alone", () => {
  const start = normalizeEdits({});
  const named = withName(start, "lake:1,2", { root: " Mire " });
  expect(named.names).toEqual({ "lake:1,2": { root: "Mire" } });
  expect(start.names).toEqual({});
  expect(withName(named, "lake:1,2", null).names).toEqual({});
  expect(withName(named, "lake:1,2", { root: "" }).names).toEqual({});
  const hidden = withHidden(named, "sea:3,4", true);
  expect(hidden.hidden).toEqual(["sea:3,4"]);
  expect(withHidden(hidden, "sea:3,4", false).hidden).toEqual([]);
  const off = withKindShown(start, "river", false);
  expect(off.kinds).toEqual({ river: false });
  expect(withKindShown(off, "river", true).kinds).toEqual({});
});

test("sameEdits ignores order", () => {
  const a = {
    names: { "lake:1,1": { root: "A" }, "lake:2,2": { root: "B" } },
    hidden: ["sea:1,1", "sea:2,2"],
  };
  const b = {
    names: { "lake:2,2": { root: "B" }, "lake:1,1": { root: "A" } },
    hidden: ["sea:2,2", "sea:1,1"],
  };
  expect(sameEdits(a, b)).toBe(true);
  expect(sameEdits(a, { ...b, hidden: [] })).toBe(false);
});
