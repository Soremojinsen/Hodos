import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the build works from any folder
  base: "./",
  test: {
    include: ["tests/unit/**/*.test.js"],
    // Tests that build whole worlds take a few seconds alone, and more with every file running at once
    testTimeout: 15000,
  },
});
