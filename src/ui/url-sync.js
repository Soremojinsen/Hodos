import { serializeState } from "../state/url-state.js";

/**
 * How long the map must stay still before the address bar is updated, in milliseconds.
 */
const DELAY = 300;

/**
 * Keeps the address bar in sync with the map, without adding history entries:
 * a refresh or a bookmark brings back the same map, view, mode, grid and place names.
 *
 * @param renderer      {MapRenderer} every drawn frame may have changed the state
 * @param currentState  {function} returns the state to write, see url-state.js
 * @returns {{syncNow: function}} writes the address bar right away
 */
export function startUrlSync(renderer, currentState) {
  let timer = null;
  // The state of the last frame, as a query string
  let lastSearch = null;
  const syncNow = () => {
    clearTimeout(timer);
    timer = null;
    const search = serializeState(currentState());
    if (search !== window.location.search) {
      const { pathname, hash } = window.location;
      history.replaceState(history.state, "", `${pathname}${search}${hash}`);
    }
  };
  renderer.addFrameListener(() => {
    // Frames that change nothing the link carries (like arriving tiles, which can keep coming
    // for seconds on a slow machine) must not push the update back
    const search = serializeState(currentState());
    if (search === lastSearch) return;
    lastSearch = search;
    clearTimeout(timer);
    timer = setTimeout(syncNow, DELAY);
  });
  // Catches any pending debounce (or a caller that forgot to flush) when the page is
  // navigated away from or closed, so the last pan is never lost.
  window.addEventListener("pagehide", syncNow);
  return { syncNow };
}
