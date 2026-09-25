import { DEFAULT_VIEW } from "../constants.js";
import { getRandomSeed } from "../generation/util.js";
import { t } from "../i18n/i18n.js";
import { MAX_SEED_LENGTH, serializeState } from "../state/url-state.js";
import { showNotice } from "./notice.js";

/**
 * Opens the map of a seed, with the current mode and grid and the default view.
 * This is a navigation: the browser's Back button returns to the previous map.
 *
 * @param urlSync  {{syncNow: function}} see url-sync.js: flushed first, so the address bar (and
 *                 so the page Back returns to) carries the latest pan even if it just happened.
 */
export function navigateToSeed(seed, currentState, urlSync) {
  urlSync.syncNow();
  const search = serializeState({ ...currentState(), ...DEFAULT_VIEW, seed });
  window.location.assign(`${window.location.pathname}${search}`);
}

/**
 * Connects the "Nouvelle carte" and "Copier le lien" buttons and the seed form.
 *
 * @param currentState  {function} returns the current state, see url-state.js
 * @param urlSync       {{syncNow: function}} see url-sync.js
 */
export function setupNavigation(currentState, urlSync) {
  document.getElementById("new-map-button").addEventListener("click", () => {
    navigateToSeed(getRandomSeed(), currentState, urlSync);
  });

  const form = document.getElementById("seed-form");
  const input = document.getElementById("seed");
  input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const seed = input.value;
    if (seed.length > MAX_SEED_LENGTH) {
      // Set once with t(): transient, cleared on the next "input" event above, and a
      // native validation message cannot carry a data-i18n hook to retranslate later.
      input.setCustomValidity(t("settings.seedTooLong", { max: MAX_SEED_LENGTH }));
      input.reportValidity();
      return;
    }
    navigateToSeed(seed === "" ? getRandomSeed() : seed, currentState, urlSync);
  });

  document.getElementById("copy-link-button").addEventListener("click", async () => {
    // The address bar lags the map by a moment, see url-sync.js
    urlSync.syncNow();
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      showNotice("notice.copied");
    } catch {
      // No clipboard access (insecure page, refused permission, old browser)
      showNotice("notice.copyThis", { link });
    }
  });
}
