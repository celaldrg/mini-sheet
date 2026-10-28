import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, DEFAULT_COL_WIDTH } from '../src/sheet.js';
import { translateFormula } from '../src/shift.js';
import { parseAddress, parseRange } from '../src/refs.js';
import { ERRORS } from '../src/values.js';

/** Sheet from {address: raw}. */
function sheetOf(data) {
  const s = createSheet();
  s.loadJSON({ cells: Object.entries(data) });
  return s;
}

const raw = (s, addr) => {
  const a = parseAddress(addr);
  return s.getRaw(a.row, a.col);
};

// ---- copy / fill offsets --------------------------------------------------------

test('relative, absolute and mixed parts on copy', () => {
  assert.equal(translateFormula('=A1+$B$2+C$3+$D4', 2, 1), '=B3+$B$2+D$3+$D6');
});

test('ranges move as a whole', () => {
  assert.equal(translateFormula('=SUM(A1:B2)', 1, 1), '=SUM(B2:C3)');
  assert.equal(translateFormula('=SUM($A$1:B2)', 3, 0), '=SUM($A$1:B5)');
});

test('a reference pushed off the grid becomes #REF!', () => {
  assert.equal(translateFormula('=A1*2', -1, 0), '=#REF!*2');
  assert.equal(translateFormula('=Z1', 0, 1), '=#REF!');
  assert.equal(translateFormula('=SUM(A1:B2)', -1, 0), '=SUM(#REF!)');
  assert.equal(translateFormula('=A100', 1, 0), '=#REF!');
});

test('absolute parts stay even for large offsets', () => {
  assert.equal(translateFormula('=$A$1', -5, -5), '=$A$1');
  assert.equal(translateFormula('=$A1', 0, 30), '=$A1');
});

test('text inside strings and function names are not touched', () => {
  assert.equal(translateFormula('="A1"&A1', 1, 0), '="A1"&A2');
  assert.equal(translateFormula('=SUM(A1, 2)  +  b2', 1, 0), '=SUM(A2, 2)  +  B3');
  assert.equal(translateFormula('plain A1', 1, 0), 'plain A1');
});

test('copy and paste shifts formulas and keeps formats', () => {
  const s = sheetOf({ A1: '2', A5: '7', B1: '=A1*2' });
  s.setFormat(parseRange('B1'), 'fixed2');
  const clip = s.copy(parseRange('B1'));
  s.paste(clip, 4, 1);
  assert.equal(raw(s, 'B5'), '=A5*2');
  assert.equal(s.valueAt('B5'), 14);
  assert.equal(s.getFormat(4, 1), 'fixed2');
});

test('paste that pushes a reference off the grid gives #REF!', () => {
  const s = sheetOf({ B2: '=A1' });
  s.paste(s.copy(parseRange('B2')), 0, 0);
  assert.equal(raw(s, 'A1'), '=#REF!');
  assert.equal(s.valueAt('A1'), ERRORS.REF);
});

test('fill down and fill right shift relative references', () => {
  const s = sheetOf({ A1: '1', A2: '2', A3: '3', A4: '4', C1: '10', B1: '=A1*$C$1' });
  s.fillDown(parseRange('B1:B4'));
  assert.equal(raw(s, 'B4'), '=A4*$C$1');
  assert.equal(s.valueAt('B4'), 40);
  const t = sheetOf({ A1: '5', A2: '=A1+1' });
  t.fillRight(parseRange('A2:C2'));
  assert.equal(raw(t, 'C2'), '=C1+1');
  assert.equal(t.valueAt('B2'), 1);
});

test('fill handle repeats a two-cell pattern in both directions', () => {
  const s = sheetOf({ A3: 'x', A4: '=A3&"!"' });
  s.fill(parseRange('A3:A4'), parseRange('A1:A8'));
  assert.equal(raw(s, 'A5'), 'x');
  assert.equal(raw(s, 'A6'), '=A5&"!"');
  assert.equal(raw(s, 'A2'), '=A1&"!"');
  assert.equal(raw(s, 'A1'), 'x');
  assert.equal(s.valueAt('A8'), 'x!');
});

// ---- row and column insert / delete -------------------------------------------

test('insert row at top moves cells and formulas', () => {
  const s = sheetOf({ A1: '5', B1: '=A1*2' });
  s.insertRows(0);
  assert.equal(raw(s, 'A2'), '5');
  assert.equal(raw(s, 'B2'), '=A2*2');
  assert.equal(s.valueAt('B2'), 10);
  assert.equal(raw(s, 'A1'), '');
});

test('insert row between references only moves those below', () => {
  const s = sheetOf({ A1: '1', A3: '3', C5: '=A1+A3' });
  s.insertRows(1);
  assert.equal(raw(s, 'C6'), '=A1+A4');
  assert.equal(s.valueAt('C6'), 4);
});

test('insert row inside a range widens it', () => {
  const s = sheetOf({ A1: '1', A2: '2', A3: '3', A5: '=SUM(A1:A3)' });
  s.insertRows(1, 2);
  assert.equal(raw(s, 'A7'), '=SUM(A1:A5)');
  s.setCell(1, 0, '10');
  assert.equal(s.valueAt('A7'), 16);
});

test('absolute references follow structural changes', () => {
  const s = sheetOf({ A3: '9', B1: '=$A$3' });
  s.insertRows(0, 2);
  assert.equal(raw(s, 'B3'), '=$A$5');
  assert.equal(s.valueAt('B3'), 9);
});

test('deleting a referenced row gives #REF!', () => {
  const s = sheetOf({ A1: '1', A2: '2', A3: '=A1+A2' });
  s.deleteRows(0);
  assert.equal(raw(s, 'A2'), '=#REF!+A1');
  assert.equal(s.valueAt('A2'), ERRORS.REF);
});

test('deleting rows inside a range shrinks it', () => {
  const s = sheetOf({ A1: '1', A2: '2', A3: '3', A4: '4', A5: '5', A7: '=SUM(A1:A5)' });
  s.deleteRows(1, 2);
  assert.equal(raw(s, 'A5'), '=SUM(A1:A3)');
  assert.equal(s.valueAt('A5'), 1 + 4 + 5);
});

test('deleting the first rows of a range keeps its start row', () => {
  const s = sheetOf({ A3: '3', A4: '4', A5: '5', B1: '=SUM(A3:A5)' });
  s.deleteRows(2);
  assert.equal(raw(s, 'B1'), '=SUM(A3:A4)');
  assert.equal(s.valueAt('B1'), 9);
});

test('deleting a whole range gives #REF!', () => {
  const s = sheetOf({ A2: '1', A3: '2', B1: '=SUM(A2:A3)' });
  s.deleteRows(1, 2);
  assert.equal(raw(s, 'B1'), '=SUM(#REF!)');
  assert.equal(s.valueAt('B1'), ERRORS.REF);
});

test('insert column shifts cells right', () => {
  const s = sheetOf({ A1: '3', B1: '=A1+1' });
  s.insertCols(0);
  assert.equal(raw(s, 'C1'), '=B1+1');
  assert.equal(s.valueAt('C1'), 4);
});

test('delete column turns its references into #REF!', () => {
  const s = sheetOf({ A1: '1', B1: '2', C1: '3', D1: '=A1+B1+C1' });
  s.deleteCols(1);
  assert.equal(raw(s, 'C1'), '=A1+#REF!+B1');
  assert.equal(s.valueAt('C1'), ERRORS.REF);
});

test('delete column inside a range shrinks it', () => {
  const s = sheetOf({ A1: '1', B1: '2', C1: '3', D1: '4', A2: '=SUM(A1:D1)' });
  s.deleteCols(1);
  assert.equal(raw(s, 'A2'), '=SUM(A1:C1)');
  assert.equal(s.valueAt('A2'), 8);
});

test('rows pushed off the bottom are lost and references to them break', () => {
  const s = sheetOf({ A100: '7', B1: '=A100' });
  s.insertRows(0);
  assert.equal(raw(s, 'B2'), '=#REF!');
  assert.equal(s.usedBounds().rows, 2);
});

test('reversed and mixed ranges keep their markers', () => {
  const s = sheetOf({ C1: '=SUM(B5:A1)', D1: '=SUM($A$1:A$3)' });
  s.insertRows(1);
  assert.equal(raw(s, 'C1'), '=SUM(B6:A1)');
  assert.equal(raw(s, 'D1'), '=SUM($A$1:A$4)');
});

test('column widths move with inserted and deleted columns', () => {
  const s = createSheet();
  s.setColumnWidth(0, 150);
  s.insertCols(0);
  assert.equal(s.colWidths[0], DEFAULT_COL_WIDTH);
  assert.equal(s.colWidths[1], 150);
  s.deleteCols(0, 1);
  assert.equal(s.colWidths[0], 150);
  assert.equal(s.colWidths.length, 26);
});

test('undo of a row delete restores formulas and values', () => {
  const s = sheetOf({ A1: '1', A2: '2', A3: '=A1+A2' });
  s.deleteRows(0);
  s.undo();
  assert.equal(raw(s, 'A3'), '=A1+A2');
  assert.equal(s.valueAt('A3'), 3);
  s.redo();
  assert.equal(raw(s, 'A2'), '=#REF!+A1');
});
