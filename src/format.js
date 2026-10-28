// Number formats with locale separators. Pure, no DOM.
import { isError, numberToText } from './values.js';
import { roundHalfAway } from './functions.js';

/** Supported cell formats. */
export const FORMATS = Object.freeze(['general', 'fixed2', 'percent', 'thousands']);

const SEPARATORS = {
  en: { decimal: '.', group: ',', true: 'TRUE', false: 'FALSE' },
  tr: { decimal: ',', group: '.', true: 'DOĞRU', false: 'YANLIŞ' },
};

/**
 * Write a non-negative number with fixed decimals and optional grouping.
 * @param {number} n
 * @param {number} decimals
 * @param {boolean} group
 * @param {{decimal:string, group:string}} sep
 * @returns {string}
 */
function fixed(n, decimals, group, sep) {
  const [int, frac] = roundHalfAway(n, decimals).toFixed(decimals).split('.');
  const grouped = group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep.group) : int;
  return frac === undefined ? grouped : grouped + sep.decimal + frac;
}

/**
 * Up to `max` decimals, trailing zeros dropped.
 * @param {number} n
 * @param {number} max
 * @param {{decimal:string}} sep
 * @returns {string}
 */
function trimmed(n, max, sep) {
  return numberToText(roundHalfAway(n, max)).replace('.', sep.decimal);
}

/**
 * Display text of a value in a format and UI language.
 * English: 1,234.56 and 12.5%; Turkish: 1.234,56 and %12,5.
 * @param {import('./values.js').Value} value
 * @param {string} [format]  one of FORMATS
 * @param {'en'|'tr'} [lang]
 * @returns {string}
 */
export function formatValue(value, format = 'general', lang = 'en') {
  const sep = SEPARATORS[lang] ?? SEPARATORS.en;
  if (value === null) return '';
  if (isError(value)) return value.code;
  if (typeof value === 'boolean') return value ? sep.true : sep.false;
  if (typeof value === 'string') return value;
  if (!FORMATS.includes(format) || format === 'general') return generalNumber(value, sep);
  const abs = Math.abs(value);
  let body;
  if (format === 'percent') {
    const digits = trimmed(abs * 100, 2, sep);
    body = lang === 'tr' ? `%${digits}` : `${digits}%`;
  } else {
    body = fixed(abs, 2, format === 'thousands', sep);
  }
  return value < 0 && /[1-9]/.test(body) ? `-${body}` : body;
}

function generalNumber(n, sep) {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6).replace('.', sep.decimal);
  return trimmed(n, 10, sep);
}
