import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, serializeCSV } from '../src/csv.js';
import { createRng, randomInt } from '../src/rng.js';
import { createSheet } from '../src/sheet.js';
import { parseRange } from '../src/refs.js';

test('parses quoted fields, embedded commas, quotes and newlines', () => {
  const text = 'name,note\r\n"Smith, J","said ""hi"""\r\n"two\r\nlines",x\r\n';
  assert.deepEqual(parseCSV(text), [
    ['name', 'note'],
    ['Smith, J', 'said "hi"'],
    ['two\r\nlines', 'x'],
  ]);
});

test('line endings: CRLF, LF, CR and a missing final break', () => {
  assert.deepEqual(parseCSV('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCSV('a\rb\r'), [['a'], ['b']]);
  assert.deepEqual(parseCSV('a\r\n\r\nb\r\n'), [['a'], [''], ['b']]);
});

test('empty input, empty fields and empty quoted fields', () => {
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('\r\n'), [['']]);
  assert.deepEqual(parseCSV(',\n'), [['', '']]);
  assert.deepEqual(parseCSV('"",""'), [['', '']]);
});

test('an unterminated quote keeps the rest as one field', () => {
  assert.deepEqual(parseCSV('"abc,def'), [['abc,def']]);
});

test('serialize quotes only when needed and ends records with CRLF', () => {
  assert.equal(serializeCSV([['a,b', 'c'], ['x"y', 'plain']]), '"a,b",c\r\n"x""y",plain\r\n');
  assert.equal(serializeCSV([['multi\nline']]), '"multi\nline"\r\n');
  assert.equal(serializeCSV([]), '');
});

test('round trip on hand-picked tricky tables', () => {
  const tables = [
    [['']],
    [['', ''], ['', '']],
    [['"'], ['""'], [',']],
    [['\r'], ['\n'], ['\r\n'], ['a\rb']],
    [[' lead', 'trail ', ' both ']],
    [['çğış', 'ÖÜ €', '日本']],
    [['a', 'b', 'c'], ['1', '', '3']],
  ];
  for (const t of tables) assert.deepEqual(parseCSV(serializeCSV(t)), t);
});

const ALPHABET = ['a', 'B', '7', ' ', ',', '"', '\n', '\r', '\r\n', 'ç', '.', '\t', '='];

function randomTable(rng) {
  const rows = randomInt(rng, 1, 8);
  const cols = randomInt(rng, 1, 6);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => {
    const len = randomInt(rng, 0, 6);
    let s = '';
    for (let i = 0; i < len; i += 1) s += ALPHABET[randomInt(rng, 0, ALPHABET.length - 1)];
    return s;
  }));
}

test('round trip on 200 seeded random tables (comma and tab)', () => {
  const rng = createRng(20261028);
  for (let i = 0; i < 200; i += 1) {
    const table = randomTable(rng);
    assert.deepEqual(parseCSV(serializeCSV(table)), table, `table ${i}`);
    const tsv = serializeCSV(table, { delimiter: '\t' });
    assert.deepEqual(parseCSV(tsv, { delimiter: '\t' }), table, `tsv table ${i}`);
  }
});

test('sheet CSV import and export keep raw text and computed values', () => {
  const s = createSheet();
  const info = s.importCSV('item,price\r\n"Tea, green",4.5\r\nCake,=B2*2\r\n');
  assert.deepEqual(info, { rows: 3, cols: 2, truncated: false });
  assert.equal(s.getValue(1, 0), 'Tea, green');
  assert.equal(s.getValue(2, 1), 9);
  assert.equal(s.exportCSV(), 'item,price\r\n"Tea, green",4.5\r\nCake,9\r\n');
  assert.equal(s.exportCSV({ formulas: true }), 'item,price\r\n"Tea, green",4.5\r\nCake,=B2*2\r\n');
  s.undo();
  assert.equal(s.usedBounds().rows, 0);
});

test('sheet import drops what does not fit and says so', () => {
  const s = createSheet();
  const wide = Array.from({ length: 30 }, (_, i) => String(i)).join(',');
  const info = s.importCSV(wide);
  assert.equal(info.cols, 26);
  assert.equal(info.truncated, true);
});

test('tab-separated copy and paste through the system clipboard', () => {
  const s = createSheet();
  s.pasteText('1\t2\r\n3\t=A1+B1', 0, 0);
  assert.equal(s.getValue(1, 1), 3);
  assert.equal(s.rangeToTSV(parseRange('A1:B2')), '1\t2\r\n3\t3');
  const area = s.pasteText('x\ty\tz', 5, 24);
  assert.deepEqual(area, { top: 5, left: 24, bottom: 5, right: 25 });
});
