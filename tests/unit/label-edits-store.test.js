import { expect, test, vi } from "vitest";
import { withHidden, withName } from "../../src/state/edits.js";
import {
  LabelEdits,
  readStoredEdits,
  storageKey,
  writeStoredEdits,
} from "../../src/state/label-edits-store.js";

const memoryStorage = () => {
  const store = new Map();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
};

const failingStorage = () => {
  const fail = () => {
    throw new Error("QuotaExceededError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
};

const atlas = [
  { id: "ocean", kind: "ocean", name: { root: "Sumika" } },
  { id: "sea:1,1", kind: "sea", name: { root: "Aleni" } },
];

test("edits are kept per seed, and empty edits leave nothing", () => {
  const storage = memoryStorage();
  const edits = new LabelEdits("12345", { storage });
  edits.update((e) => withName(e, "ocean", { root: "Mire" }));
  expect(JSON.parse(storage.store.get(storageKey("12345")))).toEqual({
    edits: { names: { ocean: { root: "Mire" } }, hidden: [], kinds: {} },
    filed: false,
  });
  expect(new LabelEdits("12345", { storage }).edits.names).toEqual({ ocean: { root: "Mire" } });
  expect(new LabelEdits("other", { storage }).edits.names).toEqual({});
  edits.update((e) => withName(e, "ocean", null));
  expect(storage.store.has(storageKey("12345"))).toBe(false);
});

test("labels follow the atlas and the edits, and listeners hear every change", () => {
  const listener = vi.fn();
  const edits = new LabelEdits("12345", { storage: memoryStorage() });
  edits.addListener(listener);
  expect(edits.labels).toEqual([]);
  edits.setAtlasLabels(atlas);
  expect(edits.labels).toHaveLength(2);
  edits.update((e) => withHidden(e, "sea:1,1", true));
  expect(edits.labels[1].hidden).toBe(true);
  expect(listener).toHaveBeenCalledTimes(2);
  // No change, no call
  edits.update((e) => withHidden(e, "sea:1,1", true));
  expect(listener).toHaveBeenCalledTimes(2);
});

test("filed is false after a change, true after saving or opening a file", () => {
  const storage = memoryStorage();
  const edits = new LabelEdits("12345", { storage });
  expect(edits.filed).toBe(true);
  edits.update((e) => withName(e, "ocean", { root: "Mire" }));
  expect(edits.filed).toBe(false);
  edits.markFiled();
  expect(edits.filed).toBe(true);
  expect(readStoredEdits("12345", storage).filed).toBe(true);
  edits.update((e) => withName(e, "ocean", { root: "Mirewater" }));
  edits.replace({ names: { ocean: { full: "La Grande Bleue" } } });
  expect(edits.filed).toBe(true);
  expect(edits.edits.names.ocean).toEqual({ full: "La Grande Bleue" });
});

test("unavailable storage keeps edits for the session and warns once", () => {
  const onUnsaved = vi.fn();
  const edits = new LabelEdits("12345", { storage: failingStorage(), onUnsaved });
  edits.update((e) => withName(e, "ocean", { root: "Mire" }));
  edits.update((e) => withName(e, "ocean", { root: "Mirewater" }));
  expect(edits.edits.names.ocean).toEqual({ root: "Mirewater" });
  expect(onUnsaved).toHaveBeenCalledTimes(1);
  expect(new LabelEdits("12345", { storage: null }).edits.names).toEqual({});
});

test("broken stored edits read as none, and reload picks up another tab's write", () => {
  const storage = memoryStorage();
  storage.setItem(storageKey("12345"), "{not json");
  expect(readStoredEdits("12345", storage).edits.names).toEqual({});
  const edits = new LabelEdits("12345", { storage });
  expect(
    writeStoredEdits(
      "12345",
      { edits: { names: { ocean: { root: "Tab" } } }, filed: false },
      storage,
    ),
  ).toBe(true);
  edits.reload();
  expect(edits.edits.names.ocean).toEqual({ root: "Tab" });
});
