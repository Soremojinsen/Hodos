import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the build works from any folder
  base: "./",
  test: {
    include: ["tests/unit/**/*.test.js"],
  },
});
