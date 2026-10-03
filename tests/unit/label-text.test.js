import { afterEach, expect, test } from "vitest";
import { ADJECTIVES } from "../../src/generation/names/names.js";
import { setLanguage } from "../../src/i18n/i18n.js";
import { labelText } from "../../src/overlay/label-text.js";

afterEach(() => setLanguage("fr"));

const text = (language, kind, name) => {
  setLanguage(language);
  return labelText({ kind, name });
};

test("roots get their generic word in each language", () => {
  expect(text("fr", "lake", { root: "Velorn" })).toBe("Lac Velorn");
  expect(text("en", "lake", { root: "Velorn" })).toBe("Lake Velorn");
  expect(text("fr", "range", { root: "Krodh" })).toBe("Monts Krodh");
  expect(text("en", "range", { root: "Krodh" })).toBe("Krodh Mountains");
  expect(text("fr", "ocean", { root: "Sumika" })).toBe("Océan Sumika");
  expect(text("en", "ocean", { root: "Sumika" })).toBe("Sumika Ocean");
  expect(text("fr", "continent", { root: "Valcoria" })).toBe("Valcoria");
  expect(text("en", "island", { root: "Haldvik" })).toBe("Haldvik Island");
});

test("French elides de before a vowel", () => {
  expect(text("fr", "sea", { root: "Aleni" })).toBe("Mer d’Aleni");
  expect(text("fr", "sea", { root: "Krodh" })).toBe("Mer de Krodh");
  expect(text("fr", "island", { root: "Øsvik" })).toBe("Île d’Øsvik");
  expect(text("en", "sea", { root: "Aleni" })).toBe("Aleni Sea");
});

test("rivers are fleuves or rivières in French", () => {
  expect(text("fr", "river", { root: "Zahir", form: "fleuve" })).toBe("Fleuve Zahir");
  expect(text("fr", "river", { root: "Zahir", form: "riviere" })).toBe("Rivière Zahir");
  expect(text("en", "river", { root: "Zahir", form: "fleuve" })).toBe("Zahir River");
});

test("descriptive names agree in French", () => {
  expect(text("fr", "sea", { adjective: "grey" })).toBe("Mer Grise");
  expect(text("fr", "lake", { adjective: "grey" })).toBe("Lac Gris");
  expect(text("fr", "range", { adjective: "white" })).toBe("Monts Blancs");
  expect(text("fr", "river", { adjective: "red", form: "riviere" })).toBe("Rivière Rouge");
  expect(text("en", "range", { adjective: "white" })).toBe("White Mountains");
});

test("every adjective has a text for every gender in both languages", () => {
  const adjectives = new Set(Object.values(ADJECTIVES).flat());
  for (const language of ["fr", "en"]) {
    for (const adjective of adjectives) {
      for (const [kind, form] of [
        ["sea"],
        ["lake"],
        ["island"],
        ["range"],
        ["river", "fleuve"],
        ["river", "riviere"],
      ]) {
        const result = text(language, kind, { adjective, form });
        expect(result).not.toContain("adj.");
        expect(result).not.toContain("{");
      }
    }
  }
});
