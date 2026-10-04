import { expect, test } from "vitest";
import { KIND_ORDER, groupLabels, searchKey } from "../../src/ui/names-list.js";

test("search ignores case, accents and the apostrophe's shape", () => {
  expect(searchKey("Mer d’Éléni")).toBe("mer d'eleni");
  expect(searchKey("ÎLE")).toBe("ile");
});

const labels = [
  { id: "river:1", kind: "river", priority: 1100, text: "Fleuve Zahir" },
  { id: "ocean", kind: "ocean", priority: 7100, text: "Océan Sumika" },
  { id: "sea:1", kind: "sea", priority: 5100, text: "Mer de Korr" },
  { id: "sea:2", kind: "sea", priority: 5300, text: "Mer d’Éléni" },
];
const text = (label) => label.text;

test("labels are grouped by kind, largest kinds and features first", () => {
  const groups = groupLabels(labels, text, "");
  expect(groups.map((g) => g.kind)).toEqual(["ocean", "sea", "river"]);
  expect(groups[1].entries.map((e) => e.label.id)).toEqual(["sea:2", "sea:1"]);
  expect(groups[1].entries[0].text).toBe("Mer d’Éléni");
  expect(KIND_ORDER).toHaveLength(7);
});

test("a search keeps the matching names and their groups", () => {
  expect(
    groupLabels(labels, text, "  ELENI ").map((g) => g.entries.map((e) => e.label.id)),
  ).toEqual([["sea:2"]]);
  expect(groupLabels(labels, text, "dragon")).toEqual([]);
});
