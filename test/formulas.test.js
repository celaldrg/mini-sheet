import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet } from '../src/sheet.js';
import { parseFormula } from '../src/parser.js';
import { tokenize, FormulaSyntaxError } from '../src/tokenizer.js';
import { ERRORS, isError } from '../src/values.js';

const E = ERRORS;

/** A sheet with fixed data the formula cases read. */
function fixture() {
  const s = createSheet();
  const data = {
    A1: '10', A2: '20', A3: '30', A4: 'apple', A5: 'TRUE',
    B1: '=1/0', B2: '5',
    C1: 'pear', D1: '3', C2: 'apple', D2: '7', C3: 'fig', D3: '11',
  };
  s.loadJSON({ cells: Object.entries(data) });
  return s;
}

/** [formula, expected] — expected may be a value or an error singleton. */
const CASES = [
  // precedence and associativity
  ['=1+2*3', 7],
  ['=(1+2)*3', 9],
  ['=10-4-3', 3],
  ['=12/4/3', 1],
  ['=2^3^2', 512],
  ['=(2^3)^2', 64],
  ['=2*3^2', 18],
  ['=1+2*3^2-4/2', 17],
  // unary minus
  ['=-2^2', 4],
  ['=2^-1', 0.5],
  ['=-(3+2)', -5],
  ['=--5', 5],
  ['=-A1+A2', 10],
  ['=+7', 7],
  // percent
  ['=50%', 0.5],
  ['=200*10%', 20],
  ['=1+2%', 1.02],
  ['=-50%', -0.5],
  // text join
  ['="a"&"b"', 'ab'],
  ['=1+2&"x"', '3x'],
  ['="n"&1.5', 'n1.5'],
  ['=A1&A6&"!"', '10!'],
  ['="say ""hi"""', 'say "hi"'],
  ['=A5&"?"', 'TRUE?'],
  // comparisons
  ['=1<2', true],
  ['=2<=2', true],
  ['=3>4', false],
  ['=3>=4', false],
  ['="a"="A"', true],
  ['=1<>1', false],
  ['="b">"a"', true],
  ['=1<"a"', true],
  ['=A6=0', true],
  ['=1+2=3', true],
  ['="x"&1=1', false],
  // references and literals
  ['=A1+A2*2', 50],
  ['=$A$1+A$2+$A3', 60],
  ['=sum(a1:a2)', 30],
  ['=A6', 0],
  ['=1e3+1', 1001],
  ['=.5*4', 2],
  ['="3"+4', 7],
  ['=TRUE+1', 2],
  ['=A1:A1*2', 20],
  // aggregate functions
  ['=SUM(A1:A3)', 60],
  ['=SUM(A1:A5)', 60],
  ['=SUM(1,2,"3")', 6],
  ['=AVERAGE(A1:A3)', 20],
  ['=AVERAGE(A6)', E.DIV0],
  ['=MIN(A1:A3,5)', 5],
  ['=MAX(A1:A3)', 30],
  ['=MAX(A6)', 0],
  ['=COUNT(A1:A6)', 3],
  ['=COUNT(1,"2","x")', 2],
  ['=COUNTA(A1:A6)', 5],
  // math functions
  ['=ROUND(2.345,2)', 2.35],
  ['=ROUND(-2.5)', -3],
  ['=ROUND(1234,-2)', 1200],
  ['=ROUND(1.005,2)', 1.01],
  ['=ABS(-4)', 4],
  ['=SQRT(16)', 4],
  ['=SQRT(-1)', E.VALUE],
  ['=POWER(2,10)', 1024],
  ['=MOD(10,3)', 1],
  ['=MOD(-1,3)', 2],
  ['=MOD(1,0)', E.DIV0],
  // logic
  ['=IF(A1>5,"big","small")', 'big'],
  ['=IF(A1>50,"big")', false],
  ['=IF(0,1/0,"safe")', 'safe'],
  ['=IF("maybe",1,2)', E.VALUE],
  ['=AND(TRUE,A1>5)', true],
  ['=AND(A5,FALSE)', false],
  ['=OR(FALSE,A1>50)', false],
  ['=OR(A1:A5)', true],
  ['=NOT(A5)', false],
  ['=AND(A4)', E.VALUE],
  // text functions
  ['=CONCAT("x",A1,A5)', 'x10TRUE'],
  ['=CONCAT(A1:A3)', '102030'],
  ['=LEN("hello")', 5],
  ['=LEN(A6)', 0],
  ['=UPPER("abc")', 'ABC'],
  ['=LOWER("AbC")', 'abc'],
  ['=TRIM("  a   b  ")', 'a b'],
  ['=LEFT("spread",3)', 'spr'],
  ['=LEFT("xy")', 'x'],
  ['=RIGHT("sheet",2)', 'et'],
  ['=MID("formula",2,3)', 'orm'],
  ['=MID("a",0,1)', E.VALUE],
  // conditional sums and lookups
  ['=SUMIF(A1:A3,">15")', 50],
  ['=SUMIF(C1:C3,"apple",D1:D3)', 7],
  ['=SUMIF(C1:C3,"<>apple",D1:D3)', 14],
  ['=SUMIF(C1:C3,"p*",D1:D3)', 3],
  ['=SUMIF(A1:A3,20)', 20],
  ['=COUNTIF(A1:A3,">=20")', 2],
  ['=COUNTIF(C1:C3,"?ig")', 1],
  ['=COUNTIF(A1:A6,"")', 1],
  ['=COUNTIF(C1:C3,"APPLE")', 1],
  ['=VLOOKUP("fig",C1:D3,2,FALSE)', 11],
  ['=VLOOKUP("APPLE",C1:D3,2)', 7],
  ['=VLOOKUP("kiwi",C1:D3,2,FALSE)', E.NA],
  ['=VLOOKUP("fig",C1:D3,3)', E.REF],
  ['=VLOOKUP("fig",C1:D3,0)', E.VALUE],
  // error propagation
  ['=1/0', E.DIV0],
  ['=B1+1', E.DIV0],
  ['=SUM(A1,B1)', E.DIV0],
  ['=SUM(A1:B3)', E.DIV0],
  ['=IF(B1,1,2)', E.DIV0],
  ['=B1&"x"', E.DIV0],
  ['=CONCAT(1/0)', E.DIV0],
  ['=-B1', E.DIV0],
  ['=B1>1', E.DIV0],
  ['=NOSUCH(1)', E.NAME],
  ['=foo+1', E.NAME],
  ['=A4*2', E.VALUE],
  ['=A101', E.REF],
  ['=SUM(A1:A101)', E.REF],
  ['=#REF!+1', E.REF],
  ['=VLOOKUP("kiwi",C1:D3,2)+1', E.NA],
  ['=1/0+#N/A', E.DIV0],
  ['=SUM()', E.VALUE],
  ['=A1:A2', E.VALUE],
  ['=10^400', E.VALUE],
  ['=1+', E.NAME],
  ['=(1+2', E.NAME],
  ['="open', E.NAME],
];

test(`formula cases (${CASES.length})`, async (t) => {
  assert.ok(CASES.length >= 60);
  const sheet = fixture();
  for (const [formula, expected] of CASES) {
    await t.test(formula, () => {
      sheet.setCell(99, 25, formula);
      const got = sheet.getValue(99, 25);
      if (isError(expected)) assert.equal(got, expected, `${formula} -> ${got}`);
      else if (typeof expected === 'number') assert.ok(Math.abs(got - expected) < 1e-9, `${formula} -> ${got}`);
      else assert.equal(got, expected);
    });
  }
});

test('0.1 + 0.2 joins as 0.3 in text', () => {
  const s = createSheet();
  s.setCell(0, 0, '=(0.1+0.2)&""');
  assert.equal(s.getValue(0, 0), '0.3');
});

test('parser builds right-associative power and unary above power', () => {
  const ast = parseFormula('-2^3^2');
  assert.equal(ast.type, 'binary');
  assert.equal(ast.op, '^');
  assert.equal(ast.left.type, 'unary');
  assert.equal(ast.right.op, '^');
});

test('tokenizer reads absolute and mixed references', () => {
  const refs = tokenize('$A$1+A$2+$B3:C4').filter((t) => t.type === 'ref');
  assert.deepEqual(
    refs.map((r) => [r.row, r.col, r.absRow, r.absCol]),
    [[0, 0, true, true], [1, 0, true, false], [2, 1, false, true], [3, 2, false, false]],
  );
});

test('tokenizer rejects stray characters', () => {
  assert.throws(() => tokenize('1 @ 2'), FormulaSyntaxError);
  assert.throws(() => tokenize('A$$1'), FormulaSyntaxError);
});

test('typed entries become numbers, booleans or text', () => {
  const s = createSheet();
  s.setCells([
    { row: 0, col: 0, raw: '42' },
    { row: 1, col: 0, raw: '12.5%' },
    { row: 2, col: 0, raw: 'false' },
    { row: 3, col: 0, raw: 'hello' },
    { row: 4, col: 0, raw: '-1e2' },
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => s.getValue(r, 0)), [42, 0.125, false, 'hello', -100]);
});
