<div align="center">
  <img src="./src/assets/img/HodosLogoColorInvert.png" width=600>
  <h1>Hodos</h1>
</div>

## An artistic procedural world map generator

Hodos is a simple client-side procedural world map generator running on JavaScript and WebGL. It combines both voronoïd cells and noise based algorithms to generate pseudo-random unique maps.

<div align="center">
  <img src="./docs/images/example.png" width=600>
</div>

A public instance is available at [hodos.soremo.me](https://hodos.soremo.me/).

_Hodos, voyagez avec audace !_

Hodos creates maps for your imagination to thrive.

## Features

- **Keep a map:** the address bar always holds the seed and the view, so a bookmark or a refresh brings the same map back.
- **Find a map:** _Nouvelle carte_ rolls a new seed, and the browser's Back button returns to the previous map. Any word or number can be a seed.
- **Share a map:** _Copier le lien_ copies a link to the map as you see it: seed, view, mode and grid.
- **Explore:** recenter and full-screen buttons; _Infos au survol_ shows the biome, relief and land mass under the pointer.
- **Grid:** a square or hexagonal grid over the map, with a size and an opacity, for games.
- **Export and print:** the whole world or the current view as a PNG up to 4096 px, or printed on 1, 2 × 2 or 3 × 3 A4 sheets.
- **Languages:** French and English, following the browser settings, with a switch in the settings.

### Link parameters

The same seed always produces the same map, and these parameters are kept stable.

| Parameter | Meaning                                                         | Default   |
| --------- | --------------------------------------------------------------- | --------- |
| `seed`    | the map seed, any text up to 200 characters                     | random    |
| `x`, `y`  | camera position, in world units from the centre (−5000 to 5000) | 0         |
| `z`       | zoom level (0 to 7)                                             | 1         |
| `mode`    | `default`, `biomes` or `debug`                                  | `default` |
| `grid`    | `square` or `hex`                                               | no grid   |
| `gs`      | grid cell size in world units (100 to 1000)                     | 250       |
| `go`      | grid opacity in percent (10 to 100)                             | 40        |

## Development

Requires Node.js 22.12 or later.

    npm install
    npm run dev            # dev server with live reload
    npm test               # unit tests (Vitest)
    npm run test:browser   # browser tests (Playwright, first run: npx playwright install chromium)
    npm run lint           # ESLint
    npm run format         # Prettier
    npm run format:check  # Prettier check, as in CI
    npm run build          # production build in dist/

The source is in `src/`: `generation/` builds the map data, `map/` renders it with WebGL, `overlay/` draws the grid, `export/` makes images and prints, `state/` reads and writes links and preferences, `i18n/` holds the French and English texts, and `ui/` wires the page controls.

## Deployment

Pushing to `master` runs the tests and deploys `dist/` to GitHub Pages
(repository Settings → Pages → Source: "GitHub Actions").
