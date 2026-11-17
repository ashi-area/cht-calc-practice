import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import { convert, makeUnits, explainConvert, generateUnits, UNITS_MAX_LEVEL } from '../js/units.js';

test('換算：以 1024 計，bit 和 Byte 差 8', () => {
  eq(convert(1, 'KB', 'Byte'), 1024);
  eq(convert(1, 'MB', 'Byte'), 1048576);
  eq(convert(1, 'GB', 'KB'), 1048576);
  eq(convert(1, 'Byte', 'bit'), 8);
  eq(convert(2, 'KB', 'bit'), 16384);
  eq(convert(6144, 'KB', 'MB'), 6);
  eq(convert(40, 'bit', 'Byte'), 5);
  eq(convert(4, 'GB', 'MB'), 4096);
});

test('說明：往小單位乘、往大單位除，1024 拆成 1000 和 24', () => {
  eq(explainConvert(3, 'MB', 'Byte'), [
    '換成比較小的單位，數字會變大：每往下一層就乘（KB、MB、GB 之間是 1024，Byte 換 bit 是 8）',
    '3 MB = 3 × 1024 = 3072（3 × 1000 + 3 × 24） KB',
    '3072 KB = 3072 × 1024 = 3145728 Byte',
    '答案：3145728',
  ]);
  const s = explainConvert(6144, 'KB', 'MB');
  eq(s[1], '6144 KB = 6144 ÷ 1024 = 6 MB');
  eq(s[2], '答案：6');
});

test('換不成整數時報錯', () => {
  let threw = false;
  try { makeUnits(100, 'KB', 'MB', 2); } catch { threw = true; }
  ok(threw);
});

test('容量單位模組：每一級隨機出題，答案都是整數且和反向換算一致', () => {
  const rng = mulberry32(31);
  for (let lv = 1; lv <= UNITS_MAX_LEVEL; lv++) {
    for (let i = 0; i < 2000; i++) {
      const p = generateUnits(lv, rng);
      const m = p.prompt.match(/^(\d+) (\w+) = \? (\w+)$/);
      ok(m, p.prompt);
      const [, v, from, to] = m;
      ok(Number.isInteger(Number(p.answer)) && Number(p.answer) > 0, p.prompt);
      eq(convert(Number(p.answer), to, from), Number(v), `反向換算 ${p.prompt}`);
      ok(p.answer.length <= 12, '答案太長，鍵盤打不下');
    }
  }
});
