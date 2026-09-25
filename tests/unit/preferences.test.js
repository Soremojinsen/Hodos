import { afterEach, expect, test, vi } from "vitest";
import { readPreference, writePreference } from "../../src/state/preferences.js";

afterEach(() => vi.unstubAllGlobals());

test("preferences are stored under hodos.<name>", () => {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  });
  writePreference("lang", "en");
  expect(store.get("hodos.lang")).toBe("en");
  expect(readPreference("lang")).toBe("en");
  expect(readPreference("hover")).toBeNull();
});

test("unavailable storage reads as nothing and ignores writes", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  });
  expect(readPreference("lang")).toBeNull();
  expect(() => writePreference("lang", "fr")).not.toThrow();
});
