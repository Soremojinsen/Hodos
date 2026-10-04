import { showNotice } from "./notice.js";

/**
 * Copies the link, or shows it to copy by hand when the browser cannot.
 *
 * @param link       {string}
 * @param generated  {boolean} whether the map has edited names, which the link does not carry
 */
async function copy(link, generated) {
  try {
    await navigator.clipboard.writeText(link);
    showNotice(generated ? "notice.copiedGenerated" : "notice.copied", { long: generated });
  } catch {
    // No clipboard access (insecure page, refused permission, old browser)
    showNotice(generated ? "notice.copyThisGenerated" : "notice.copyThis", { link });
  }
}

/**
 * Connects the link button, which copies the link of the map as shown.
 *
 * @param urlSync   {{syncNow: function}} see url-sync.js
 * @param hasEdits  {function} whether the map has edited place names, which a link does not carry
 */
export function setupLinkButton(urlSync, hasEdits = () => false) {
  document.getElementById("copy-link-button").addEventListener("click", () => {
    // The address bar lags the map by a moment, see url-sync.js
    urlSync.syncNow();
    return copy(window.location.href, hasEdits());
  });
}
