const { test } = QUnit;

/**
 * utils.js
 */
QUnit.module("Utils");

//getRandomInRange
test("getRandomInRange", (assert) => {
  let n = 1000;
  for (let i = 0; i < n; i++) {
    let res = getRandomInRange(0, 1, Math.random);
    assert.true(0 <= res && res < 1, "Correct range");
  }
});

test("getRandomPointsIn2dRange", (assert) => {
  let n = 1000;
  let lowerBound = 0;
  let higherBound = 1000;
  let arrayRes = getRandomPointsIn2dRange(
    n,
    lowerBound,
    higherBound,
    Math.random
  );

  arrayRes.forEach((coord) => {
    assert.true(
      lowerBound <= coord[0] && coord[0] < higherBound,
      "Correct range for x value"
    );
    assert.true(
      lowerBound <= coord[1] && coord[1] < higherBound,
      "Correct range for y value"
    );
  });
});

test("randomElement can pick every element", (assert) => {
  let array = ["a", "b", "c"];
  assert.strictEqual(randomElement(array, () => 0), "a", "low roll picks the first");
  assert.strictEqual(randomElement(array, () => 0.5), "b", "middle roll");
  assert.strictEqual(randomElement(array, () => 0.99), "c", "high roll picks the last");
});

test("taxiDistance", (assert) => {
  assert.true(taxiDistance(0, 0, 5, 6) == 6, "Correct distance");
  assert.true(taxiDistance(-2, 6, 5, 6) == 7, "Correct distance");
});

/**
 * biomes.js
 */
QUnit.module("Biomes");

test("createBiomes registers every biome", (assert) => {
  let biomes = createBiomes(Math.random);
  assert.strictEqual(BIOMES, biomes, "BIOMES points to the created registry");
  for (const pool in BIOMESPOOL) {
    for (const name of BIOMESPOOL[pool]) {
      assert.true(biomes[name] instanceof Biome, name + " is registered");
    }
  }
  assert.true(biomes["ocean"].isMaritime(), "ocean is maritime");
});

test("createBiomes assigns ids starting at 0 every time", (assert) => {
  createBiomes(Math.random);
  let ids = Object.values(createBiomes(Math.random)).map((b) => b.id);
  assert.strictEqual(Math.min(...ids), 0, "ids restart at 0");
  assert.strictEqual(new Set(ids).size, ids.length, "ids are unique");
});

test("MapGenerator registers the biomes itself", (assert) => {
  BIOMES = undefined;
  new MapGenerator("42");
  assert.true(BIOMES["ocean"] instanceof OceanBiome, "biomes available without init.js");
});

/**
 * geometry.js
 */
QUnit.module("Geometry", {
  beforeEach: () => {
    createBiomes(Math.random);
  },
});

//Point
test("Point constructor", (assert) => {
  let Xcoord = 404;
  let Ycoord = 42;
  let Zcoord = 418;
  let testPoint = new Point(404, 42, 418);
  assert.true(testPoint.x == Xcoord, "Correct X assignation");
  assert.true(testPoint.y == Ycoord, "Correct Y assignation");
  assert.true(testPoint.z == Zcoord, "Correct Z assignation");
});

test("Point x assignation", (assert) => {
  let newVal = 404;
  let testPoint = new Point(0, 0, 0);
  testPoint.x = newVal;
  assert.true(testPoint.x == newVal, "Correct X modification");
});

test("Point y assignation", (assert) => {
  let newVal = 404;
  let testPoint = new Point(0, 0, 0);
  testPoint.y = newVal;
  assert.true(testPoint.y == newVal, "Correct Y modification");
});

test("Point z assignation", (assert) => {
  let newVal = 404;
  let testPoint = new Point(0, 0, 0);
  testPoint.z = newVal;
  assert.true(testPoint.z == newVal, "Correct Z modification");
});

test("Point coordinate", (assert) => {
  let testPoint = new Point(42, -43, 76);
  let coord = testPoint.coordinates;
  assert.true(coord[0] == 42, "Correct X in coord");
  assert.true(coord[1] == -43, "Correct Y in coord");
  assert.true(coord[2] == 76, "Correct Z in coord");
});

//Cell
test("Cell constructor", (assert) => {
  let testCell = new Cell(404, 42, 418);
  assert.true(testCell.center.x == 404, "Correct X assignation");
  assert.true(testCell.center.y == 42, "Correct Y assignation");
  assert.true(testCell.center.z == 418, "Correct Z assignation");
  assert.true(testCell.ring.length == 0, "Correct ring assignation");
  assert.true(testCell.biome == BIOMES["ocean"], "Correct Biome assignation");
});

test("Cell addPolygonPoint", (assert) => {
  let testCell = new Cell(404, 42, 418);
  let point1 = new Point(1, 2, 3);
  let point2 = new Point(4, 5, 6);
  testCell.addPolygonPoint(point1);
  testCell.addPolygonPoint(point2);
  let ring = testCell.ring;
  assert.true(ring[0] == point1 && ring[1] == point2, "Correct Point add");
});

test("Cell removePolygonPoint", (assert) => {
  let testCell = new Cell(404, 42, 418);
  let point1 = new Point(1, 2, 3);
  let point2 = new Point(4, 5, 6);
  testCell.addPolygonPoint(point1);
  testCell.addPolygonPoint(point2);
  let removingPoint = testCell.removePolygonPoint();
  let ring = testCell.ring;
  assert.true(ring[0] == point1, "Correct ring");
  assert.true(removingPoint == point2, "Correct point remove");
});

test("Cell setEarth", (assert) => {
  let testCell = new Cell(404, 42, 418);
  testCell.setEarth();
  assert.true(
    testCell.biome == BIOMES["continent"],
    "Correct Biome assignation"
  );
});
test("Cell z getter returns the center altitude", (assert) => {
  let testCell = new Cell(1, 2, 0.9);
  assert.strictEqual(testCell.z, 0.9, "z reads the center altitude");
});

/**
 * map.js
 */
QUnit.module("Map");

test("zoom is clamped to [0, 7] instead of ignored", (assert) => {
  let camera = { zoom: 1, updateGl: () => {} };
  let controller = new MapController({ camera });
  for (let i = 0; i < 5; i++) controller.zoom(-0.4);
  assert.strictEqual(camera.zoom, 0, "wheel steps reach the minimum");
  controller.zoom(10);
  assert.strictEqual(camera.zoom, 7, "a large pinch reaches the maximum");
  controller.zoom(0.4);
  assert.strictEqual(camera.zoom, 7, "stays at the maximum");
});

/**
 * generator.js
 */
QUnit.module("Generator");

/**
 * Generates a map and summarizes it as one "biome:altitude" entry per cell.
 */
const generateSummary = (seed) => {
  let generator = new MapGenerator(seed);
  generator.generateTile(0, 0, 0);
  let names = new Map(Object.entries(BIOMES).map(([name, b]) => [b, name]));
  return generator.cells.map((c) => names.get(c.biome) + ":" + c.center.z);
};

test("the same seed always generates the same map", (assert) => {
  assert.deepEqual(generateSummary("12345"), generateSummary("12345"));
});

test("text seeds give different terrain noise", (assert) => {
  new MapGenerator("dragon").generateTile(0, 0, 0);
  let dragon = noise.simplex2(1.5, 2.5);
  new MapGenerator("wizard").generateTile(0, 0, 0);
  let wizard = noise.simplex2(1.5, 2.5);
  assert.notStrictEqual(dragon, wizard, "noise depends on the seed");
});

test("hashSeed maps any string to a noise seed in [0, 65536)", (assert) => {
  for (const seed of ["", "0", "12345", "dragon", "Hodos, voyagez avec audace !"]) {
    let hash = hashSeed(seed);
    assert.true(Number.isInteger(hash) && hash >= 0 && hash < 65536, seed);
  }
  assert.strictEqual(hashSeed("dragon"), hashSeed("dragon"), "stable");
});

test("randomBiomeFromPool can pick every biome of a pool", (assert) => {
  createBiomes(Math.random);
  for (const pool in BIOMESPOOL) {
    let [first, second] = BIOMESPOOL[pool];
    assert.strictEqual(randomBiomeFromPool(pool, () => 0), BIOMES[first], pool + " low roll");
    assert.strictEqual(randomBiomeFromPool(pool, () => 0.99), BIOMES[second], pool + " high roll");
  }
});

test("corners shared with the ocean stay at sea level", (assert) => {
  let generator = new MapGenerator("12345");
  generator.generateTile(0, 0, 0);
  let raised = 0;
  generator.cells
    .filter((cell) => cell.isMaritime())
    .forEach((cell) => cell.ring.forEach((point) => {
      if (point.z !== -0.1) raised++;
    }));
  assert.strictEqual(raised, 0, "no ocean cell corner has a land altitude");
});

test("the corruption always spreads to the whole first ring", (assert) => {
  for (const seed of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    let generator = new MapGenerator(seed);
    generator.generateTile(0, 0, 0);
    let cells = generator.cells;
    let isCorrupted = (i) => cells[i].biome === BIOMES["Corrupted"];
    let hasFullRing = cells.some((cell, i) =>
      isCorrupted(i) &&
      [...generator.delaunay.neighbors(i)]
        .filter((next) => cells[next].isContinent())
        .every(isCorrupted)
    );
    assert.true(hasFullRing, "seed " + seed);
  }
});

test("the continent burn claims each cell only once", (assert) => {
  let claims = new Map();
  let setContinent = Cell.prototype.setContinent;
  Cell.prototype.setContinent = function (nb) {
    claims.set(this, (claims.get(this) || 0) + 1);
    return setContinent.call(this, nb);
  };
  try {
    new MapGenerator("12345").generateTile(0, 0, 0);
  } finally {
    Cell.prototype.setContinent = setContinent;
  }
  let reclaimed = [...claims.values()].filter((n) => n > 1).length;
  assert.strictEqual(reclaimed, 0, "no cell is added to a continent twice");
});
