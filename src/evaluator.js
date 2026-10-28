// Formula evaluation over an AST. Pure, no DOM.
import { inGrid } from './refs.js';
import { ERRORS, errorFromCode, isError, toNumber, toText, compareValues } from './values.js';
import { FUNCTIONS } from './functions.js';

/**
 * @typedef {import('./values.js').Value} Value
 * @typedef {import('./parser.js').Node} Node
 * @typedef {{ getValue(row:number, col:number): Value }} EvalContext
 */

/**
 * Evaluate an AST to a single value. A multi-cell range in a scalar place is #VALUE!.
 * @param {Node} node
 * @param {EvalContext} ctx
 * @returns {Value}
 */
export function evaluate(node, ctx) {
  switch (node.type) {
    case 'num':
    case 'str':
    case 'bool':
      return node.value;
    case 'err':
      return errorFromCode(node.code);
    case 'name':
      return ERRORS.NAME;
    case 'ref':
      return inGrid(node.row, node.col) ? ctx.getValue(node.row, node.col) : ERRORS.REF;
    case 'range':
      return rangeAsScalar(readRange(node, ctx));
    case 'unary':
      return evalUnary(node, ctx);
    case 'percent': {
      const n = toNumber(evaluate(node.arg, ctx));
      return isError(n) ? n : n / 100;
    }
    case 'binary':
      return evalBinary(node, ctx);
    case 'call':
      return evalCall(node, ctx);
    default:
      return ERRORS.VALUE;
  }
}

/**
 * Values of a ref or range node as rows of cells, or #REF! when off the grid.
 * @param {Node} node
 * @param {EvalContext} ctx
 * @returns {Value[][]|import('./values.js').SheetError}
 */
export function readRange(node, ctx) {
  const a = node.type === 'range' ? node.start : node;
  const b = node.type === 'range' ? node.end : node;
  if (!inGrid(a.row, a.col) || !inGrid(b.row, b.col)) return ERRORS.REF;
  const rows = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1) {
    const row = [];
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c += 1) row.push(ctx.getValue(r, c));
    rows.push(row);
  }
  return rows;
}

function rangeAsScalar(grid) {
  if (isError(grid)) return grid;
  return grid.length === 1 && grid[0].length === 1 ? grid[0][0] : ERRORS.VALUE;
}

function evalUnary(node, ctx) {
  const n = toNumber(evaluate(node.arg, ctx));
  if (isError(n)) return n;
  return node.op === '-' ? -n : n;
}

const ARITHMETIC = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? ERRORS.DIV0 : a / b),
  '^': (a, b) => a ** b,
};

const COMPARE = {
  '=': (c) => c === 0,
  '<>': (c) => c !== 0,
  '<': (c) => c < 0,
  '>': (c) => c > 0,
  '<=': (c) => c <= 0,
  '>=': (c) => c >= 0,
};

function evalBinary(node, ctx) {
  const left = evaluate(node.left, ctx);
  if (isError(left)) return left;
  const right = evaluate(node.right, ctx);
  if (isError(right)) return right;
  if (node.op === '&') return toText(left) + toText(right);
  if (COMPARE[node.op]) return COMPARE[node.op](compareValues(left, right));
  const a = toNumber(left);
  if (isError(a)) return a;
  const b = toNumber(right);
  if (isError(b)) return b;
  const result = ARITHMETIC[node.op](a, b);
  if (isError(result)) return result;
  return Number.isFinite(result) ? result : ERRORS.VALUE;
}

function evalCall(node, ctx) {
  const fn = FUNCTIONS[node.name];
  if (!fn) return ERRORS.NAME;
  const count = node.args.length;
  if (count < fn.min || count > fn.max) return ERRORS.VALUE;
  return fn.run(node.args, makeApi(ctx));
}

/**
 * Helpers handed to function implementations.
 * @param {EvalContext} ctx
 */
function makeApi(ctx) {
  const isRefNode = (n) => n.type === 'ref' || n.type === 'range';
  return {
    /** @param {Node} n */
    scalar: (n) => evaluate(n, ctx),
    /** @param {Node} n */
    grid(n) {
      if (isRefNode(n)) return readRange(n, ctx);
      const v = evaluate(n, ctx);
      return isError(v) ? v : [[v]];
    },
    /**
     * Flat list of argument values; `ref` tells whether they came from cells.
     * @param {Node} n
     */
    items(n) {
      if (!isRefNode(n)) return [{ value: evaluate(n, ctx), ref: false }];
      const grid = readRange(n, ctx);
      if (isError(grid)) return [{ value: grid, ref: true }];
      return grid.flat().map((value) => ({ value, ref: true }));
    },
  };
}
