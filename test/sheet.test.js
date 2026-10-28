import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet } from '../src/sheet.js';
import { formatValue } from '../src/format.js';
import { exampleData, EXAMPLE_IDS, createDemo } from '../src/examples.js';
import { loadItem, saveItem } from '../src/storage.js';
import { parseRange, colName, colIndex, parseAddress, rangeName } from '../src/refs.js';
import { ERRORS, isError } from '../src/values.js';
import { createRng } from '../src/rng.js';

test('undo and redo of edits, formats and widths', () => {
  const s = createSheet();
  s.setCell(0, 0, '1');
  s.setCell(0, 1, '=A1*3');
  s.setCell(0, 0, '2');
  s.setFormat(parseRange('B1'), 'percent');
  s.setColumnWidth(1, 200);
  assert.equal(s.valueAt('B1'), 6);
  s.undo();
  assert.equal(s.colWidths[1], 96);
  s.undo();
  assert.equal(s.getFormat(0, 1), 'general');
  s.undo();
  assert.equal(s.valueAt('B1'), 3);
  s.redo();
  assert.equal(s.valueAt('B1'), 6);
  s.setCell(5, 5, 'new');
  assert.equal(s.canRedo(), false, 'a new edit clears the redo stack');
  while (s.undo());
  assert.equal(s.usedBounds().rows, 0);
  assert.equal(s.canUndo(), false);
});

test('one undo step covers a multi-cell paste and a clear', () => {
  const s = createSheet();
  s.pasteText('1\t2\n3\t4', 0, 0);
  s.clearRange(parseRange('A1:B2'));
  assert.equal(s.usedBounds().rows, 0);
  s.undo();
  assert.equal(s.valueAt('B2'), 4);
  s.undo();
  assert.equal(s.valueAt('B2'), null);
});

test('setting the same content is not an undo step', () => {
  const s = createSheet();
  assert.equal(s.setCell(0, 0, 'a'), true);
  assert.equal(s.setCell(0, 0, 'a'), false);
  assert.equal(s.undoStack.length, 1);
});

test('number formats use the UI language separators', () => {
  assert.equal(formatValue(1234.5, 'thousands', 'en'), '1,234.50');
  assert.equal(formatValue(1234.5, 'thousands', 'tr'), '1.234,50');
  assert.equal(formatValue(1234567.891, 'thousands', 'en'), '1,234,567.89');
  assert.equal(formatValue(-1234.5, 'fixed2', 'en'), '-1234.50');
  assert.equal(formatValue(0.125, 'percent', 'en'), '12.5%');
  assert.equal(formatValue(0.125, 'percent', 'tr'), '%12,5');
  assert.equal(formatValue(-0.001, 'fixed2', 'en'), '0.00');
  assert.equal(formatValue(0.1 + 0.2, 'general', 'en'), '0.3');
  assert.equal(formatValue(2.5, 'general', 'tr'), '2,5');
  assert.equal(formatValue(true, 'general', 'tr'), 'DOĞRU');
  assert.equal(formatValue('text', 'percent', 'en'), 'text');
  assert.equal(formatValue(ERRORS.DIV0, 'general', 'en'), '#DIV/0!');
  assert.equal(formatValue(null), '');
  assert.equal(formatValue(1e20, 'general', 'en'), '1.000000e+20');
});

test('save data round trip keeps cells, formats and widths', () => {
  const s = createSheet();
  s.setCell(2, 3, '=1+1');
  s.setFormat(parseRange('D3'), 'fixed2');
  s.setColumnWidth(3, 140);
  const copy = createSheet();
  assert.equal(copy.loadJSON(JSON.parse(JSON.stringify(s.toJSON()))), true);
  assert.equal(copy.valueAt('D3'), 2);
  assert.equal(copy.getFormat(2, 3), 'fixed2');
  assert.equal(copy.colWidths[3], 140);
  assert.equal(copy.canUndo(), false);
  assert.equal(copy.loadJSON(null), false);
  assert.equal(copy.loadJSON({ cells: [['??', 'x'], 'bad', ['A1', 5]] }), true);
  assert.equal(copy.usedBounds().rows, 0);
});

test('every example loads without error values', () => {
  for (const id of EXAMPLE_IDS) {
    const s = createSheet();
    assert.equal(s.loadJSON(exampleData(id)), true, id);
    for (const [addr] of exampleData(id).cells) {
      assert.ok(!isError(s.valueAt(addr)), `${id} ${addr} -> ${s.valueAt(addr)}`);
    }
  }
  assert.equal(exampleData('nope'), null);
});

test('examples compute the expected numbers', () => {
  const g = createSheet();
  g.loadJSON(exampleData('grades'));
  assert.equal(g.valueAt('E6'), 97.7);
  assert.equal(g.valueAt('F6'), 'A');
  assert.equal(g.valueAt('F7'), 'F');
  assert.equal(g.valueAt('C13'), 'B');
  assert.equal(g.valueAt('E10'), 5);
  const m = createSheet();
  m.loadJSON(exampleData('multiplication'));
  assert.equal(m.valueAt('K11'), 100);
  assert.equal(m.valueAt('D5'), 12);
});

test('demo state: budget with sums, percentages, IF and a selected range', () => {
  const { sheet, selection, active } = createDemo();
  assert.equal(rangeName(selection), 'C3:C9');
  assert.deepEqual(active, { row: 2, col: 2 });
  const stats = sheet.rangeStats(selection);
  assert.ok(Math.abs(stats.sum - 2638.1) < 1e-9);
  assert.equal(stats.count, 7);
  assert.ok(Math.abs(sheet.valueAt('D11') - 1) < 1e-9);
  assert.equal(sheet.valueAt('E4'), 'Over');
  assert.equal(sheet.valueAt('E11'), 'Over by 93.1');
  assert.equal(sheet.valueAt('B15'), 2);
  assert.equal(sheet.getFormat(2, 3), 'percent');
  const again = createDemo().sheet;
  assert.deepEqual(again.toJSON(), sheet.toJSON(), 'demo is deterministic');
});

test('range stats count text and numbers separately', () => {
  const s = createSheet();
  s.pasteText('1\tx\n2\t', 0, 0);
  assert.deepEqual(s.rangeStats(parseRange('A1:B2')), { sum: 3, average: 1.5, count: 2, countA: 3 });
  assert.equal(s.rangeStats(parseRange('C1:C3')).average, null);
});

test('address helpers', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colIndex('AA'), 26);
  assert.deepEqual(parseAddress('$C$7'), { row: 6, col: 2 });
  assert.equal(parseAddress('A101'), null);
  assert.deepEqual(parseRange('B5:A1'), { top: 0, left: 0, bottom: 4, right: 1 });
});

test('seeded generator repeats', () => {
  const a = createRng(7);
  const b = createRng(7);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('storage helper survives missing or throwing localStorage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    assert.equal(loadItem('k', 'fallback'), 'fallback');
    assert.equal(saveItem('k', 1), false);
    const store = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    });
    assert.equal(saveItem('k', { a: 1 }), true);
    assert.deepEqual(loadItem('k', null), { a: 1 });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } },
    });
    assert.equal(loadItem('k', 0), 0);
    assert.equal(saveItem('k', 1), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('demo labels follow the UI language', () => {
  const en = createDemo().sheet;
  const tr = createDemo({ lang: 'tr' }).sheet;
  assert.notEqual(en.getRaw(0, 0), tr.getRaw(0, 0));
  assert.equal(tr.getRaw(0, 0), exampleData('budget', 'tr').cells.find((c) => c[0] === 'A1')[1]);
  assert.ok(Math.abs(tr.rangeStats(parseRange('C3:C9')).sum - 2638.1) < 1e-9);
});

test('unparsable formulas are flagged as syntax errors', () => {
  const s = createSheet();
  for (const [i, raw] of ['=1+', '=(1+2', '="abc', '=SUM(A1'].entries()) {
    s.setCell(i, 0, raw);
    assert.equal(s.getValue(i, 0), ERRORS.NAME, raw);
    assert.equal(s.hasSyntaxError(i, 0), true, raw);
  }
  s.setCell(5, 0, '=NOPE(1)');
  assert.equal(s.getValue(5, 0), ERRORS.NAME);
  assert.equal(s.hasSyntaxError(5, 0), false);
  s.setCell(0, 0, '=1+2');
  assert.equal(s.hasSyntaxError(0, 0), false);
});
