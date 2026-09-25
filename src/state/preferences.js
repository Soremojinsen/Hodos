/**
 * Personal preferences, kept in the browser. Storage can be unavailable (private mode, blocked
 * site data): reads then give null and writes are dropped.
 */
const PREFIX = "hodos.";

export function readPreference(name) {
  try {
    return localStorage.getItem(PREFIX + name);
  } catch {
    return null;
  }
}

export function writePreference(name, value) {
  try {
    localStorage.setItem(PREFIX + name, value);
  } catch {
    // Storage unavailable: the preference only lasts until the page is closed
  }
}
