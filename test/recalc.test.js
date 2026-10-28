import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet } from '../src/sheet.js';
import { ERRORS } from '../src/values.js';
import { parseAddress, addressName, keyToCell } from '../src/refs.js';
import { stronglyConnected } from '../src/graph.js';

/** Sheet that logs every formula evaluation by address. */
function counted() {
  const log = [];
  const sheet = createSheet({
    onEvaluate: (key) => {
      const { row, col } = keyToCell(key);
      log.push(addressName(row, col));
    },
  });
  const set = (addr, raw) => {
    const a = parseAddress(addr);
    sheet.setCell(a.row, a.col, raw);
  };
  return { sheet, log, set };
}

test('chain A1 -> B1 -> C1 -> D1 updates fully after editing A1', () => {
  const { sheet, log, set } = counted();
  set('A1', '1');
  set('B1', '=A1+1');
  set('C1', '=B1*2');
  set('D1', '=C1-1');
  assert.equal(sheet.valueAt('D1'), 3);
  log.length = 0;
  set('A1', '10');
  assert.deepEqual(log, ['B1', 'C1', 'D1']);
  assert.equal(sheet.valueAt('B1'), 11);
  assert.equal(sheet.valueAt('C1'), 22);
  assert.equal(sheet.valueAt('D1'), 21);
});

test('formulas entered before their inputs still settle', () => {
  const { sheet, set } = counted();
  set('D1', '=C1-1');
  set('C1', '=B1*2');
  set('B1', '=A1+1');
  set('A1', '4');
  assert.equal(sheet.valueAt('D1'), 9);
});

test('diamond: every cell is evaluated exactly once, precedents first', () => {
  const { sheet, log, set } = counted();
  set('A1', '1');
  set('B1', '=A1+1');
  set('C1', '=A1*2');
  set('D1', '=B1+C1');
  set('E1', '=D1*10+B1');
  log.length = 0;
  set('A1', '5');
  const counts = {};
  for (const a of log) counts[a] = (counts[a] ?? 0) + 1;
  assert.deepEqual(counts, { B1: 1, C1: 1, D1: 1, E1: 1 });
  assert.ok(log.indexOf('D1') > log.indexOf('B1') && log.indexOf('D1') > log.indexOf('C1'));
  assert.ok(log.indexOf('E1') > log.indexOf('D1'));
  assert.equal(sheet.valueAt('E1'), (6 + 10) * 10 + 6);
});

test('wide diamond lattice: one evaluation per dependent cell', () => {
  const { sheet, log, set } = counted();
  set('A1', '1');
  for (let r = 1; r <= 20; r += 1) set(`B${r}`, '=A1*' + r);
  set('C1', '=SUM(B1:B20)');
  set('D1', '=C1+B1+B20');
  log.length = 0;
  set('A1', '2');
  assert.equal(log.length, 22);
  assert.equal(new Set(log).size, 22);
  assert.equal(sheet.valueAt('C1'), 420);
  assert.equal(sheet.valueAt('D1'), 420 + 2 + 40);
});

test('editing an unrelated cell evaluates nothing else', () => {
  const { log, set } = counted();
  set('A1', '1');
  set('B1', '=A1+1');
  log.length = 0;
  set('Z50', '7');
  assert.deepEqual(log, []);
});

test('cycle detection marks exactly the cells on the cycle and clears when broken', () => {
  const { sheet, set } = counted();
  set('A1', '=C1+1');
  set('B1', '=A1+1');
  set('E1', '5');
  set('D1', '=B1*2');
  set('C1', '=B1+1');
  const onCycle = ['A1', 'B1', 'C1', 'D1', 'E1'].filter((a) => {
    const p = parseAddress(a);
    return sheet.isOnCycle(p.row, p.col);
  });
  assert.deepEqual(onCycle, ['A1', 'B1', 'C1']);
  for (const a of ['A1', 'B1', 'C1']) assert.equal(sheet.valueAt(a), ERRORS.CYCLE);
  assert.equal(sheet.valueAt('D1'), ERRORS.CYCLE, 'downstream cell shows the propagated error');
  assert.equal(sheet.valueAt('E1'), 5);

  set('C1', '1');
  for (const a of ['A1', 'B1', 'C1', 'D1']) {
    const p = parseAddress(a);
    assert.equal(sheet.isOnCycle(p.row, p.col), false, a);
  }
  assert.equal(sheet.valueAt('A1'), 2);
  assert.equal(sheet.valueAt('B1'), 3);
  assert.equal(sheet.valueAt('D1'), 6);
});

test('self reference and range self reference are cycles', () => {
  const { sheet, set } = counted();
  set('A1', '=A1+1');
  assert.equal(sheet.valueAt('A1'), ERRORS.CYCLE);
  assert.equal(sheet.isOnCycle(0, 0), true);
  set('A1', '5');
  assert.equal(sheet.isOnCycle(0, 0), false);
  set('A2', '3');
  set('A3', '=SUM(A1:A3)');
  assert.equal(sheet.isOnCycle(2, 0), true);
  set('A3', '=SUM(A1:A2)');
  assert.equal(sheet.valueAt('A3'), 8);
  assert.equal(sheet.isOnCycle(2, 0), false);
});

test('two separate cycles joined by a plain cell: only cycle members are marked', () => {
  const { sheet, set } = counted();
  set('A1', '=B1');
  set('B1', '=A1');
  set('C1', '=A1+1');
  set('D1', '=E1+C1');
  set('E1', '=D1');
  const marked = [];
  for (let c = 0; c < 5; c += 1) if (sheet.isOnCycle(0, c)) marked.push(addressName(0, c));
  assert.deepEqual(marked, ['A1', 'B1', 'D1', 'E1']);
  set('B1', '2');
  assert.equal(sheet.valueAt('C1'), 3);
  assert.equal(sheet.isOnCycle(0, 3), true, 'the D1/E1 cycle is still there');
});

test('undoing the edit that closed a cycle clears it', () => {
  const { sheet, set } = counted();
  set('A1', '1');
  set('B1', '=A1*2');
  set('A1', '=B1');
  assert.equal(sheet.isOnCycle(0, 0), true);
  sheet.undo();
  assert.equal(sheet.isOnCycle(0, 0), false);
  assert.equal(sheet.valueAt('B1'), 2);
});

test('stronglyConnected lists components dependents-first', () => {
  const edges = { a: ['b'], b: ['c'], c: ['b', 'd'], d: [] };
  const comps = stronglyConnected(Object.keys(edges), (n) => edges[n]);
  const names = comps.map((c) => c.sort().join(''));
  assert.deepEqual(names, ['d', 'bc', 'a']);
});

test('a 2,000-cell chain recalculates in under 200 ms', () => {
  let evaluations = 0;
  const sheet = createSheet({ onEvaluate: () => { evaluations += 1; } });
  const cells = [['A1', '1']];
  for (let i = 1; i < 2000; i += 1) {
    const prev = keyToCell(i - 1);
    const here = keyToCell(i);
    cells.push([addressName(here.row, here.col), `=${addressName(prev.row, prev.col)}+1`]);
  }
  sheet.loadJSON({ cells });
  const last = keyToCell(1999);
  assert.equal(sheet.getValue(last.row, last.col), 2000);
  evaluations = 0;
  const t0 = performance.now();
  sheet.setCell(0, 0, '5');
  const ms = performance.now() - t0;
  assert.equal(sheet.getValue(last.row, last.col), 2004);
  assert.equal(evaluations, 1999);
  assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});
