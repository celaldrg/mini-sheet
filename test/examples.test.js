import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet } from '../src/sheet.js';
import { exampleData, EXAMPLE_IDS } from '../src/examples.js';
import { isError } from '../src/values.js';

test('Turkish examples load without errors and keep the same numbers', () => {
  for (const id of EXAMPLE_IDS) {
    const en = createSheet();
    const tr = createSheet();
    en.loadJSON(exampleData(id, 'en'));
    tr.loadJSON(exampleData(id, 'tr'));
    for (const [addr] of exampleData(id, 'tr').cells) {
      const a = en.valueAt(addr);
      const b = tr.valueAt(addr);
      assert.ok(!isError(b), `${id} ${addr} -> ${b}`);
      if (typeof a === 'number') assert.equal(b, a, `${id} ${addr}`);
    }
  }
});

test('Turkish budget labels drive its IF and COUNTIF formulas', () => {
  const s = createSheet();
  s.loadJSON(exampleData('budget', 'tr'));
  assert.equal(s.valueAt('A1'), 'Aylık bütçe');
  assert.equal(s.valueAt('E4'), 'Aşıldı');
  assert.equal(s.valueAt('E3'), 'Tamam');
  assert.equal(s.valueAt('E11'), 'Aşım: 93.1');
  assert.equal(s.valueAt('B15'), 2);
});

test('English labels stay the default', () => {
  const s = createSheet();
  s.loadJSON(exampleData('grades'));
  assert.equal(s.valueAt('A10'), 'Passed');
  assert.equal(s.valueAt('A1'), 'Student');
});
