// Cell addresses, keys and ranges. Pure helpers, no DOM.

/** Number of rows in the grid. */
export const ROWS = 100;
/** Number of columns in the grid (A-Z). */
export const COLS = 26;

/**
 * Turn a 0-based column index into letters (0 -> "A", 26 -> "AA").
 * @param {number} col
 * @returns {string}
 */
export function colName(col) {
  let name = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Turn column letters into a 0-based index ("A" -> 0, "AA" -> 26).
 * @param {string} letters
 * @returns {number}
 */
export function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * True when the 0-based position lies on the grid.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function inGrid(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/**
 * Integer key of a cell.
 * @param {number} row
 * @param {number} col
 * @returns {number}
 */
export function cellKey(row, col) {
  return row * COLS + col;
}

/**
 * Inverse of cellKey.
 * @param {number} key
 * @returns {{row:number,col:number}}
 */
export function keyToCell(key) {
  return { row: Math.floor(key / COLS), col: key % COLS };
}

/**
 * Address text of a cell ("B3").
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
export function addressName(row, col) {
  return colName(col) + (row + 1);
}

/**
 * Parse an on-grid address like "B3" or "$B$3".
 * @param {string} text
 * @returns {{row:number,col:number}|null}
 */
export function parseAddress(text) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(text).trim());
  if (!m) return null;
  const row = Number(m[2]) - 1;
  const col = colIndex(m[1]);
  return inGrid(row, col) ? { row, col } : null;
}

/**
 * Write a reference with its absolute markers ("$A1").
 * @param {{row:number,col:number,absRow?:boolean,absCol?:boolean}} ref
 * @returns {string}
 */
export function formatRef(ref) {
  return (ref.absCol ? '$' : '') + colName(ref.col) + (ref.absRow ? '$' : '') + (ref.row + 1);
}

/**
 * @typedef {{top:number,left:number,bottom:number,right:number}} Range
 */

/**
 * Build a normalized range from two corners.
 * @param {number} r1
 * @param {number} c1
 * @param {number} r2
 * @param {number} c2
 * @returns {Range}
 */
export function makeRange(r1, c1, r2 = r1, c2 = c1) {
  return {
    top: Math.min(r1, r2),
    left: Math.min(c1, c2),
    bottom: Math.max(r1, r2),
    right: Math.max(c1, c2),
  };
}

/**
 * Parse "A1:B5" (or a single address) into a range.
 * @param {string} text
 * @returns {Range|null}
 */
export function parseRange(text) {
  const parts = String(text).split(':');
  if (parts.length > 2) return null;
  const a = parseAddress(parts[0]);
  const b = parseAddress(parts[1] ?? parts[0]);
  return a && b ? makeRange(a.row, a.col, b.row, b.col) : null;
}

/**
 * Address text of a range ("A1:B5", or "A1" for a single cell).
 * @param {Range} range
 * @returns {string}
 */
export function rangeName(range) {
  const a = addressName(range.top, range.left);
  const b = addressName(range.bottom, range.right);
  return a === b ? a : `${a}:${b}`;
}
