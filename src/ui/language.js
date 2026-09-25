import { detectLanguage, getLanguage, setLanguage, t } from "../i18n/i18n.js";
import { readPreference, writePreference } from "../state/preferences.js";

/**
 * data-i18n-* attributes that translate an attribute of their element.
 */
const ATTRIBUTES = {
  "data-i18n-aria-label": "aria-label",
  "data-i18n-alt": "alt",
  "data-i18n-placeholder": "placeholder",
  "data-i18n-title": "title",
  "data-i18n-content": "content",
};

const SELECTOR = [
  "[data-i18n]",
  "[data-i18n-html]",
  ...Object.keys(ATTRIBUTES).map((a) => `[${a}]`),
].join(", ");

const paramsOf = (element) => {
  try {
    return JSON.parse(element.dataset.i18nParams ?? "{}");
  } catch {
    return {};
  }
};

/**
 * Translates an element and its descendants from their data-i18n* attributes.
 * Elements whose text is set at runtime set these attributes, then call this, so a language switch
 * translates them again.
 *
 * @param root {Document|Element}
 */
export function applyTranslations(root = document) {
  const elements = [...root.querySelectorAll(SELECTOR)];
  if (root instanceof Element && root.matches(SELECTOR)) elements.push(root);
  for (const element of elements) {
    const params = paramsOf(element);
    if (element.dataset.i18n) element.textContent = t(element.dataset.i18n, params);
    if (element.dataset.i18nHtml) element.innerHTML = t(element.dataset.i18nHtml, params);
    for (const [data, attribute] of Object.entries(ATTRIBUTES)) {
      const key = element.getAttribute(data);
      if (key) element.setAttribute(attribute, t(key, params));
    }
  }
}

function applyLanguage() {
  document.documentElement.lang = getLanguage();
  applyTranslations(document);
  const select = document.getElementById("language-select");
  if (select) select.value = getLanguage();
}

/**
 * Picks the language (saved choice, then browser settings) and translates the page.
 * Call it before anything can display text.
 */
export function initLanguage() {
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  setLanguage(detectLanguage(readPreference("lang"), browserLanguages));
  applyLanguage();
}

/**
 * Changes the language, remembers it and translates the page in place.
 */
export function switchLanguage(language) {
  setLanguage(language);
  writePreference("lang", language);
  applyLanguage();
}

/**
 * Connects the language select of the settings dialog.
 */
export function setupLanguageSwitch() {
  const select = document.getElementById("language-select");
  select.value = getLanguage();
  select.addEventListener("change", () => switchLanguage(select.value));
}
