// The only place that touches localStorage. Every access is guarded so a
// private window or blocked storage never breaks the app.

const PREFIX = 'mini-sheet:';

/**
 * Read a JSON value, or the fallback when missing or unreadable.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function loadItem(key, fallback) {
  try {
    const text = globalThis.localStorage.getItem(PREFIX + key);
    return text === null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * Save a JSON value.
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean} whether it was saved
 */
export function saveItem(key, value) {
  try {
    globalThis.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
