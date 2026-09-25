import { expect, test } from "vitest";
import { tileKey } from "../../src/map/tile-grid.js";
import { TileManager } from "../../src/map/tiles.js";

const tile = (key) => {
  const [z, x, y] = key.split("/").map(Number);
  return { z, x, y };
};
const tiles = (...list) => list.map(tile);

const setup = (options = {}) => {
  const log = { requests: [], destroyed: [], changes: 0 };
  const manager = new TileManager({
    request: ({ z, x, y }) => log.requests.push(tileKey(z, x, y)),
    bake: (data) => ({ key: tileKey(data.z, data.x, data.y) }),
    destroy: (baked) => log.destroyed.push(baked.key),
    onChange: () => log.changes++,
    ...options,
  });
  const arrive = (key) => manager.receive(tile(key));
  const drawn = (...list) => manager.drawList(tiles(...list)).map((baked) => baked.key);
  return { manager, log, arrive, drawn };
};

test("at most two requests are in flight, in the wanted order", () => {
  const { manager, log, arrive } = setup();
  manager.want(tiles("2/0/0", "2/1/0", "2/2/0", "2/3/0"));
  expect(log.requests).toEqual(["2/0/0", "2/1/0"]);
  arrive("2/0/0");
  expect(log.requests).toEqual(["2/0/0", "2/1/0", "2/2/0"]);
  expect(log.changes).toBe(1);
});

test("stale tiles are never requested", () => {
  const { manager, log, arrive } = setup();
  manager.want(tiles("3/0/0", "3/1/0", "3/2/0", "3/3/0"));
  manager.want(tiles("5/9/9", "5/9/10"));
  arrive("3/0/0");
  arrive("3/1/0");
  expect(log.requests).toEqual(["3/0/0", "3/1/0", "5/9/9", "5/9/10"]);
});

test("a tile that arrives after it stopped being wanted is kept", () => {
  const { manager, log, arrive, drawn } = setup();
  manager.want(tiles("3/0/0"));
  manager.want(tiles("4/0/0"));
  arrive("3/0/0");
  manager.want(tiles("3/0/0"));
  expect(log.requests.filter((key) => key === "3/0/0")).toHaveLength(1);
  expect(drawn("3/0/0")).toEqual(["3/0/0"]);
});

test("missing tiles are drawn as their nearest ready ancestor, ancestors first and once", () => {
  const { manager, arrive, drawn } = setup({ maxInFlight: 10 });
  manager.want(tiles("0/0/0", "1/0/0", "2/0/0", "2/1/1"));
  arrive("0/0/0");
  arrive("1/0/0");
  arrive("2/1/1");
  // 2/0/0 and 2/1/0 are both covered by 1/0/0; 2/2/2 only by 0/0/0
  expect(drawn("2/0/0", "2/1/0", "2/1/1", "2/2/2")).toEqual(["0/0/0", "1/0/0", "2/1/1"]);
});

test("the least recently used tiles are freed beyond the cache size", () => {
  const { manager, log, arrive, drawn } = setup({ cacheSize: 2, maxInFlight: 10 });
  manager.want(tiles("3/0/0", "3/1/0", "3/2/0"));
  ["3/0/0", "3/1/0", "3/2/0"].forEach(arrive);
  drawn("3/0/0"); // 3/1/0 becomes the least recently used
  manager.want(tiles("3/3/0"));
  arrive("3/3/0");
  expect(log.destroyed).toEqual(["3/1/0", "3/2/0"]);
});

test("the cache never evicts wanted or pinned tiles, even over its size", async () => {
  const { manager, log, arrive } = setup({ cacheSize: 2, maxInFlight: 10 });
  const pinned = manager.ensure(tiles("0/0/0"));
  arrive("0/0/0");
  await pinned;
  manager.want(tiles("2/0/0", "2/1/0", "2/2/0", "2/3/0"));
  ["2/0/0", "2/1/0", "2/2/0", "2/3/0"].forEach(arrive);
  expect(log.destroyed).toEqual([]);
  expect(new Set(log.requests).size).toBe(log.requests.length);
});

test("ensure resolves once its tiles are ready, requests them first and pins them", async () => {
  const { manager, log, arrive } = setup({ cacheSize: 1 });
  manager.want(tiles("4/0/0", "4/1/0", "4/2/0", "4/3/0"));
  arrive("4/0/0"); // requests 4/2/0
  let released = null;
  const ensured = manager.ensure(tiles("6/0/0", "6/0/1")).then((release) => (released = release));
  arrive("4/1/0");
  arrive("4/2/0");
  // The export's tiles jump ahead of the camera's 4/3/0
  expect(log.requests).toEqual(["4/0/0", "4/1/0", "4/2/0", "6/0/0", "6/0/1"]);
  arrive("6/0/0");
  expect(released).toBeNull();
  arrive("6/0/1");
  await ensured;
  manager.want(tiles("4/2/0"));
  expect(log.destroyed).not.toContain("6/0/0");
  released();
  expect(log.destroyed).toContain("6/0/0");
});

test("ensure rejects when a tile fails, releases its pins, and a new ensure retries", async () => {
  const { manager, log, arrive } = setup({ cacheSize: 0 });
  const ensured = manager.ensure(tiles("5/0/0", "5/1/0"));
  arrive("5/0/0");
  manager.fail(tile("5/1/0"), new Error("boom"));
  await expect(ensured).rejects.toThrow("boom");
  expect(log.destroyed).toContain("5/0/0");
  const again = manager.ensure(tiles("5/1/0"));
  expect(log.requests.filter((key) => key === "5/1/0")).toHaveLength(2);
  arrive("5/1/0");
  await expect(again).resolves.toBeTypeOf("function");
});

test("a failed tile is not requested again while wanted, but is once wanted again", () => {
  const { manager, log } = setup();
  manager.want(tiles("3/0/0"));
  manager.fail(tile("3/0/0"));
  manager.want(tiles("3/0/0", "3/1/0"));
  expect(log.requests).toEqual(["3/0/0", "3/1/0"]);
  manager.want(tiles("3/1/0"));
  manager.want(tiles("3/0/0"));
  expect(log.requests).toEqual(["3/0/0", "3/1/0", "3/0/0"]);
});

test("settled once every wanted tile has arrived or failed", () => {
  const { manager, arrive } = setup();
  expect(manager.settled).toBe(true);
  manager.want(tiles("1/0/0", "1/1/0"));
  expect(manager.settled).toBe(false);
  arrive("1/0/0");
  expect(manager.settled).toBe(false);
  manager.fail(tile("1/1/0"));
  expect(manager.settled).toBe(true);
});
