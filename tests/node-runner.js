/**
 * Runs the browser unit tests (js/unit-tests.js) under Node with the QUnit CLI.
 *
 * The site has no module system: scripts share one global scope, like <script> tags.
 * We reproduce that by evaluating every script in the same vm context.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

/* Same order as in tests.html, minus everything that needs the DOM or WebGL */
const SCRIPTS = [
  "js/libs/d3-7.9.0.min.js",
  "js/libs/aleaPRNG.min.js",
  "js/libs/perlin.js",
  "js/util.js",
  "js/biomes.js",
  "js/geometry.js",
  "js/generator.js",
  "js/mesh.js",
  "js/map.js",
  "js/unit-tests.js",
];

const context = vm.createContext({
  QUnit,
  console,
  crypto: globalThis.crypto,
});

for (const script of SCRIPTS) {
  const file = path.join(ROOT, script);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
