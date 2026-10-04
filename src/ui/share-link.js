import { applyTranslations } from "./language.js";
import { showNotice } from "./notice.js";

/**
 * Whether the link button shares rather than copies: on a phone or a tablet with a share sheet.
 * Computers that have one too keep copying, which is what a desk wants.
 */
const sharesLink = () =>
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

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
 * Shares the link through the share sheet. A share that fails copies the link instead, so it
 * always gets out. A sheet closed without sharing is no failure.
 *
 * @param link       {string}
 * @param generated  {boolean} whether the map has edited names, which the link does not carry
 */
async function share(link, generated) {
  try {
    await navigator.share({ url: link });
  } catch (error) {
    if (error?.name !== "AbortError") await copy(link, generated);
    return;
  }
  // The sheet confirms the share itself: only the names it leaves out are worth a notice
  if (generated) showNotice("notice.sharedGenerated", { long: true });
}

/**
 * Connects the link button: it shares the link of the map as shown on a phone or a tablet, and
 * copies it elsewhere. Its label says which, chosen once at load.
 *
 * @param urlSync   {{syncNow: function}} see url-sync.js
 * @param hasEdits  {function} whether the map has edited place names, which a link does not carry
 */
export function setupLinkButton(urlSync, hasEdits = () => false) {
  const button = document.getElementById("copy-link-button");
  const shares = sharesLink();
  if (shares) {
    button.dataset.i18n = "footer.share";
    applyTranslations(button);
  }
  button.addEventListener("click", () => {
    // The address bar lags the map by a moment, see url-sync.js
    urlSync.syncNow();
    return (shares ? share : copy)(window.location.href, hasEdits());
  });
}
