// Example sheets and the ?demo state. Pure, no DOM.
import { COLS, makeRange, parseAddress, colName } from './refs.js';
import { createSheet, DEFAULT_COL_WIDTH } from './sheet.js';

/**
 * @typedef {{cells:Array<[string,string,string?]>, colWidths:number[]}} SheetData
 * @typedef {(text:string)=>string} Labeler
 */

/** Turkish labels of the example sheets; English is the key itself. */
const TR_LABELS = Object.freeze({
  'Monthly budget': 'Aylık bütçe',
  Item: 'Kalem',
  Planned: 'Planlanan',
  Actual: 'Gerçekleşen',
  Share: 'Pay',
  Status: 'Durum',
  Rent: 'Kira',
  Groceries: 'Market',
  Transport: 'Ulaşım',
  Utilities: 'Faturalar',
  Internet: 'İnternet',
  'Going out': 'Eğlence',
  Savings: 'Birikim',
  Over: 'Aşıldı',
  OK: 'Tamam',
  'Over by ': 'Aşım: ',
  'On budget': 'Bütçe içinde',
  Total: 'Toplam',
  Income: 'Gelir',
  'Left over': 'Kalan',
  'Items over plan': 'Planı aşan kalem',
  Student: 'Öğrenci',
  Quiz: 'Kısa sınav',
  Midterm: 'Ara sınav',
  Final: 'Final',
  Average: 'Ortalama',
  Grade: 'Not',
  Passed: 'Geçti',
  'Class average': 'Sınıf ortalaması',
  'Passed count': 'Geçen sayısı',
  Best: 'En yüksek',
  'Look up': 'Ara',
});

/**
 * Label translator for a UI language.
 * @param {string} lang
 * @returns {Labeler}
 */
function labeler(lang) {
  if (lang !== 'tr') return (text) => (text === 'Passed count' ? 'Passed' : text);
  return (text) => TR_LABELS[text] ?? text;
}

const BUDGET_ITEMS = [
  ['Rent', 1200, 1200],
  ['Groceries', 450, 512.4],
  ['Transport', 120, 96.5],
  ['Utilities', 180, 174.2],
  ['Internet', 45, 45],
  ['Going out', 150, 210],
  ['Savings', 400, 400],
];

function widths(map) {
  return Array.from({ length: COLS }, (_, i) => map[colName(i)] ?? DEFAULT_COL_WIDTH);
}

/** @param {Labeler} L */
function budget(L) {
  const cells = [
    ['A1', L('Monthly budget')],
    ['A2', L('Item')], ['B2', L('Planned')], ['C2', L('Actual')], ['D2', L('Share')], ['E2', L('Status')],
  ];
  BUDGET_ITEMS.forEach(([name, planned, actual], i) => {
    const r = i + 3;
    cells.push(
      [`A${r}`, L(name)],
      [`B${r}`, String(planned), 'thousands'],
      [`C${r}`, String(actual), 'thousands'],
      [`D${r}`, `=C${r}/$C$11`, 'percent'],
      [`E${r}`, `=IF(C${r}>B${r},"${L('Over')}","${L('OK')}")`],
    );
  });
  cells.push(
    ['A11', L('Total')],
    ['B11', '=SUM(B3:B9)', 'thousands'],
    ['C11', '=SUM(C3:C9)', 'thousands'],
    ['D11', '=SUM(D3:D9)', 'percent'],
    ['E11', `=IF(C11>B11,"${L('Over by ')}"&ROUND(C11-B11,2),"${L('On budget')}")`],
    ['A12', L('Income')], ['B12', '3200', 'thousands'], ['C12', '3200', 'thousands'],
    ['A13', L('Left over')],
    ['B13', '=B12-B11', 'thousands'],
    ['C13', '=C12-C11', 'thousands'],
    ['D13', '=C13/C12', 'percent'],
    ['A15', L('Items over plan')], ['B15', `=COUNTIF(E3:E9,"${L('Over')}")`],
  );
  return { cells, colWidths: widths({ A: 130, E: 150 }) };
}

const STUDENTS = [
  ['Ada', 92, 85, 97],
  ['Bora', 68, 74, 59],
  ['Cem', 45, 52, 61],
  ['Deniz', 88, 91, 79],
  ['Elif', 99, 94, 100],
  ['Ferhat', 38, 47, 42],
];

/** @param {Labeler} L */
function grades(L) {
  const cells = [
    ['A1', L('Student')], ['B1', L('Quiz')], ['C1', L('Midterm')], ['D1', L('Final')],
    ['E1', L('Average')], ['F1', L('Grade')], ['G1', L('Passed')],
  ];
  STUDENTS.forEach(([name, ...scores], i) => {
    const r = i + 2;
    cells.push(
      [`A${r}`, name],
      [`B${r}`, String(scores[0])], [`C${r}`, String(scores[1])], [`D${r}`, String(scores[2])],
      [`E${r}`, `=ROUND(AVERAGE(B${r}:D${r}),1)`],
      [`F${r}`, `=IF(E${r}>=90,"A",IF(E${r}>=75,"B",IF(E${r}>=50,"C","F")))`],
      [`G${r}`, `=E${r}>=50`],
    );
  });
  cells.push(
    ['A9', L('Class average')], ['E9', '=ROUND(AVERAGE(E2:E7),1)'],
    ['A10', L('Passed count')], ['E10', '=COUNTIF(E2:E7,">=50")'],
    ['A11', L('Best')], ['E11', '=MAX(E2:E7)'],
    ['A13', L('Look up')], ['B13', 'Deniz'], ['C13', '=VLOOKUP(B13,A2:F7,6,FALSE)'],
  );
  return { cells, colWidths: widths({ A: 120 }) };
}

function multiplication() {
  const cells = [['A1', '×']];
  for (let i = 1; i <= 10; i += 1) {
    cells.push([`${colName(i)}1`, String(i)], [`A${i + 1}`, String(i)]);
    for (let j = 1; j <= 10; j += 1) cells.push([`${colName(j)}${i + 1}`, `=$A${i + 1}*${colName(j)}$1`]);
  }
  return { cells, colWidths: widths(Object.fromEntries([...'ABCDEFGHIJK'].map((c) => [c, 56]))) };
}

/** Example sheets by id. Each builder takes a label translator and returns sheet data. */
export const EXAMPLES = Object.freeze({
  budget,
  grades,
  multiplication,
});

/** Ids of the examples, in menu order. */
export const EXAMPLE_IDS = Object.freeze(Object.keys(EXAMPLES));

/**
 * Data of an example sheet, ready for sheet.loadJSON().
 * @param {string} id  one of EXAMPLE_IDS
 * @param {string} [lang]  'en' (default) or 'tr' for Turkish labels
 * @returns {{version:1} & SheetData | null}
 */
export function exampleData(id, lang = 'en') {
  const build = EXAMPLES[id];
  return build ? { version: 1, ...build(labeler(lang)) } : null;
}

/**
 * The deterministic ?demo state: the monthly budget with a selected range.
 * @param {{onEvaluate?:(key:number)=>void, lang?:string}} [options] lang picks the label language
 * @returns {{sheet: import('./sheet.js').Sheet, active:{row:number,col:number},
 *   selection: import('./refs.js').Range}}
 */
export function createDemo(options = {}) {
  const { lang = 'en', ...sheetOptions } = options;
  const sheet = createSheet(sheetOptions);
  sheet.loadJSON(exampleData('budget', lang));
  const a = parseAddress('C3');
  const b = parseAddress('C9');
  return { sheet, active: a, selection: makeRange(a.row, a.col, b.row, b.col) };
}
