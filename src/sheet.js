// The spreadsheet engine: cells, dependency graph, recalculation, editing,
// structural changes and undo/redo. Pure, no DOM.
import { ROWS, COLS, inGrid, cellKey, keyToCell, addressName, parseAddress, makeRange } from './refs.js';
import { ERRORS, isError, parseInput, toText } from './values.js';
import { parseFormula, collectRefs } from './parser.js';
import { evaluate } from './evaluator.js';
import { stronglyConnected, reachable } from './graph.js';
import {
  rewriteFormula, translateFormula,
  insertRowsMapper, deleteRowsMapper, insertColsMapper, deleteColsMapper,
} from './shift.js';
import { parseCSV, serializeCSV } from './csv.js';
import { FORMATS } from './format.js';

/** Default column width in CSS pixels. */
export const DEFAULT_COL_WIDTH = 96;
/** Smallest and largest column widths. */
export const MIN_COL_WIDTH = 40;
export const MAX_COL_WIDTH = 400;
const UNDO_LIMIT = 200;
const NO_KEYS = Object.freeze(new Set());

/**
 * @typedef {import('./values.js').Value} Value
 * @typedef {import('./refs.js').Range} Range
 * @typedef {{raw:string, format:string}} CellData
 * @typedef {{raw:string, format:string, ast:object|null, deps:Set<number>, value:Value, cycle:boolean}} Cell
 * @typedef {{cells:Array<[number,string,string]>, colWidths:number[]}} Snapshot
 * @typedef {{origin:{row:number,col:number}, rows:number, cols:number, data:(CellData|null)[][]}} Clip
 */

/**
 * Create an empty sheet.
 * @param {{onEvaluate?:(key:number)=>void}} [options]  onEvaluate is called for each formula evaluation
 * @returns {Sheet}
 */
export function createSheet(options = {}) {
  return new Sheet(options);
}

export class Sheet {
  /** @param {{onEvaluate?:(key:number)=>void}} [options] */
  constructor({ onEvaluate } = {}) {
    this.onEvaluate = onEvaluate ?? null;
    /** @type {Map<number, Cell>} */
    this.cells = new Map();
    /** @type {Map<number, Set<number>>} */
    this.dependents = new Map();
    this.colWidths = new Array(COLS).fill(DEFAULT_COL_WIDTH);
    this.undoStack = [];
    this.redoStack = [];
    /** Increases after every change; a UI can use it to know when to redraw. */
    this.version = 0;
    this.ctx = { getValue: (r, c) => this.cells.get(cellKey(r, c))?.value ?? null };
  }

  // ---- reading ----------------------------------------------------------

  /**
   * Raw content, format, computed value and cycle flag of a cell (null when empty).
   * @param {number} row
   * @param {number} col
   * @returns {{raw:string, format:string, value:Value, cycle:boolean}|null}
   */
  getCell(row, col) {
    const cell = this.cells.get(cellKey(row, col));
    if (!cell) return null;
    return { raw: cell.raw, format: cell.format, value: cell.value, cycle: cell.cycle };
  }

  /** @returns {string} what the user typed into the cell */
  getRaw(row, col) {
    return this.cells.get(cellKey(row, col))?.raw ?? '';
  }

  /** @returns {Value} the computed value of the cell */
  getValue(row, col) {
    return this.cells.get(cellKey(row, col))?.value ?? null;
  }

  /** @returns {string} the number format of the cell */
  getFormat(row, col) {
    return this.cells.get(cellKey(row, col))?.format ?? 'general';
  }

  /** @returns {boolean} true when the cell lies on a circular reference */
  isOnCycle(row, col) {
    return this.cells.get(cellKey(row, col))?.cycle ?? false;
  }

  /** @returns {boolean} true when the cell holds a formula that cannot be parsed */
  hasSyntaxError(row, col) {
    return this.cells.get(cellKey(row, col))?.ast?.syntax === true;
  }

  /**
   * Value read by address text, handy in tests ("B3").
   * @param {string} address
   * @returns {Value}
   */
  valueAt(address) {
    const a = parseAddress(address);
    return a ? this.getValue(a.row, a.col) : ERRORS.REF;
  }

  /**
   * Size of the used area: one past the last non-empty row and column.
   * @returns {{rows:number, cols:number}}
   */
  usedBounds() {
    let rows = 0;
    let cols = 0;
    for (const [key, cell] of this.cells) {
      if (cell.raw === '') continue;
      const { row, col } = keyToCell(key);
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
    }
    return { rows, cols };
  }

  /**
   * Sum, average and counts of a range, for a status bar.
   * @param {Range} range
   * @returns {{sum:number, average:number|null, count:number, countA:number}}
   */
  rangeStats(range) {
    let sum = 0;
    let count = 0;
    let countA = 0;
    this.forEachIn(range, (row, col) => {
      const v = this.getValue(row, col);
      if (v !== null) countA += 1;
      if (typeof v === 'number') {
        sum += v;
        count += 1;
      }
    });
    return { sum, average: count ? sum / count : null, count, countA };
  }

  /**
   * Summary for a UI.
   * @returns {{version:number, canUndo:boolean, canRedo:boolean, bounds:{rows:number,cols:number}}}
   */
  getState() {
    return { version: this.version, canUndo: this.canUndo(), canRedo: this.canRedo(), bounds: this.usedBounds() };
  }

  /**
   * Call fn for every on-grid cell of a range, row by row.
   * @param {Range} range
   * @param {(row:number, col:number)=>void} fn
   */
  forEachIn(range, fn) {
    for (let r = Math.max(0, range.top); r <= Math.min(ROWS - 1, range.bottom); r += 1) {
      for (let c = Math.max(0, range.left); c <= Math.min(COLS - 1, range.right); c += 1) fn(r, c);
    }
  }

  // ---- editing ----------------------------------------------------------

  /**
   * Set the raw content of one cell (undoable).
   * @param {number} row
   * @param {number} col
   * @param {string} raw
   * @returns {boolean} whether anything changed
   */
  setCell(row, col, raw) {
    return this.setCells([{ row, col, raw }]);
  }

  /**
   * Change several cells as one undo step. Missing raw or format keeps the old one.
   * @param {Array<{row:number, col:number, raw?:string, format?:string}>} entries
   * @returns {boolean} whether anything changed
   */
  setCells(entries) {
    const changes = [];
    for (const e of entries) {
      if (!inGrid(e.row, e.col)) continue;
      const key = cellKey(e.row, e.col);
      const before = this.dataOf(key);
      const after = normalizeData({
        raw: e.raw ?? before?.raw ?? '',
        format: e.format ?? before?.format ?? 'general',
      });
      if (!sameData(before, after)) changes.push({ key, before, after });
    }
    if (!changes.length) return false;
    this.applyData(changes.map((c) => [c.key, c.after]));
    this.record({ kind: 'cells', changes });
    return true;
  }

  /**
   * Empty the contents of a range (formats stay).
   * @param {Range} range
   * @returns {boolean}
   */
  clearRange(range) {
    const entries = [];
    this.forEachIn(range, (row, col) => entries.push({ row, col, raw: '' }));
    return this.setCells(entries);
  }

  /**
   * Set the number format of a range.
   * @param {Range} range
   * @param {string} format  one of FORMATS
   * @returns {boolean}
   */
  setFormat(range, format) {
    if (!FORMATS.includes(format)) return false;
    const entries = [];
    this.forEachIn(range, (row, col) => entries.push({ row, col, format }));
    return this.setCells(entries);
  }

  /**
   * Set a column width in pixels, clamped (undoable).
   * @param {number} col
   * @param {number} width
   * @returns {boolean}
   */
  setColumnWidth(col, width) {
    if (col < 0 || col >= COLS) return false;
    const after = Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width)));
    const before = this.colWidths[col];
    if (after === before) return false;
    this.colWidths[col] = after;
    this.version += 1;
    this.record({ kind: 'width', col, before, after });
    return true;
  }

  // ---- copy, paste, fill ------------------------------------------------

  /**
   * Copy a range into a clip that paste() understands.
   * @param {Range} range
   * @returns {Clip}
   */
  copy(range) {
    const data = [];
    for (let r = range.top; r <= range.bottom; r += 1) {
      const row = [];
      for (let c = range.left; c <= range.right; c += 1) row.push(this.dataOf(cellKey(r, c)));
      data.push(row);
    }
    return {
      origin: { row: range.top, col: range.left },
      rows: range.bottom - range.top + 1,
      cols: range.right - range.left + 1,
      data,
    };
  }

  /**
   * Paste a clip with its top-left at (row, col); relative references move with it.
   * @param {Clip} clip
   * @param {number} row
   * @param {number} col
   * @returns {Range} the pasted area (clipped to the grid)
   */
  paste(clip, row, col) {
    const dRow = row - clip.origin.row;
    const dCol = col - clip.origin.col;
    const entries = [];
    clip.data.forEach((line, i) => line.forEach((d, j) => {
      entries.push({
        row: row + i,
        col: col + j,
        raw: d ? translateFormula(d.raw, dRow, dCol) : '',
        format: d ? d.format : 'general',
      });
    }));
    this.setCells(entries);
    return clipRange(row, col, clip.rows, clip.cols);
  }

  /**
   * Paste tab-separated text (from the system clipboard) at (row, col).
   * @param {string} text
   * @param {number} row
   * @param {number} col
   * @returns {Range|null} the pasted area, or null for empty text
   */
  pasteText(text, row, col) {
    const lines = parseCSV(text, { delimiter: '\t' });
    if (!lines.length) return null;
    const entries = [];
    lines.forEach((line, i) => line.forEach((raw, j) => entries.push({ row: row + i, col: col + j, raw })));
    this.setCells(entries);
    return clipRange(row, col, lines.length, Math.max(...lines.map((l) => l.length)));
  }

  /**
   * Tab-separated computed values of a range, for the system clipboard.
   * @param {Range} range
   * @returns {string}
   */
  rangeToTSV(range) {
    const rows = [];
    for (let r = range.top; r <= range.bottom; r += 1) {
      const line = [];
      for (let c = range.left; c <= range.right; c += 1) line.push(valueText(this.getValue(r, c)));
      rows.push(line);
    }
    return serializeCSV(rows, { delimiter: '\t' }).replace(/\r\n$/, '');
  }

  /**
   * Repeat the source block over the target (fill handle). Target cells inside
   * the source are left alone; relative references shift.
   * @param {Range} source
   * @param {Range} target
   * @returns {boolean}
   */
  fill(source, target) {
    const h = source.bottom - source.top + 1;
    const w = source.right - source.left + 1;
    const inSource = (r, c) => r >= source.top && r <= source.bottom && c >= source.left && c <= source.right;
    const entries = [];
    this.forEachIn(target, (r, c) => {
      if (inSource(r, c)) return;
      const sr = source.top + mod(r - source.top, h);
      const sc = source.left + mod(c - source.left, w);
      const d = this.dataOf(cellKey(sr, sc));
      entries.push({ row: r, col: c, raw: d ? translateFormula(d.raw, r - sr, c - sc) : '', format: d?.format ?? 'general' });
    });
    return this.setCells(entries);
  }

  /**
   * Copy the top row of a range down over the rest of it.
   * @param {Range} range
   * @returns {boolean}
   */
  fillDown(range) {
    return this.fill({ ...range, bottom: range.top }, range);
  }

  /**
   * Copy the left column of a range across the rest of it.
   * @param {Range} range
   * @returns {boolean}
   */
  fillRight(range) {
    return this.fill({ ...range, right: range.left }, range);
  }

  // ---- rows and columns -------------------------------------------------

  /**
   * Insert empty rows before row `at` (0-based). Rows pushed past the last row are lost.
   * @param {number} at
   * @param {number} [count]
   */
  insertRows(at, count = 1) {
    this.restructure(insertRowsMapper(at, count), (w) => w);
  }

  /**
   * Delete rows starting at `at` (0-based). References to them become #REF!.
   * @param {number} at
   * @param {number} [count]
   */
  deleteRows(at, count = 1) {
    this.restructure(deleteRowsMapper(at, count), (w) => w);
  }

  /**
   * Insert empty columns before column `at` (0-based).
   * @param {number} at
   * @param {number} [count]
   */
  insertCols(at, count = 1) {
    this.restructure(insertColsMapper(at, count), (w) => {
      const out = [...w];
      out.splice(at, 0, ...new Array(count).fill(DEFAULT_COL_WIDTH));
      return out.slice(0, COLS);
    });
  }

  /**
   * Delete columns starting at `at` (0-based).
   * @param {number} at
   * @param {number} [count]
   */
  deleteCols(at, count = 1) {
    this.restructure(deleteColsMapper(at, count), (w) => {
      const out = [...w];
      out.splice(at, count);
      while (out.length < COLS) out.push(DEFAULT_COL_WIDTH);
      return out;
    });
  }

  // ---- undo / redo --------------------------------------------------------

  /** @returns {boolean} */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /** @returns {boolean} */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Undo the last change.
   * @returns {boolean} whether there was something to undo
   */
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.applyEntry(entry, 'before');
    this.redoStack.push(entry);
    return true;
  }

  /**
   * Redo the last undone change.
   * @returns {boolean}
   */
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.applyEntry(entry, 'after');
    this.undoStack.push(entry);
    return true;
  }

  // ---- CSV and saving -------------------------------------------------------

  /**
   * Replace the sheet with CSV content (undoable). Extra rows/columns are dropped.
   * @param {string} text
   * @returns {{rows:number, cols:number, truncated:boolean}}
   */
  importCSV(text) {
    const lines = parseCSV(text);
    const cells = [];
    let truncated = false;
    lines.forEach((line, r) => line.forEach((raw, c) => {
      if (!inGrid(r, c)) truncated = truncated || raw !== '';
      else if (raw !== '') cells.push([cellKey(r, c), raw, 'general']);
    }));
    this.replaceAll({ cells, colWidths: [...this.colWidths] });
    const cols = Math.min(COLS, Math.max(0, ...lines.map((l) => l.length)));
    return { rows: Math.min(ROWS, lines.length), cols, truncated };
  }

  /**
   * The used area as CSV: computed values, or raw content with formulas.
   * @param {{formulas?:boolean}} [options]
   * @returns {string}
   */
  exportCSV({ formulas = false } = {}) {
    const { rows, cols } = this.usedBounds();
    const lines = [];
    for (let r = 0; r < rows; r += 1) {
      const line = [];
      for (let c = 0; c < cols; c += 1) {
        const cell = this.cells.get(cellKey(r, c));
        if (!cell) line.push('');
        else line.push(formulas || !cell.ast ? cell.raw : valueText(cell.value));
      }
      lines.push(line);
    }
    return serializeCSV(lines);
  }

  /**
   * Plain data for saving (addresses, raw text, formats, column widths).
   * @returns {{version:1, cells:Array<[string,string,string?]>, colWidths:number[]}}
   */
  toJSON() {
    const cells = [];
    for (const [key, cell] of this.cells) {
      const { row, col } = keyToCell(key);
      cells.push(cell.format === 'general' ? [addressName(row, col), cell.raw] : [addressName(row, col), cell.raw, cell.format]);
    }
    return { version: 1, cells, colWidths: [...this.colWidths] };
  }

  /**
   * Load data made by toJSON(). Bad entries are skipped.
   * @param {unknown} data
   * @param {{record?:boolean}} [options]  record:true makes the load undoable
   * @returns {boolean} whether the data was usable
   */
  loadJSON(data, { record = false } = {}) {
    const snap = snapshotFromJSON(data);
    if (!snap) return false;
    if (record) this.replaceAll(snap);
    else {
      this.restore(snap);
      this.undoStack = [];
      this.redoStack = [];
    }
    return true;
  }

  // ---- internals --------------------------------------------------------------

  /** @returns {CellData|null} */
  dataOf(key) {
    const cell = this.cells.get(key);
    return cell ? { raw: cell.raw, format: cell.format } : null;
  }

  record(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  applyEntry(entry, side) {
    if (entry.kind === 'cells') {
      const list = side === 'before' ? [...entry.changes].reverse() : entry.changes;
      this.applyData(list.map((c) => [c.key, c[side]]));
    } else if (entry.kind === 'snapshot') {
      this.restore(entry[side]);
    } else {
      this.colWidths[entry.col] = entry[side];
      this.version += 1;
    }
  }

  /** Write cell data and recalculate what depends on it. */
  applyData(list) {
    for (const [key, data] of list) this.write(key, data);
    this.recalc(list.map(([key]) => key));
  }

  /** Store one cell without recalculating; keeps the dependency index in step. */
  write(key, data) {
    const old = this.cells.get(key);
    if (old) this.unlink(key, old.deps);
    if (!data) {
      this.cells.delete(key);
      return;
    }
    const cell = { raw: data.raw, format: data.format, ast: null, deps: NO_KEYS, value: null, cycle: false };
    if (data.raw.startsWith('=')) {
      cell.ast = parseOrError(data.raw.slice(1));
      cell.deps = dependencyKeys(cell.ast);
      this.link(key, cell.deps);
    } else {
      cell.value = parseInput(data.raw);
    }
    this.cells.set(key, cell);
  }

  link(key, deps) {
    for (const d of deps) {
      let set = this.dependents.get(d);
      if (!set) {
        set = new Set();
        this.dependents.set(d, set);
      }
      set.add(key);
    }
  }

  unlink(key, deps) {
    for (const d of deps) {
      const set = this.dependents.get(d);
      if (!set) continue;
      set.delete(key);
      if (!set.size) this.dependents.delete(d);
    }
  }

  /**
   * Recalculate the seeds and everything downstream of them, precedents first,
   * each formula once. Cells on a cycle get #CYCLE!.
   * @param {number[]} seeds
   */
  recalc(seeds) {
    const edges = (k) => this.dependents.get(k) ?? NO_KEYS;
    const affected = reachable(seeds, edges);
    const components = stronglyConnected(affected, edges);
    for (let i = components.length - 1; i >= 0; i -= 1) {
      const comp = components[i];
      const cyclic = comp.length > 1 || (this.cells.get(comp[0])?.deps.has(comp[0]) ?? false);
      for (const key of comp) {
        const cell = this.cells.get(key);
        if (!cell?.ast) continue;
        if (cyclic) {
          cell.value = ERRORS.CYCLE;
          cell.cycle = true;
        } else {
          this.evaluateCell(key, cell);
        }
      }
    }
    this.version += 1;
  }

  evaluateCell(key, cell) {
    const v = evaluate(cell.ast, this.ctx);
    cell.value = v === null ? 0 : v;
    cell.cycle = false;
    if (this.onEvaluate) this.onEvaluate(key);
  }

  /** @returns {Snapshot} */
  snapshot() {
    const cells = [];
    for (const [key, cell] of this.cells) cells.push([key, cell.raw, cell.format]);
    return { cells, colWidths: [...this.colWidths] };
  }

  /** @param {Snapshot} snap */
  restore(snap) {
    this.cells.clear();
    this.dependents.clear();
    for (const [key, raw, format] of snap.cells) this.write(key, { raw, format });
    this.colWidths = [...snap.colWidths];
    this.recalc([...this.cells.keys()]);
  }

  /** Swap in a whole new snapshot as one undo step. */
  replaceAll(after) {
    const before = this.snapshot();
    this.restore(after);
    this.record({ kind: 'snapshot', before, after });
  }

  /**
   * Move cells and rewrite every formula for a row/column change.
   * @param {import('./shift.js').RefMapper} mapper
   * @param {(widths:number[])=>number[]} widthsFn
   */
  restructure(mapper, widthsFn) {
    const before = this.snapshot();
    const cells = [];
    for (const [key, raw, format] of before.cells) {
      const { row, col } = keyToCell(key);
      const moved = mapper.ref({ row, col, absRow: false, absCol: false });
      if (moved) cells.push([cellKey(moved.row, moved.col), rewriteFormula(raw, mapper), format]);
    }
    this.replaceAll({ cells, colWidths: widthsFn(before.colWidths) });
  }
}

// ---- module helpers -----------------------------------------------------------

function normalizeData(d) {
  return d.raw === '' && d.format === 'general' ? null : d;
}

function sameData(a, b) {
  if (!a || !b) return a === b;
  return a.raw === b.raw && a.format === b.format;
}

function parseOrError(text) {
  try {
    return parseFormula(text);
  } catch {
    return { type: 'err', code: ERRORS.NAME.code, syntax: true };
  }
}

/** On-grid cell keys an AST reads. */
function dependencyKeys(ast) {
  const keys = new Set();
  for (const node of collectRefs(ast)) {
    const a = node.type === 'range' ? node.start : node;
    const b = node.type === 'range' ? node.end : node;
    if (!inGrid(a.row, a.col) || !inGrid(b.row, b.col)) continue;
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1) {
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c += 1) keys.add(cellKey(r, c));
    }
  }
  return keys;
}

function valueText(v) {
  return isError(v) ? v.code : toText(v);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function clipRange(row, col, rows, cols) {
  return makeRange(row, col, Math.min(ROWS - 1, row + rows - 1), Math.min(COLS - 1, col + cols - 1));
}

/** Validate saved data and turn it into a snapshot, or null. */
function snapshotFromJSON(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.cells)) return null;
  const cells = [];
  for (const entry of data.cells) {
    if (!Array.isArray(entry) || typeof entry[1] !== 'string') continue;
    const at = parseAddress(String(entry[0]));
    const format = FORMATS.includes(entry[2]) ? entry[2] : 'general';
    if (at) cells.push([cellKey(at.row, at.col), entry[1], format]);
  }
  const widths = Array.isArray(data.colWidths) ? data.colWidths : [];
  const colWidths = Array.from({ length: COLS }, (_, i) => {
    const w = Number(widths[i]);
    return Number.isFinite(w) ? Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, w)) : DEFAULT_COL_WIDTH;
  });
  return { cells, colWidths };
}
