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
  expect(KIND_ORDER).toHaveLength(11);
});

test("a search keeps the matching names and their groups", () => {
  expect(
    groupLabels(labels, text, "  ELENI ").map((g) => g.entries.map((e) => e.label.id)),
  ).toEqual([["sea:2"]]);
  expect(groupLabels(labels, text, "dragon")).toEqual([]);
});

test("a search finds a renamed place by its generated name too", () => {
  const renamed = [
    ...labels,
    {
      id: "lake:1",
      kind: "lake",
      priority: 2100,
      text: "Lac Mirewater",
      generated: { text: "Lac Velorn" },
    },
  ];
  // The generated name's text, as text gives it for {kind, name}
  const textOf = (label) => label.text ?? label.name.text;
  const ids = (query) =>
    groupLabels(renamed, textOf, query).flatMap((g) => g.entries.map((e) => e.label.id));
  expect(ids("velorn")).toEqual(["lake:1"]);
  expect(ids("mirewater")).toEqual(["lake:1"]);
  // The entry shows the name it has now
  expect(groupLabels(renamed, textOf, "velorn")[0].entries[0].text).toBe("Lac Mirewater");
});

test("a search keeps the selected name, so it stays in the list while being edited", () => {
  expect(
    groupLabels(labels, text, "eleni", "river:1").map((g) => g.entries.map((e) => e.label.id)),
  ).toEqual([["sea:2"], ["river:1"]]);
});

test("settlements are listed after the other kinds, largest first", () => {
  expect(KIND_ORDER.slice(-4)).toEqual(["capital", "city", "town", "village"]);
  const groups = groupLabels(
    [
      { id: "settlement:2", kind: "village", priority: 1100, text: "Brec" },
      { id: "settlement:1", kind: "capital", priority: 8400, text: "Calvenne" },
      { id: "ocean", kind: "ocean", priority: 11100, text: "Océan Sumika" },
    ],
    (l) => l.text,
    "",
  );
  expect(groups.map((g) => g.kind)).toEqual(["ocean", "capital", "village"]);
});
