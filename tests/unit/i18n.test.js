import { afterEach, expect, test, vi } from "vitest";
import en from "../../src/i18n/en.js";
import fr from "../../src/i18n/fr.js";
import {
  DICTIONARIES,
  detectLanguage,
  format,
  getLanguage,
  setLanguage,
  t,
} from "../../src/i18n/i18n.js";

afterEach(() => {
  setLanguage("fr");
  vi.restoreAllMocks();
});

test("French and English have the same keys, none empty", () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const text of [...Object.values(fr), ...Object.values(en)]) {
    expect(text.trim()).not.toBe("");
  }
});

test.each([
  ["en", ["fr-FR"], "en"],
  ["fr", ["en-US"], "fr"],
  ["de", ["fr-FR"], "fr"],
  [null, ["fr-FR", "en"], "fr"],
  [null, ["FR-ca"], "fr"],
  [null, ["de-DE", "en-GB", "fr"], "en"],
  [null, ["de-DE"], "en"],
  [null, [], "en"],
  [null, undefined, "en"],
])("saved %j and browser %j give %s", (saved, languages, expected) => {
  expect(detectLanguage(saved, languages)).toBe(expected);
});

test("format replaces known parameters and keeps unknown ones", () => {
  expect(format("Continent n°{n}", { n: 3 })).toBe("Continent n°3");
  expect(format("{a} and {b}", { a: "x" })).toBe("x and {b}");
});

test("t uses the current language", () => {
  expect(t("footer.settings")).toBe("Paramètres");
  setLanguage("en");
  expect(getLanguage()).toBe("en");
  expect(t("footer.settings")).toBe("Settings");
});

test("a key missing in English falls back to French with a warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  DICTIONARIES.fr["test.only"] = "seulement";
  try {
    setLanguage("en");
    expect(t("test.only")).toBe("seulement");
    expect(warn).toHaveBeenCalled();
  } finally {
    delete DICTIONARIES.fr["test.only"];
  }
});

test("a key missing everywhere is shown as is", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(t("no.such.key")).toBe("no.such.key");
});

test("an unknown language is refused", () => {
  expect(() => setLanguage("de")).toThrow();
});
