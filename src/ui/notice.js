import { applyTranslations } from "./language.js";

const SHORT_DELAY = 2000;
const LINK_DELAY = 10000;

let timer = null;

/**
 * Shows a short message over the map.
 *
 * @param key         {string} the translation key of the message
 * @param options.link {string} a link to show in a selected field, to copy by hand
 */
export function showNotice(key, { link } = {}) {
  const notice = document.getElementById("notice");
  const text = notice.querySelector(".notice-text");
  const field = notice.querySelector(".notice-link");
  text.dataset.i18n = key;
  applyTranslations(text);
  field.hidden = !link;
  notice.hidden = false;
  if (link) {
    field.value = link;
    field.focus();
    field.select();
  }
  clearTimeout(timer);
  timer = setTimeout(() => (notice.hidden = true), link ? LINK_DELAY : SHORT_DELAY);
}
