import { expect, test } from "vitest";
import { applyEdits } from "../../src/overlay/label-edits.js";
import { normalizeEdits } from "../../src/state/edits.js";

const labels = [
  { id: "ocean", kind: "ocean", name: { root: "Sumika" } },
  { id: "range:1,1", kind: "range", name: { adjective: "white" } },
  { id: "river:1,1,2,2", kind: "river", name: { root: "Zahir", form: "fleuve" } },
  { id: "sea:5,5", kind: "sea", name: { root: "Aleni" } },
];

test("no edits give the same labels back", () => {
  const result = applyEdits(labels, normalizeEdits({}));
  expect(result).toHaveLength(4);
  result.forEach((label, i) => expect(label).toBe(labels[i]));
});

test("renamed labels keep their place, their generated name and their river form", () => {
  const result = applyEdits(
    labels,
    normalizeEdits({
      names: {
        ocean: { full: "La Grande Bleue" },
        "range:1,1": { root: "Mirewater" },
        "river:1,1,2,2": { root: "Ombre" },
      },
    }),
  );
  expect(result.map((l) => l.id)).toEqual(labels.map((l) => l.id));
  expect(result[0]).toMatchObject({
    name: { full: "La Grande Bleue" },
    edited: true,
    generated: { root: "Sumika" },
  });
  expect(result[1].name).toEqual({ root: "Mirewater" });
  expect(result[2].name).toEqual({ root: "Ombre", form: "fleuve" });
  expect(result[3]).toBe(labels[3]);
});

test("hidden labels and kinds turned off stay in the list, flagged", () => {
  const result = applyEdits(
    labels,
    normalizeEdits({ hidden: ["sea:5,5"], kinds: { river: false } }),
  );
  expect(result).toHaveLength(4);
  expect(result[2].hidden).toBe(true);
  expect(result[3].hidden).toBe(true);
  expect(result[0].hidden).toBeUndefined();
  expect(result[3].edited).toBeUndefined();
});
