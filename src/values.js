// Cell values, errors and coercion rules. Pure, no DOM.

/** An error value such as #DIV/0!. Instances are shared singletons. */
export class SheetError {
  /** @param {string} code */
  constructor(code) {
    this.code = code;
    Object.freeze(this);
  }

  /** @returns {string} */
  toString() {
    return this.code;
  }
}

/** All error values the engine produces. */
export const ERRORS = Object.freeze({
  DIV0: new SheetError('#DIV/0!'),
  REF: new SheetError('#REF!'),
  NAME: new SheetError('#NAME?'),
  VALUE: new SheetError('#VALUE!'),
  NA: new SheetError('#N/A'),
  CYCLE: new SheetError('#CYCLE!'),
});

/** Error codes, longest first so a tokenizer can match greedily. */
export const ERROR_CODES = Object.values(ERRORS)
  .map((e) => e.code)
  .sort((a, b) => b.length - a.length);

/**
 * The shared error value for a code.
 * @param {string} code
 * @returns {SheetError}
 */
export function errorFromCode(code) {
  return Object.values(ERRORS).find((e) => e.code === code) ?? ERRORS.VALUE;
}

/**
 * @param {unknown} v
 * @returns {v is SheetError}
 */
export function isError(v) {
  return v instanceof SheetError;
}

/** @typedef {number|string|boolean|null|SheetError} Value */

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i;

/**
 * Read a number written as text ("12", "-1.5e3", "50%"), or null.
 * @param {string} text
 * @returns {number|null}
 */
export function parseNumber(text) {
  const t = text.trim();
  if (!NUMBER_RE.test(t)) return null;
  if (t.endsWith('%')) return Number(t.slice(0, -1)) / 100;
  return Number(t);
}

/**
 * Value of a typed (non-formula) cell entry.
 * @param {string} raw
 * @returns {Value}
 */
export function parseInput(raw) {
  const text = String(raw ?? '');
  if (text.trim() === '') return null;
  const n = parseNumber(text);
  if (n !== null) return n;
  const up = text.trim().toUpperCase();
  if (up === 'TRUE') return true;
  if (up === 'FALSE') return false;
  return text;
}

/**
 * Plain text of a number without float noise (0.1+0.2 -> "0.3").
 * @param {number} n
 * @returns {string}
 */
export function numberToText(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

/**
 * Coerce to a number; errors pass through, bad text is #VALUE!.
 * @param {Value} v
 * @returns {number|SheetError}
 */
export function toNumber(v) {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isError(v)) return v;
  const n = parseNumber(v);
  return n === null ? ERRORS.VALUE : n;
}

/**
 * Coerce to text; errors pass through.
 * @param {Value} v
 * @returns {string|SheetError}
 */
export function toText(v) {
  if (v === null) return '';
  if (typeof v === 'number') return numberToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Coerce to a boolean; errors pass through, other text is #VALUE!.
 * @param {Value} v
 * @returns {boolean|SheetError}
 */
export function toBool(v) {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isError(v)) return v;
  const up = v.trim().toUpperCase();
  if (up === 'TRUE') return true;
  if (up === 'FALSE') return false;
  return ERRORS.VALUE;
}

const TYPE_RANK = { number: 0, string: 1, boolean: 2 };

/**
 * Compare two non-error values: numbers < text < booleans, text ignores case.
 * An empty value acts as 0, "" or FALSE depending on the other side.
 * @param {Value} a
 * @param {Value} b
 * @returns {-1|0|1}
 */
export function compareValues(a, b) {
  const x = a === null ? blankLike(b) : a;
  const y = b === null ? blankLike(a) : b;
  const tx = TYPE_RANK[typeof x];
  const ty = TYPE_RANK[typeof y];
  if (tx !== ty) return tx < ty ? -1 : 1;
  const p = typeof x === 'string' ? x.toLowerCase() : Number(x);
  const q = typeof y === 'string' ? y.toLowerCase() : Number(y);
  if (p === q) return 0;
  return p < q ? -1 : 1;
}

/** @param {Value} other */
function blankLike(other) {
  if (typeof other === 'string') return '';
  if (typeof other === 'boolean') return false;
  return 0;
}
