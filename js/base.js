// 模組二（第一部分）：進位轉換。出題、解題、拆步驟說明。
import { randInt, pick } from './rng.js';

export const BASE_MAX_LEVEL = 3;

const DIGITS = '0123456789ABCDEF';
const BASE_NAME = { 2: '二進位', 10: '十進位', 16: '十六進位' };

export function toBase(n, b) {
  if (!Number.isInteger(n) || n < 0) throw new Error('只支援 0 以上的整數');
  if (n === 0) return '0';
  let s = '';
  while (n > 0) {
    s = DIGITS[n % b] + s;
    n = Math.floor(n / b);
  }
  return s;
}

export function fromBase(str, b) {
  const s = String(str).toUpperCase().replace(/\s+/g, '');
  if (s === '') return NaN;
  let n = 0;
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= b) return NaN;
    n = n * b + d;
  }
  return n;
}

/** 二進位從右邊每 4 位一組，中間空一格，比較好讀。 */
export function groupBits(s) {
  const out = [];
  for (let i = s.length; i > 0; i -= 4) out.unshift(s.slice(Math.max(0, i - 4), i));
  return out.join(' ');
}

const digitNote = (d) => (d >= 10 ? `${d}（${DIGITS[d]}）` : `${d}`);

/** 連除法：每一列是 [被除數, 商, 餘數]。 */
export function divisionRows(n, b) {
  const rows = [];
  if (n === 0) return [[0, 0, 0]];
  while (n > 0) {
    rows.push([n, Math.floor(n / b), n % b]);
    n = Math.floor(n / b);
  }
  return rows;
}

export function explainDecToBase(n, b) {
  const rows = divisionRows(n, b);
  const answer = toBase(n, b);
  return [
    `用連除法：一直除以 ${b}，記下每次的餘數，直到商是 0`,
    {
      table: {
        head: ['算式', '商', '餘數'],
        rows: rows.map(([x, q, r]) => [`${x} ÷ ${b}`, String(q), digitNote(r)]),
      },
    },
    `把餘數由下往上讀：${b === 2 ? groupBits(answer) : answer}`,
  ];
}

export function explainBaseToDec(str, b) {
  const s = String(str).toUpperCase();
  const n = s.length;
  const parts = [];
  const values = [];
  for (let i = 0; i < n; i++) {
    const d = DIGITS.indexOf(s[i]);
    const w = b ** (n - 1 - i);
    if (d === 0) continue;
    parts.push(`${digitNote(d)} × ${w}`);
    values.push(d * w);
  }
  const total = fromBase(s, b);
  const placeNote = b === 2
    ? '二進位每一位的位值，從右邊算起是 1、2、4、8、16……'
    : '十六進位每一位的位值，從右邊算起是 1、16、256、4096……';
  if (parts.length === 0) return [placeNote, '每一位都是 0，答案是 0'];
  const steps = [placeNote, b === 2 ? '把是 1 的位數乘上位值再加起來：' : '把每一位的數字乘上位值再加起來：'];
  steps.push(parts.join(' + '));
  if (values.length > 1) steps.push(`= ${values.join(' + ')}`);
  steps.push(`= ${total}`);
  return steps;
}

export function explainBinToHex(bin) {
  const s = String(bin);
  const padded = s.padStart(Math.ceil(s.length / 4) * 4, '0');
  const groups = padded.match(/.{4}/g);
  const rows = groups.map((g) => {
    const v = parseInt(g, 2);
    return [g, digitNote(v), DIGITS[v]];
  });
  const hex = toBase(parseInt(s, 2), 16);
  const steps = ['從右邊開始，每 4 位二進位分成一組（左邊不夠就補 0）'];
  steps.push({ table: { head: ['4 位一組', '十進位', '十六進位'], rows } });
  steps.push(`由左到右接起來：${hex}`);
  return steps;
}

export function explainHexToBin(hex) {
  const s = String(hex).toUpperCase();
  const rows = [...s].map((ch) => {
    const v = DIGITS.indexOf(ch);
    return [ch, digitNote(v), v.toString(2).padStart(4, '0')];
  });
  const bin = toBase(fromBase(s, 16), 2);
  return [
    '每一位十六進位，剛好換成 4 位二進位（8、4、2、1）',
    { table: { head: ['十六進位', '十進位', '4 位二進位'], rows } },
    `接起來，再去掉最左邊多餘的 0：${groupBits(bin)}`,
  ];
}

// ---------- 出題 ----------

const KEYPAD = { 2: 'bin', 10: 'dec', 16: 'hex' };

function problem(level, type, from, to, value) {
  const shown = toBase(value, from);
  let steps;
  if (from === 10) steps = explainDecToBase(value, to);
  else if (to === 10) steps = explainBaseToDec(shown, from);
  else if (from === 2) steps = explainBinToHex(shown);
  else steps = explainHexToBin(shown);
  return {
    module: 'base', level, type,
    label: `${BASE_NAME[from]} → ${BASE_NAME[to]}`,
    prompt: from === 2 ? groupBits(shown) : shown,
    promptBase: from,
    answer: toBase(value, to),
    answerBase: to,
    keypad: KEYPAD[to],
    tags: [type],
    steps,
  };
}

export const BASE_TYPES = {
  b2d: [2, 10],
  d2b: [10, 2],
  h2d: [16, 10],
  d2h: [10, 16],
  b2h: [2, 16],
  h2b: [16, 2],
};

/** 每一級的數值範圍，依位數分級。 */
export const BASE_RANGES = {
  1: { bin: [1, 15], hex: [1, 15], binhex: [1, 15] },
  2: { bin: [16, 63], hex: [16, 255], binhex: [16, 255] },
  3: { bin: [64, 255], hex: [256, 4095], binhex: [256, 4095] },
};

export function makeBase(type, level, value) {
  const [from, to] = BASE_TYPES[type];
  return problem(level, type, from, to, value);
}

export function rangeFor(type, level) {
  const r = BASE_RANGES[level];
  if (type === 'b2d' || type === 'd2b') return r.bin;
  if (type === 'h2d' || type === 'd2h') return r.hex;
  return r.binhex;
}

export function generateBase(level, rng) {
  if (!BASE_RANGES[level]) throw new Error(`進位轉換沒有第 ${level} 級`);
  const type = pick(rng, Object.keys(BASE_TYPES));
  const [min, max] = rangeFor(type, level);
  return makeBase(type, level, randInt(rng, min, max));
}

export const BASE_LEVEL_NAMES = {
  1: '4 位二進位、1 位十六進位',
  2: '6 位二進位、2 位十六進位',
  3: '8 位二進位、3 位十六進位',
};
