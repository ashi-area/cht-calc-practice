import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import {
  toBase, fromBase, groupBits, divisionRows, explainDecToBase, explainBaseToDec,
  explainBinToHex, explainHexToBin, generateBase, makeBase, rangeFor, BASE_TYPES, BASE_MAX_LEVEL,
} from '../js/base.js';

test('toBase / fromBase：0、1、最大值和互相還原', () => {
  eq(toBase(0, 2), '0');
  eq(toBase(0, 16), '0');
  eq(toBase(1, 2), '1');
  eq(toBase(255, 2), '11111111');
  eq(toBase(255, 16), 'FF');
  eq(toBase(4095, 16), 'FFF');
  eq(toBase(65535, 16), 'FFFF');
  for (const b of [2, 10, 16]) {
    for (let n = 0; n <= 5000; n++) eq(fromBase(toBase(n, b), b), n, `base ${b} n=${n}`);
  }
});

test('toBase / fromBase：和 JavaScript 內建結果一致', () => {
  for (let n = 0; n <= 70000; n += 7) {
    eq(toBase(n, 2), n.toString(2));
    eq(toBase(n, 16), n.toString(16).toUpperCase());
  }
});

test('fromBase：前導 0、小寫、空白都接受；非法字元回傳 NaN', () => {
  eq(fromBase('0101', 2), 5);
  eq(fromBase('0f', 16), 15);
  eq(fromBase('1010 1111', 2), 175);
  ok(Number.isNaN(fromBase('102', 2)));
  ok(Number.isNaN(fromBase('G', 16)));
  ok(Number.isNaN(fromBase('', 10)));
});

test('toBase：負數和小數會報錯', () => {
  let threw = 0;
  for (const n of [-1, 1.5]) { try { toBase(n, 2); } catch { threw++; } }
  eq(threw, 2);
});

test('groupBits：從右邊每 4 位一組', () => {
  eq(groupBits('1'), '1');
  eq(groupBits('1111'), '1111');
  eq(groupBits('10101'), '1 0101');
  eq(groupBits('11111111'), '1111 1111');
});

test('連除法表格：13 → 1101', () => {
  eq(divisionRows(13, 2), [[13, 6, 1], [6, 3, 0], [3, 1, 1], [1, 0, 1]]);
  const steps = explainDecToBase(13, 2);
  eq(steps[1].table.rows, [
    ['13 ÷ 2', '6', '1'], ['6 ÷ 2', '3', '0'], ['3 ÷ 2', '1', '1'], ['1 ÷ 2', '0', '1'],
  ]);
  eq(steps[2], '把餘數由下往上讀：1101');
});

test('連除法：0 和 255 的邊界', () => {
  eq(divisionRows(0, 2), [[0, 0, 0]]);
  eq(explainDecToBase(255, 2)[2], '把餘數由下往上讀：1111 1111');
  eq(explainDecToBase(255, 16)[1].table.rows, [['255 ÷ 16', '15', '15（F）'], ['15 ÷ 16', '0', '15（F）']]);
});

test('連除法表格的餘數由下往上讀，等於答案', () => {
  for (const b of [2, 16]) {
    for (let n = 1; n <= 4095; n++) {
      const read = divisionRows(n, b).map((r) => '0123456789ABCDEF'[r[2]]).reverse().join('');
      eq(read, toBase(n, b));
    }
  }
});

test('二進位轉十進位：位值相加', () => {
  eq(explainBaseToDec('1101', 2), [
    '二進位每一位的位值，從右邊算起是 1、2、4、8、16……',
    '把是 1 的位數乘上位值再加起來：',
    '1 × 8 + 1 × 4 + 1 × 1',
    '= 8 + 4 + 1',
    '= 13',
  ]);
  eq(explainBaseToDec('1000', 2).slice(-2), ['1 × 8', '= 8'], '只有一個 1 時不重複列加法');
  eq(explainBaseToDec('0', 2)[1], '每一位都是 0，答案是 0');
});

test('十六進位轉十進位：字母要註明代表的數字', () => {
  const s = explainBaseToDec('2F', 16);
  eq(s[2], '2 × 16 + 15（F） × 1');
  eq(s[s.length - 1], '= 47');
});

test('二進位轉十六進位：左邊補 0 分組', () => {
  const s = explainBinToHex('101111');
  eq(s[1].table.rows, [['0010', '2', '2'], ['1111', '15（F）', 'F']]);
  eq(s[2], '由左到右接起來：2F');
});

test('十六進位轉二進位：每位換 4 位，去掉前導 0', () => {
  const s = explainHexToBin('2F');
  eq(s[1].table.rows, [['2', '2', '0010'], ['F', '15（F）', '1111']]);
  eq(s[2], '接起來，再去掉最左邊多餘的 0：10 1111');
});

test('進位轉換：每一級、每一種題型隨機出題，答案正確且在範圍內', () => {
  const rng = mulberry32(3);
  for (let level = 1; level <= BASE_MAX_LEVEL; level++) {
    for (let i = 0; i < 3000; i++) {
      const p = generateBase(level, rng);
      const [from, to] = BASE_TYPES[p.type];
      const value = fromBase(p.prompt, from);
      const [min, max] = rangeFor(p.type, level);
      ok(value >= min && value <= max, `Lv${level} ${p.type} 超出範圍：${p.prompt}`);
      eq(p.answer, toBase(value, to), `${p.type} ${p.prompt}`);
      eq(p.answerBase, to);
      eq(p.keypad, { 2: 'bin', 10: 'dec', 16: 'hex' }[to]);
    }
  }
});

test('進位轉換：每一級的範圍互相銜接、不重疊', () => {
  for (const type of Object.keys(BASE_TYPES)) {
    for (let lv = 1; lv < BASE_MAX_LEVEL; lv++) {
      eq(rangeFor(type, lv)[1] + 1, rangeFor(type, lv + 1)[0], `${type} Lv${lv}`);
    }
  }
});

test('進位轉換：各題型的最大值題目', () => {
  eq(makeBase('d2b', 3, 255).answer, '11111111');
  eq(makeBase('b2d', 3, 255).prompt, '1111 1111');
  eq(makeBase('h2d', 3, 4095).answer, '4095');
  eq(makeBase('b2h', 3, 4095).answer, 'FFF');
  eq(makeBase('h2b', 3, 4095).answer, '111111111111');
});
