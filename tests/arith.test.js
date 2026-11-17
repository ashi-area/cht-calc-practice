import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import {
  generateArith, makeAdd1, makeSub1, makeAdd2, makeSub2, makeMulTable, makeMul2x1,
  explainAddColumns, explainSubColumns, explainMul2x1, ARITH_MAX_LEVEL,
} from '../js/arith.js';

const evalPrompt = (p) => Function(`return ${p.replace(/×/g, '*').replace(/−/g, '-')}`)();

test('四則：每一級隨機 2000 題，答案都等於算式本身的值', () => {
  const rng = mulberry32(1);
  for (let level = 1; level <= ARITH_MAX_LEVEL; level++) {
    for (let i = 0; i < 2000; i++) {
      const p = generateArith(level, rng);
      eq(Number(p.answer), evalPrompt(p.prompt), `Lv${level} ${p.prompt}`);
      ok(Number(p.answer) >= 0, `出現負數答案 ${p.prompt}`);
      ok(p.steps.length > 0, '缺少解題步驟');
      eq(p.level, level);
    }
  }
});

test('四則：Lv1 一位數、Lv2 兩位數的範圍', () => {
  const rng = mulberry32(2);
  for (let i = 0; i < 2000; i++) {
    const p1 = generateArith(1, rng);
    p1.prompt.split(/ [+−] /).forEach((n) => ok(Number(n) >= 0 && Number(n) <= 9, `Lv1 超出範圍 ${p1.prompt}`));
    const p2 = generateArith(2, rng);
    p2.prompt.split(/ [+−] /).forEach((n) => ok(Number(n) >= 10 && Number(n) <= 99, `Lv2 超出範圍 ${p2.prompt}`));
  }
});

test('四則：沒有第 0 級或超過最高級', () => {
  let threw = 0;
  for (const lv of [0, ARITH_MAX_LEVEL + 1]) {
    try { generateArith(lv, mulberry32(1)); } catch { threw++; }
  }
  eq(threw, 2);
});

test('一位數加法：0 和最大值 9 + 9', () => {
  eq(makeAdd1(0, 0).answer, '0');
  eq(makeAdd1(9, 9).answer, '18');
  eq(makeAdd1(9, 9).tags, ['add1-cross10', 'add:9+9']);
  eq(makeAdd1(0, 7).steps, ['0 + 7 = 7']);
});

test('一位數加法：湊十法步驟', () => {
  eq(makeAdd1(7, 8).steps, [
    '先湊成 10：8 還差 2 就是 10',
    '把 7 拆成 2 和 5',
    '8 + 2 = 10',
    '10 + 5 = 15',
  ]);
  eq(makeAdd1(8, 7).tags[1], 'add:7+8', '組合標籤不分順序');
});

test('一位數減法：0 − 0、9 − 0、9 − 9', () => {
  eq(makeSub1(0, 0).answer, '0');
  eq(makeSub1(9, 0).answer, '9');
  eq(makeSub1(9, 9).answer, '0');
});

test('兩位數加法：進位到百位 99 + 99', () => {
  const p = makeAdd2(99, 99);
  eq(p.answer, '198');
  eq(p.tags, ['add2-carry']);
  eq(explainAddColumns(99, 99), [
    '個位：9 + 9 = 18，寫 8，進 1 到十位',
    '十位：9 + 9 + 進位 1 = 19，寫 9，進 1 到百位',
    '答案：198',
  ]);
});

test('兩位數加法：沒有進位', () => {
  const p = makeAdd2(12, 34);
  eq(p.tags, ['add2']);
  eq(p.steps, ['個位：2 + 4 = 6', '十位：1 + 3 = 4', '答案：46']);
});

test('兩位數減法：借位', () => {
  const p = makeSub2(52, 37);
  eq(p.answer, '15');
  eq(p.tags, ['sub2-borrow']);
  eq(explainSubColumns(52, 37), [
    '個位：2 − 7 不夠減，向十位借 1',
    '十位的 5 變成 4，個位的 2 變成 12',
    '個位：12 − 7 = 5',
    '十位：4 − 3 = 1',
    '答案：15',
    '驗算：15 + 37 = 52',
  ]);
});

test('兩位數減法：個位是 0 要借位（30 − 19）、結果為 0（10 − 10）', () => {
  eq(makeSub2(30, 19).answer, '11');
  eq(makeSub2(30, 19).tags, ['sub2-borrow']);
  eq(makeSub2(10, 10).answer, '0');
  eq(makeSub2(10, 10).tags, ['sub2']);
});

test('九九乘法：拆 5 的步驟和組合標籤', () => {
  const p = makeMulTable(8, 7);
  eq(p.answer, '56');
  eq(p.tags, ['mul-table', 'mul:7x8']);
  eq(p.steps, ['把 7 拆成 5 和 2', '8 × 7 = 8 × 5 + 8 × 2', '= 40 + 16', '= 56']);
  eq(makeMulTable(3, 4).steps, ['3 × 4 就是 4 個 3 相加', '3 + 3 + 3 + 3 = 12']);
  eq(makeMulTable(9, 9).answer, '81');
  eq(makeMulTable(2, 2).answer, '4');
});

test('兩位數 × 一位數：交接文件的例子 36 × 7', () => {
  eq(makeMul2x1(36, 7).answer, '252');
  eq(explainMul2x1(36, 7), ['把 36 拆成 30 和 6', '36 × 7 = 30 × 7 + 6 × 7', '= 210 + 42', '= 252']);
});

test('兩位數 × 一位數：整十數和最大值 99 × 9', () => {
  eq(explainMul2x1(40, 6), ['先算 4 × 6 = 24', '40 是 4 個十，後面補一個 0：240']);
  eq(makeMul2x1(99, 9).answer, '891');
});
