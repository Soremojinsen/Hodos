import { serializeState } from "../state/url-state.js";

/**
 * How long the map must stay still before the address bar is updated, in milliseconds.
 */
const DELAY = 300;

/**
 * Keeps the address bar in sync with the map, without adding history entries:
 * a refresh or a bookmark brings back the same map, view, mode and grid.
 *
 * @param renderer      {MapRenderer} every drawn frame may have changed the state
 * @param currentState  {function} returns the state to write, see url-state.js
 * @returns {{syncNow: function}} writes the address bar right away
 */
export function startUrlSync(renderer, currentState) {
  let timer = null;
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
    clearTimeout(timer);
    timer = setTimeout(syncNow, DELAY);
  });
  // Catches any pending debounce (or a caller that forgot to flush) when the page is
  // navigated away from or closed, so the last pan is never lost.
  window.addEventListener("pagehide", syncNow);
  return { syncNow };
}
