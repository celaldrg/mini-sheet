// Rewriting references inside formula text: copy/fill offsets and row/column
// insert/delete. Pure, no DOM.
import { ROWS, COLS, inGrid, formatRef } from './refs.js';
import { tokenize } from './tokenizer.js';

/**
 * @typedef {{row:number,col:number,absRow:boolean,absCol:boolean}} Ref
 * @typedef {{ ref(r:Ref):Ref|null, range(a:Ref,b:Ref):[Ref,Ref]|null }} RefMapper
 */

/**
 * Rewrite every reference in a formula. A reference the mapper drops becomes #REF!.
 * Text that is not a formula, or does not tokenize, is returned unchanged.
 * @param {string} raw  cell content, formulas start with "="
 * @param {RefMapper} mapper
 * @returns {string}
 */
export function rewriteFormula(raw, mapper) {
  if (!raw.startsWith('=')) return raw;
  const body = raw.slice(1);
  let tokens;
  try {
    tokens = tokenize(body);
  } catch {
    return raw;
  }
  let out = '';
  let pos = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'ref') continue;
    const isRange = tokens[i + 1].type === 'colon' && tokens[i + 2]?.type === 'ref';
    const last = isRange ? tokens[i + 2] : t;
    out += body.slice(pos, t.start) + replacement(body, t, last, isRange, mapper);
    pos = last.end;
    if (isRange) i += 2;
  }
  return '=' + out + body.slice(pos);
}

function replacement(body, first, last, isRange, mapper) {
  if (isRange) {
    const pair = mapper.range(first, last);
    if (!pair) return '#REF!';
    if (sameRef(pair[0], first) && sameRef(pair[1], last)) return body.slice(first.start, last.end);
    return `${formatRef(pair[0])}:${formatRef(pair[1])}`;
  }
  const r = mapper.ref(first);
  if (!r) return '#REF!';
  return sameRef(r, first) ? body.slice(first.start, first.end) : formatRef(r);
}

function sameRef(a, b) {
  return a.row === b.row && a.col === b.col;
}

/**
 * Mapper that moves relative parts by an offset (copy, paste, fill).
 * Absolute parts stay; anything pushed off the grid is dropped.
 * @param {number} dRow
 * @param {number} dCol
 * @returns {RefMapper}
 */
export function offsetMapper(dRow, dCol) {
  const move = (r) => {
    const row = r.absRow ? r.row : r.row + dRow;
    const col = r.absCol ? r.col : r.col + dCol;
    return inGrid(row, col) ? { ...r, row, col } : null;
  };
  return {
    ref: move,
    range(a, b) {
      const x = move(a);
      const y = move(b);
      return x && y ? [x, y] : null;
    },
  };
}

/**
 * Shift relative references of a formula by an offset.
 * @param {string} raw
 * @param {number} dRow
 * @param {number} dCol
 * @returns {string}
 */
export function translateFormula(raw, dRow, dCol) {
  return rewriteFormula(raw, offsetMapper(dRow, dCol));
}

/**
 * Index and span rules along one axis for inserting `count` lines at `at`.
 * @param {number} at
 * @param {number} count
 * @param {number} size  grid size along this axis
 */
function insertAxis(at, count, size) {
  return {
    index: (i) => {
      const n = i >= at ? i + count : i;
      return n < size ? n : null;
    },
    span: (lo, hi) => {
      const nlo = lo >= at ? lo + count : lo;
      if (nlo >= size) return null;
      return [nlo, Math.min(hi >= at ? hi + count : hi, size - 1)];
    },
  };
}

/**
 * Index and span rules along one axis for deleting `count` lines from `at`.
 * @param {number} at
 * @param {number} count
 */
function deleteAxis(at, count) {
  const end = at + count;
  return {
    index: (i) => {
      if (i < at) return i;
      return i >= end ? i - count : null;
    },
    span: (lo, hi) => {
      if (lo >= at && hi < end) return null;
      const nlo = lo < at ? lo : Math.max(at, lo - count);
      const nhi = hi < at ? hi : hi < end ? at - 1 : hi - count;
      return [nlo, nhi];
    },
  };
}

/**
 * Wrap axis rules into a mapper acting on rows ('row') or columns ('col').
 * @param {'row'|'col'} field
 * @param {{index(i:number):number|null, span(lo:number,hi:number):[number,number]|null}} axis
 * @returns {RefMapper}
 */
function axisMapper(field, axis) {
  const valid = (r) => inGrid(r.row, r.col);
  return {
    ref(r) {
      if (!valid(r)) return null;
      const n = axis.index(r[field]);
      return n === null ? null : { ...r, [field]: n };
    },
    range(a, b) {
      if (!valid(a) || !valid(b)) return null;
      const swap = a[field] > b[field];
      const s = axis.span(Math.min(a[field], b[field]), Math.max(a[field], b[field]));
      if (!s) return null;
      const [lo, hi] = swap ? [s[1], s[0]] : s;
      return [{ ...a, [field]: lo }, { ...b, [field]: hi }];
    },
  };
}

/**
 * Mapper for inserting `count` rows before row `at` (0-based).
 * @param {number} at
 * @param {number} [count]
 * @returns {RefMapper}
 */
export function insertRowsMapper(at, count = 1) {
  return axisMapper('row', insertAxis(at, count, ROWS));
}

/**
 * Mapper for deleting `count` rows starting at row `at` (0-based).
 * @param {number} at
 * @param {number} [count]
 * @returns {RefMapper}
 */
export function deleteRowsMapper(at, count = 1) {
  return axisMapper('row', deleteAxis(at, count));
}

/**
 * Mapper for inserting `count` columns before column `at` (0-based).
 * @param {number} at
 * @param {number} [count]
 * @returns {RefMapper}
 */
export function insertColsMapper(at, count = 1) {
  return axisMapper('col', insertAxis(at, count, COLS));
}

/**
 * Mapper for deleting `count` columns starting at column `at` (0-based).
 * @param {number} at
 * @param {number} [count]
 * @returns {RefMapper}
 */
export function deleteColsMapper(at, count = 1) {
  return axisMapper('col', deleteAxis(at, count));
}
