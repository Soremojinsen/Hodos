window.addEventListener("resize", resize);

/**
 * The main map object
 */
const worldMap = new WorldMap(document.getElementById("map"), getSeedFromURL());

worldMap
  .load()
  .then(() => {
    resize();
    console.log("Map loaded");
    worldMap.startRender();
    worldMap.controller.zoom(1);
  })
  .then(() => {
    let seed = worldMap.generator.seed;
    for (let element of document.getElementsByClassName("seed-placeholder")) {
      element.value = seed;
    }
  });

  $("#default-toggle").prop("checked", true);