import { expect, test } from "vitest";
import { screenshotFileName } from "../../src/ui/screenshot.js";

test("the file name holds the seed and the size", () => {
  expect(screenshotFileName("12345", 800, 600)).toBe("hodos-12345-800x600.png");
});

test.each([
  ["a/b c", "hodos-a_b_c-10x20.png"],
  ["../x", "hodos-_x-10x20.png"],
  ["🐉dragon", "hodos-_dragon-10x20.png"],
  ["", "hodos-map-10x20.png"],
])("unsafe seed %j becomes %s", (seed, expected) => {
  expect(screenshotFileName(seed, 10, 20)).toBe(expected);
});

test("long seeds are cut to 64 characters", () => {
  expect(screenshotFileName("a".repeat(200), 1, 1)).toBe(`hodos-${"a".repeat(64)}-1x1.png`);
});
