import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  { ignores: ["dist/", "playwright-report/", "test-results/", "src/vendor/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["tests/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
