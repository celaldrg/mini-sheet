// Recursive-descent formula parser producing a small AST. Pure, no DOM.
import { tokenize, FormulaSyntaxError } from './tokenizer.js';

/**
 * @typedef {object} Node
 * @property {'num'|'str'|'bool'|'err'|'ref'|'range'|'unary'|'percent'|'binary'|'call'|'name'} type
 */

const COMPARE_OPS = ['=', '<>', '<', '>', '<=', '>='];

/**
 * Parse formula text (without the leading "=").
 * Precedence, loosest first: comparison, &, + -, * /, ^ (right-assoc), unary -, %.
 * @param {string} text
 * @returns {Node}
 * @throws {FormulaSyntaxError}
 */
export function parseFormula(text) {
  const p = new Parser(tokenize(text));
  const node = p.comparison();
  if (p.peek().type !== 'eof') throw new FormulaSyntaxError('Unexpected input after formula');
  return node;
}

/**
 * Every cell reference and range in an AST.
 * @param {Node} node
 * @param {Array<Node>} [out]
 * @returns {Array<Node>} ref and range nodes
 */
export function collectRefs(node, out = []) {
  if (node.type === 'ref' || node.type === 'range') out.push(node);
  else if (node.type === 'unary' || node.type === 'percent') collectRefs(node.arg, out);
  else if (node.type === 'binary') {
    collectRefs(node.left, out);
    collectRefs(node.right, out);
  } else if (node.type === 'call') node.args.forEach((a) => collectRefs(a, out));
  return out;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  isOp(...ops) {
    const t = this.peek();
    return t.type === 'op' && ops.includes(t.value);
  }

  expect(type) {
    const t = this.next();
    if (t.type !== type) throw new FormulaSyntaxError(`Expected ${type}`);
    return t;
  }

  binaryLevel(ops, nextLevel) {
    let left = nextLevel();
    while (this.isOp(...ops)) {
      const op = this.next().value;
      left = { type: 'binary', op, left, right: nextLevel() };
    }
    return left;
  }

  comparison() {
    return this.binaryLevel(COMPARE_OPS, () => this.concat());
  }

  concat() {
    return this.binaryLevel(['&'], () => this.additive());
  }

  additive() {
    return this.binaryLevel(['+', '-'], () => this.multiplicative());
  }

  multiplicative() {
    return this.binaryLevel(['*', '/'], () => this.power());
  }

  power() {
    const base = this.unary();
    if (!this.isOp('^')) return base;
    this.next();
    return { type: 'binary', op: '^', left: base, right: this.power() };
  }

  unary() {
    if (this.isOp('-', '+')) {
      const op = this.next().value;
      return { type: 'unary', op, arg: this.unary() };
    }
    return this.postfix();
  }

  postfix() {
    let node = this.primary();
    while (this.isOp('%')) {
      this.next();
      node = { type: 'percent', arg: node };
    }
    return node;
  }

  primary() {
    const t = this.next();
    switch (t.type) {
      case 'num':
      case 'str':
      case 'bool':
        return { type: t.type, value: t.value };
      case 'err':
        return { type: 'err', code: t.value };
      case 'ref':
        return this.refOrRange(t);
      case 'name':
        return this.callOrName(t);
      case 'lparen': {
        const inner = this.comparison();
        this.expect('rparen');
        return inner;
      }
      default:
        throw new FormulaSyntaxError('Unexpected token');
    }
  }

  refOrRange(t) {
    const start = toRefNode(t);
    if (this.peek().type !== 'colon') return start;
    this.next();
    const endTok = this.expect('ref');
    return { type: 'range', start, end: toRefNode(endTok) };
  }

  callOrName(t) {
    if (this.peek().type !== 'lparen') return { type: 'name', name: t.value };
    this.next();
    const args = [];
    if (this.peek().type !== 'rparen') {
      args.push(this.comparison());
      while (this.peek().type === 'comma') {
        this.next();
        args.push(this.comparison());
      }
    }
    this.expect('rparen');
    return { type: 'call', name: t.value, args };
  }
}

function toRefNode(t) {
  return { type: 'ref', row: t.row, col: t.col, absRow: t.absRow, absCol: t.absCol };
}
