import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import {
  generateArith, makeAdd1, makeSub1, makeAdd2, makeSub2, makeMulTable, makeMul2x1,
  explainAddColumns, explainSubColumns, explainMul2x1, ARITH_MAX_LEVEL,
  makeDivExact, makeAdd3, makeSub3, makeMul3x1, makeDivRem, makeMixed, evalTokens,
  explainLongDivision, borrowKind,
} from '../js/arith.js';

const evalPrompt = (p) => Function(`return ${p.replace(/×/g, '*').replace(/−/g, '-').replace(/÷/g, '/')}`)();

test('四則：每一級隨機 2000 題，答案都等於算式本身的值（用 JavaScript 另外算一次）', () => {
  const rng = mulberry32(1);
  for (let level = 1; level <= ARITH_MAX_LEVEL; level++) {
    for (let i = 0; i < 2000; i++) {
      const p = generateArith(level, rng);
      if (p.answerKind === 'divmod') {
        const [n, d] = p.prompt.split(' ÷ ').map(Number);
        eq(p.answer, `${Math.floor(n / d)},${n % d}`, `Lv${level} ${p.prompt}`);
        ok(n % d !== 0, `有餘數的題目卻除盡了 ${p.prompt}`);
      } else {
        const v = evalPrompt(p.prompt);
        eq(Number(p.answer), v, `Lv${level} ${p.prompt}`);
        ok(Number.isInteger(v) && v >= 0, `答案不是 0 以上的整數 ${p.prompt}`);
      }
      ok(p.steps.length > 0, '缺少解題步驟');
      eq(p.level, level);
    }
  }
});

test('四則 Lv4：整除，被除數 10～999、除數 2～9、一定除得盡', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 2000; i++) {
    const p = generateArith(4, rng);
    const [n, d] = p.prompt.split(' ÷ ').map(Number);
    ok(n >= 10 && n <= 999 && d >= 2 && d <= 9 && n % d === 0, p.prompt);
  }
  let threw = false;
  try { makeDivExact(10, 3); } catch { threw = true; }
  ok(threw, '除不盡時要報錯');
});

test('直式除法：前一位不夠除、中間商 0、最後用乘法驗算', () => {
  eq(explainLongDivision(156, 4), [
    '先看最前面的 1，比 4 小不夠除，再多看一位：15',
    '15 ÷ 4 商 3：3 × 4 = 12，15 − 12 = 3',
    '把下一位 6 拿下來，變成 36',
    '36 ÷ 4 商 9：9 × 4 = 36，36 − 36 = 0',
    '商是 39，剛好除盡',
    '驗算：39 × 4 = 156',
  ]);
  const s = explainLongDivision(412, 4);
  ok(s.includes('1 ÷ 4 商 0：0 × 4 = 0，1 − 0 = 1'), '中間商 0 的步驟');
  eq(s[s.length - 1], '驗算：103 × 4 = 412');
  eq(explainLongDivision(157, 4).slice(-2), ['商是 39，餘數是 1', '驗算：39 × 4 + 1 = 157']);
});

test('有餘數的除法：答案格式和最大值 999 ÷ 2', () => {
  const p = makeDivRem(157, 4);
  eq(p.answer, '39,1');
  eq(p.keypad, 'divmod');
  eq(p.answerText, '商 39，餘數 1');
  eq(makeDivRem(999, 2).answer, '499,1');
  eq(makeDivRem(10, 9).answer, '1,1');
});

test('三位數加法：連續進位到千位 999 + 999', () => {
  eq(makeAdd3(999, 999).answer, '1998');
  eq(explainAddColumns(999, 999), [
    '個位：9 + 9 = 18，寫 8，進 1 到十位',
    '十位：9 + 9 + 進位 1 = 19，寫 9，進 1 到百位',
    '百位：9 + 9 + 進位 1 = 19，寫 9，進 1 到千位',
    '答案：1998',
  ]);
});

test('三位數減法：跨過 0 連續借位（503 − 278）', () => {
  const p = makeSub3(503, 278);
  eq(p.answer, '225');
  eq(p.tags, ['sub3-chain']);
  eq(p.steps, [
    '個位：3 − 8 不夠減，十位是 0 沒辦法借，要一路往百位借',
    '百位的 5 變成 4，借來的 1 讓十位變成 10，再借 1 給個位，十位剩 9',
    '個位的 3 變成 13',
    '個位：13 − 8 = 5',
    '十位：9 − 7 = 2',
    '百位：4 − 2 = 2',
    '答案：225',
    '驗算：225 + 278 = 503',
  ]);
});

test('三位數減法：兩次一般借位（512 − 378）、沒有借位、結果是 1', () => {
  const p = makeSub3(512, 378);
  eq(p.answer, '134');
  eq(p.tags, ['sub3-borrow']);
  ok(p.steps.includes('十位：0 − 7 不夠減，向百位借 1'), '十位被借走後變 0，要再向百位借');
  eq(makeSub3(999, 111).tags, ['sub3']);
  eq(makeSub3(101, 100).answer, '1');
  eq(borrowKind(400, 199), 'chain');
  eq(borrowKind(400, 100), 'none');
});

test('三位數減法：每一題的步驟最後都是正確答案', () => {
  for (let a = 101; a <= 999; a += 7) {
    for (let b = 100; b < a; b += 13) {
      const s = makeSub3(a, b).steps;
      eq(s[s.length - 2], `答案：${a - b}`);
    }
  }
});

test('三位數 × 一位數：依位值拆開，0 的位數略過', () => {
  eq(makeMul3x1(236, 7).steps, ['把 236 拆成 200、30 和 6', '236 × 7 = 200 × 7 + 30 × 7 + 6 × 7', '= 1400 + 210 + 42', '= 1652']);
  eq(makeMul3x1(205, 4).steps[0], '把 205 拆成 200 和 5');
  eq(makeMul3x1(300, 4).steps, ['先算 3 × 4 = 12', '300 是 3 個百，後面補兩個 0：1200']);
  eq(makeMul3x1(999, 9).answer, '8991');
});

test('四則混合：先乘除後加減', () => {
  const r = evalTokens([3, '+', 5, '×', 4]);
  eq(r.value, 23);
  eq(r.steps, ['先算乘除：5 × 4 = 20', '變成 3 + 20', '再算加減：3 + 20 = 23', '答案：23']);
});

test('四則混合：括號先算，括號拿掉後再接著算', () => {
  const r = evalTokens(['(', 3, '+', 5, ')', '×', 4]);
  eq(r.steps, ['先算括號裡面：3 + 5 = 8', '變成 8 × 4', '先算乘除：8 × 4 = 32', '答案：32']);
  eq(makeMixed(['(', 3, '+', 5, ')', '×', 4]).prompt, '(3 + 5) × 4');
  eq(makeMixed([2, '×', '(', 3, '+', 4, ')']).answer, '14');
});

test('四則混合：由左到右、除不盡或出現負數時拒絕', () => {
  eq(evalTokens([20, '−', 3, '−', 2]).value, 15, '減法由左到右');
  eq(evalTokens([24, '÷', 4, '×', 2]).value, 12, '乘除由左到右');
  let threw = 0;
  try { evalTokens([7, '÷', 2]); } catch { threw++; }
  try { evalTokens([2, '−', 3, '×', 4]); } catch { threw++; }
  eq(threw, 2);
});

test('四則混合：隨機 3000 題都有括號或先乘除，答案不超過 999', () => {
  const rng = mulberry32(12);
  for (let i = 0; i < 3000; i++) {
    const p = generateArith(6, rng);
    ok(/[×÷]/.test(p.prompt), `沒有乘除：${p.prompt}`);
    ok(Number(p.answer) <= 999, p.prompt);
    eq(p.steps[p.steps.length - 1], `答案：${p.answer}`);
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
