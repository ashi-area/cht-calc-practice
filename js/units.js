// 計概計算：容量單位換算，一律以 1 KB = 1024 Byte 計算。
import { randInt, pick } from './rng.js';

export const UNITS_MAX_LEVEL = 3;
export const UNITS = ['bit', 'Byte', 'KB', 'MB', 'GB'];

/** 相鄰兩個單位之間差幾倍：bit 和 Byte 差 8，其他差 1024。 */
const stepFactor = (i) => (i === 0 ? 8 : 1024); // UNITS[i] → UNITS[i+1]

export function convert(value, from, to) {
  let i = UNITS.indexOf(from);
  const j = UNITS.indexOf(to);
  let v = value;
  while (i > j) { v *= stepFactor(i - 1); i--; }
  while (i < j) { v /= stepFactor(i); i++; }
  return v;
}

/** 乘 1024 時，拆成 1000 和 24 比較好心算。 */
function times(n, f) {
  if (f === 1024 && n < 100) return `${n} × 1024 = ${n * 1024}（${n} × 1000 + ${n} × 24）`;
  return `${n} × ${f} = ${n * f}`;
}

export function explainConvert(value, from, to) {
  let i = UNITS.indexOf(from);
  const j = UNITS.indexOf(to);
  const steps = [];
  let v = value;
  if (i > j) {
    steps.push('換成比較小的單位，數字會變大：每往下一層就乘（KB、MB、GB 之間是 1024，Byte 換 bit 是 8）');
    while (i > j) {
      const f = stepFactor(i - 1);
      steps.push(`${v} ${UNITS[i]} = ${times(v, f)} ${UNITS[i - 1]}`);
      v *= f;
      i--;
    }
  } else {
    steps.push('換成比較大的單位，數字會變小：每往上一層就除（KB、MB、GB 之間是 1024，bit 換 Byte 是 8）');
    while (i < j) {
      const f = stepFactor(i);
      steps.push(`${v} ${UNITS[i]} = ${v} ÷ ${f} = ${v / f} ${UNITS[i + 1]}`);
      v /= f;
      i++;
    }
  }
  steps.push(`答案：${v}`);
  return steps;
}

export function makeUnits(value, from, to, level) {
  const ans = convert(value, from, to);
  if (!Number.isInteger(ans)) throw new Error('換算結果必須是整數');
  return {
    module: 'units', level, type: 'units', label: '容量換算（1 KB = 1024 Byte）',
    prompt: `${value} ${from} = ? ${to}`,
    answer: String(ans), answerBase: 10, keypad: 'dec',
    tags: [`units:${from}>${to}`], steps: explainConvert(value, from, to),
  };
}

const DOWN1 = [['KB', 'Byte'], ['MB', 'KB'], ['GB', 'MB'], ['Byte', 'bit']];
const DOWN2 = [['MB', 'Byte'], ['GB', 'KB'], ['KB', 'bit']];

export function generateUnits(level, rng) {
  if (level === 1) {
    const [from, to] = pick(rng, DOWN1);
    return makeUnits(randInt(rng, 1, 8), from, to, 1);
  }
  if (level === 2) {
    const [big, small] = pick(rng, DOWN1);
    const n = randInt(rng, 1, 16);
    if (rng() < 0.5) return makeUnits(n, big, small, 2);
    return makeUnits(convert(n, big, small), small, big, 2);
  }
  if (level === 3) {
    const [big, small] = pick(rng, DOWN2);
    const n = randInt(rng, 1, 4);
    if (rng() < 0.6) return makeUnits(n, big, small, 3);
    return makeUnits(convert(n, big, small), small, big, 3);
  }
  throw new Error(`容量單位沒有第 ${level} 級`);
}

export const UNITS_LEVEL_NAMES = {
  1: '大單位換小單位（相鄰）',
  2: '小單位換大單位（相鄰）',
  3: '跨兩層換算',
};
