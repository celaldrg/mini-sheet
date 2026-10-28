// Built-in formula functions. Pure, no DOM.
import { ERRORS, isError, toNumber, toText, toBool, compareValues, parseNumber } from './values.js';

/**
 * @typedef {import('./values.js').Value} Value
 * @typedef {{ scalar(n:object):Value, grid(n:object):Value[][]|import('./values.js').SheetError,
 *   items(n:object):Array<{value:Value, ref:boolean}> }} Api
 * @typedef {{ min:number, max:number, run(args:object[], api:Api):Value }} FunctionDef
 */

/**
 * Numbers of all arguments. Cells only contribute numbers; literals are coerced.
 * @returns {number[]|import('./values.js').SheetError}
 */
function numbers(args, api) {
  const out = [];
  for (const arg of args) {
    for (const { value, ref } of api.items(arg)) {
      if (isError(value)) return value;
      if (ref) {
        if (typeof value === 'number') out.push(value);
      } else {
        const n = toNumber(value);
        if (isError(n)) return n;
        out.push(n);
      }
    }
  }
  return out;
}

/** Wrap a function of a number list. */
function overNumbers(fn) {
  return {
    min: 1,
    max: 255,
    run(args, api) {
      const list = numbers(args, api);
      return isError(list) ? list : fn(list);
    },
  };
}

/** Wrap a function of fixed scalar numeric arguments. */
function numeric(min, max, fn) {
  return {
    min,
    max,
    run(args, api) {
      const ns = [];
      for (const a of args) {
        const n = toNumber(api.scalar(a));
        if (isError(n)) return n;
        ns.push(n);
      }
      const r = fn(...ns);
      return typeof r === 'number' && !Number.isFinite(r) ? ERRORS.VALUE : r;
    },
  };
}

/** Wrap a text function: first argument as text, the rest as numbers. */
function textual(min, max, fn) {
  return {
    min,
    max,
    run(args, api) {
      const text = toText(api.scalar(args[0]));
      if (isError(text)) return text;
      const ns = [];
      for (const a of args.slice(1)) {
        const n = toNumber(api.scalar(a));
        if (isError(n)) return n;
        ns.push(Math.trunc(n));
      }
      return fn(text, ...ns);
    },
  };
}

/** Booleans of all arguments; text and blanks in cells are skipped. */
function logicals(args, api) {
  const out = [];
  for (const arg of args) {
    for (const { value, ref } of api.items(arg)) {
      if (isError(value)) return value;
      if (ref && (value === null || typeof value === 'string')) continue;
      const b = toBool(value);
      if (isError(b)) return b;
      out.push(b);
    }
  }
  return out.length ? out : ERRORS.VALUE;
}

/**
 * Round half away from zero to `digits` decimals (negative digits allowed).
 * @param {number} x
 * @param {number} [digits]
 * @returns {number}
 */
export function roundHalfAway(x, digits = 0) {
  const d = Math.trunc(digits);
  const f = 10 ** Math.abs(d);
  const scaled = d >= 0 ? Math.abs(x) * f : Math.abs(x) / f;
  const rounded = Math.round(Number(scaled.toPrecision(15)));
  const back = d >= 0 ? rounded / f : rounded * f;
  return x < 0 ? -back : back;
}

/**
 * Build a predicate from a SUMIF/COUNTIF criterion such as 5, ">3", "<>x" or "a*".
 * @param {Value} criterion
 * @returns {(v:Value)=>boolean}
 */
export function makeCriterion(criterion) {
  if (typeof criterion !== 'string') {
    return (v) => v !== null && !isError(v) && compareValues(v, criterion) === 0;
  }
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criterion);
  const op = m[1] || '=';
  const operand = m[2];
  if (operand === '') return op === '<>' ? (v) => v !== null && v !== '' : (v) => v === null || v === '';
  const num = parseNumber(operand);
  if (num !== null) return numberCriterion(op, num);
  return textCriterion(op, operand);
}

function numberCriterion(op, num) {
  const test = {
    '=': (c) => c === 0, '<>': (c) => c !== 0, '<': (c) => c < 0,
    '>': (c) => c > 0, '<=': (c) => c <= 0, '>=': (c) => c >= 0,
  }[op];
  return (v) => (typeof v === 'number' ? test(compareValues(v, num)) : op === '<>');
}

function textCriterion(op, operand) {
  if (op === '=' || op === '<>') {
    const re = wildcardRegExp(operand);
    const eq = (v) => typeof v === 'string' && re.test(v);
    return op === '=' ? eq : (v) => !eq(v);
  }
  const lower = operand.toLowerCase();
  const test = { '<': (c) => c < 0, '>': (c) => c > 0, '<=': (c) => c <= 0, '>=': (c) => c >= 0 }[op];
  return (v) => typeof v === 'string' && test(compareValues(v.toLowerCase(), lower));
}

function wildcardRegExp(pattern) {
  const body = pattern
    .split('')
    .map((ch) => {
      if (ch === '*') return '[\\s\\S]*';
      if (ch === '?') return '[\\s\\S]';
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`, 'i');
}

function sumIf(args, api) {
  const range = api.grid(args[0]);
  if (isError(range)) return range;
  const crit = api.scalar(args[1]);
  if (isError(crit)) return crit;
  const sumGrid = args[2] ? api.grid(args[2]) : range;
  if (isError(sumGrid)) return sumGrid;
  const match = makeCriterion(crit);
  let total = 0;
  for (let r = 0; r < range.length; r += 1) {
    for (let c = 0; c < range[r].length; c += 1) {
      if (!match(range[r][c])) continue;
      const v = sumGrid[r]?.[c] ?? null;
      if (isError(v)) return v;
      if (typeof v === 'number') total += v;
    }
  }
  return total;
}

function countIf(args, api) {
  const range = api.grid(args[0]);
  if (isError(range)) return range;
  const crit = api.scalar(args[1]);
  if (isError(crit)) return crit;
  const match = makeCriterion(crit);
  return range.flat().filter(match).length;
}

function vlookup(args, api) {
  const key = api.scalar(args[0]);
  if (isError(key)) return key;
  const table = api.grid(args[1]);
  if (isError(table)) return table;
  const col = toNumber(api.scalar(args[2]));
  if (isError(col)) return col;
  const index = Math.trunc(col);
  if (index < 1) return ERRORS.VALUE;
  if (index > table[0].length) return ERRORS.REF;
  const row = table.find((r) => r[0] !== null && !isError(r[0]) && compareValues(r[0], key) === 0);
  return row ? row[index - 1] : ERRORS.NA;
}

function ifFn(args, api) {
  const cond = toBool(api.scalar(args[0]));
  if (isError(cond)) return cond;
  if (cond) return api.scalar(args[1]);
  return args.length > 2 ? api.scalar(args[2]) : false;
}

function count(args, api) {
  let n = 0;
  for (const arg of args) {
    for (const { value, ref } of api.items(arg)) {
      if (typeof value === 'number') n += 1;
      else if (!ref && !isError(value) && !isError(toNumber(value))) n += 1;
    }
  }
  return n;
}

function countA(args, api) {
  let n = 0;
  for (const arg of args) {
    for (const { value, ref } of api.items(arg)) if (!ref || value !== null) n += 1;
  }
  return n;
}

function concat(args, api) {
  let out = '';
  for (const arg of args) {
    for (const { value } of api.items(arg)) {
      const t = toText(value);
      if (isError(t)) return t;
      out += t;
    }
  }
  return out;
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

/** @type {Record<string, FunctionDef>} */
export const FUNCTIONS = Object.freeze({
  SUM: overNumbers(sum),
  AVERAGE: overNumbers((l) => (l.length ? sum(l) / l.length : ERRORS.DIV0)),
  MIN: overNumbers((l) => (l.length ? Math.min(...l) : 0)),
  MAX: overNumbers((l) => (l.length ? Math.max(...l) : 0)),
  COUNT: { min: 1, max: 255, run: count },
  COUNTA: { min: 1, max: 255, run: countA },
  ROUND: numeric(1, 2, (x, d = 0) => roundHalfAway(x, d)),
  ABS: numeric(1, 1, Math.abs),
  SQRT: numeric(1, 1, (x) => (x < 0 ? ERRORS.VALUE : Math.sqrt(x))),
  POWER: numeric(2, 2, (a, b) => a ** b),
  MOD: numeric(2, 2, (a, b) => (b === 0 ? ERRORS.DIV0 : a - b * Math.floor(a / b))),
  IF: { min: 2, max: 3, run: ifFn },
  AND: { min: 1, max: 255, run: (args, api) => { const l = logicals(args, api); return isError(l) ? l : l.every(Boolean); } },
  OR: { min: 1, max: 255, run: (args, api) => { const l = logicals(args, api); return isError(l) ? l : l.some(Boolean); } },
  NOT: { min: 1, max: 1, run: (args, api) => { const b = toBool(api.scalar(args[0])); return isError(b) ? b : !b; } },
  CONCAT: { min: 1, max: 255, run: concat },
  LEN: textual(1, 1, (t) => t.length),
  UPPER: textual(1, 1, (t) => t.toUpperCase()),
  LOWER: textual(1, 1, (t) => t.toLowerCase()),
  TRIM: textual(1, 1, (t) => t.trim().replace(/ {2,}/g, ' ')),
  LEFT: textual(1, 2, (t, n = 1) => (n < 0 ? ERRORS.VALUE : t.slice(0, n))),
  RIGHT: textual(1, 2, (t, n = 1) => (n < 0 ? ERRORS.VALUE : n === 0 ? '' : t.slice(-n))),
  MID: textual(3, 3, (t, start, n) => (start < 1 || n < 0 ? ERRORS.VALUE : t.slice(start - 1, start - 1 + n))),
  SUMIF: { min: 2, max: 3, run: sumIf },
  COUNTIF: { min: 2, max: 2, run: countIf },
  VLOOKUP: { min: 3, max: 4, run: vlookup },
});
