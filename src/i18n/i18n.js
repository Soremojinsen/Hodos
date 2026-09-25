import en from "./en.js";
import fr from "./fr.js";

/**
 * The texts of every language, by key.
 */
export const DICTIONARIES = { fr, en };

export const LANGUAGES = Object.keys(DICTIONARIES);

let current = "fr";

/**
 * Picks the interface language: the saved choice if valid, otherwise the first French or English
 * browser language, otherwise English.
 *
 * @param saved             {string|null} the saved choice
 * @param browserLanguages  {string[]|undefined} navigator.languages
 * @returns {string} "fr" or "en"
 */
export const detectLanguage = (saved, browserLanguages) => {
  if (LANGUAGES.includes(saved)) return saved;
  for (const language of browserLanguages ?? []) {
    const code = String(language).toLowerCase();
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("en")) return "en";
  }
  return "en";
};

export const getLanguage = () => current;

export const setLanguage = (language) => {
  if (!LANGUAGES.includes(language)) throw new Error(`Unknown language "${language}"`);
  current = language;
};

/**
 * Replaces the {name} parameters of a text. Unknown parameters are left as they are.
 */
export const format = (text, params = {}) =>
  text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));

/**
 * The text of a key in the current language, falling back to French, then to the key itself.
 */
export const t = (key, params = {}) => {
  let text = DICTIONARIES[current][key];
  if (text === undefined) {
    text = DICTIONARIES.fr[key];
    if (text === undefined) {
      console.warn(`Missing translation "${key}"`);
      return key;
    }
    console.warn(`Missing ${current} translation "${key}"`);
  }
  return format(text, params);
};
