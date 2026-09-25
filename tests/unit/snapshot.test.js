import { expect, test } from "vitest";
import reference from "../fixtures/seed-12345.json";
import { generateSummary } from "./helpers.js";

test("seed 12345 still generates the reference map", () => {
  expect(generateSummary("12345")).toEqual(reference);
});
