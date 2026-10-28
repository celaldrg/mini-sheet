// Formula tokenizer. Pure, no DOM.
import { colIndex } from './refs.js';
import { ERROR_CODES } from './values.js';

/** Thrown when formula text cannot be read. */
export class FormulaSyntaxError extends Error {}

/**
 * @typedef {object} Token
 * @property {'num'|'str'|'bool'|'err'|'ref'|'name'|'op'|'lparen'|'rparen'|'comma'|'colon'|'eof'} type
 * @property {*} [value]
 * @property {number} start  offset of the first character
 * @property {number} end    offset after the last character
 * @property {number} [row]  0-based, for refs
 * @property {number} [col]  0-based, for refs
 * @property {boolean} [absRow]
 * @property {boolean} [absCol]
 */

const NUMBER_RE = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const WORD_RE = /[A-Za-z0-9_$.]+/y;
const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
const PUNCT = { '(': 'lparen', ')': 'rparen', ',': 'comma', ':': 'colon' };
const TWO_CHAR_OPS = ['<=', '>=', '<>'];
const ONE_CHAR_OPS = '+-*/^&=<>%';

/**
 * Split formula text (without the leading "=") into tokens.
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }
    const token = readToken(text, i);
    tokens.push(token);
    i = token.end;
  }
  tokens.push({ type: 'eof', start: text.length, end: text.length });
  return tokens;
}

/**
 * @param {string} text
 * @param {number} i
 * @returns {Token}
 */
function readToken(text, i) {
  const ch = text[i];
  if (/\d/.test(ch) || (ch === '.' && /\d/.test(text[i + 1] ?? ''))) return readNumber(text, i);
  if (ch === '"') return readString(text, i);
  if (ch === '#') return readError(text, i);
  if (PUNCT[ch]) return { type: PUNCT[ch], start: i, end: i + 1 };
  const two = text.slice(i, i + 2);
  if (TWO_CHAR_OPS.includes(two)) return { type: 'op', value: two, start: i, end: i + 2 };
  if (ONE_CHAR_OPS.includes(ch)) return { type: 'op', value: ch, start: i, end: i + 1 };
  if (/[A-Za-z_$]/.test(ch)) return readWord(text, i);
  throw new FormulaSyntaxError(`Unexpected character "${ch}"`);
}

function readNumber(text, i) {
  NUMBER_RE.lastIndex = i;
  const m = NUMBER_RE.exec(text);
  return { type: 'num', value: Number(m[0]), start: i, end: i + m[0].length };
}

function readString(text, i) {
  let value = '';
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '"') {
      if (text[j + 1] !== '"') return { type: 'str', value, start: i, end: j + 1 };
      value += '"';
      j += 2;
    } else {
      value += text[j];
      j += 1;
    }
  }
  throw new FormulaSyntaxError('Unterminated string');
}

function readError(text, i) {
  const upper = text.slice(i).toUpperCase();
  const code = ERROR_CODES.find((c) => upper.startsWith(c));
  if (!code) throw new FormulaSyntaxError('Unknown error literal');
  return { type: 'err', value: code, start: i, end: i + code.length };
}

function readWord(text, i) {
  WORD_RE.lastIndex = i;
  const word = WORD_RE.exec(text)[0];
  const end = i + word.length;
  const m = REF_RE.exec(word);
  if (m && nextNonSpace(text, end) !== '(') {
    return {
      type: 'ref',
      start: i,
      end,
      absCol: m[1] === '$',
      col: colIndex(m[2]),
      absRow: m[3] === '$',
      row: Number(m[4]) - 1,
    };
  }
  if (word.includes('$')) throw new FormulaSyntaxError(`Bad reference "${word}"`);
  const upper = word.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') {
    if (nextNonSpace(text, end) !== '(') return { type: 'bool', value: upper === 'TRUE', start: i, end };
  }
  return { type: 'name', value: upper, start: i, end };
}

function nextNonSpace(text, i) {
  let j = i;
  while (j < text.length && /\s/.test(text[j])) j += 1;
  return text[j];
}
