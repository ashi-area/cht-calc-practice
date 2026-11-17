// 計概計算：2 的次方、乘除 2、二進位加法、1 的補數、2 的補數、有號數範圍。
import { randInt, pick } from './rng.js';
import { toBase, groupBits } from './base.js';
import { explainLongDivision } from './arith.js';

export const POW2_MAX_LEVEL = 2;
export const BINARY_MAX_LEVEL = 3;

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n) => String(n).split('').map((d) => SUP[d]).join('');
const pad = (n, w) => toBase(n, 2).padStart(w, '0');

// ---------- 2 的次方 ----------

/** 從 2⁰ 或 2¹⁰ 開始一路乘 2 的列表。 */
function powerChain(e) {
  const from = e > 10 ? 10 : 0;
  const list = [];
  for (let k = from; k <= e; k++) list.push(`2${sup(k)} = ${2 ** k}`);
  return [
    from === 10 ? '先記住 2¹⁰ = 1024，再一路乘 2：' : '從 2⁰ = 1 開始，每次乘 2：',
    list.join('、'),
  ];
}

function pow2Problem(type, level, prompt, label, answer, tags, steps) {
  return {
    module: 'pow2', level, type, label, prompt,
    answer: String(answer), answerBase: 10, keypad: 'dec', tags, steps,
  };
}

export function makePow2(e, level = 1) {
  return pow2Problem('pow2', level, `2${sup(e)}`, '2 的次方是多少？', 2 ** e,
    ['pow2', `pow2:${e}`], [...powerChain(e), `所以 2${sup(e)} = ${2 ** e}`]);
}

export function makePow2Log(e, level = 2) {
  return pow2Problem('pow2-log', level, `${2 ** e}`, '是 2 的幾次方？', e,
    ['pow2-log', `pow2:${e}`], [...powerChain(e), `${2 ** e} 是 2${sup(e)}，答案是 ${e}`]);
}

export function makeDouble(n, level = 1) {
  return pow2Problem('x2', level, `${n} × 2`, '乘以 2', n * 2, ['x2'],
    [`乘以 2 就是自己加自己：${n} + ${n} = ${n * 2}`]);
}

export function makeHalf(n, level = 1) {
  if (n % 2 !== 0) throw new Error('除以 2 的題目必須是偶數');
  return pow2Problem('half', level, `${n} ÷ 2`, '除以 2', n / 2, ['half'], explainLongDivision(n, 2));
}

export function generatePow2(level, rng) {
  const r = rng();
  if (level === 1) {
    if (r < 0.5) return makePow2(randInt(rng, 0, 10), 1);
    if (r < 0.75) return makeDouble(randInt(rng, 1, 50), 1);
    return makeHalf(2 * randInt(rng, 1, 50), 1);
  }
  if (level === 2) {
    if (r < 0.35) return makePow2(randInt(rng, 0, 16), 2);
    if (r < 0.7) return makePow2Log(randInt(rng, 1, 16), 2);
    if (r < 0.85) return makeDouble(randInt(rng, 10, 500), 2);
    return makeHalf(2 * randInt(rng, 5, 500), 2);
  }
  throw new Error(`2 的次方沒有第 ${level} 級`);
}

export const POW2_LEVEL_NAMES = {
  1: '2⁰～2¹⁰、乘除 2',
  2: '2⁰～2¹⁶、反推次方',
};

// ---------- 二進位加法 ----------

function binProblem(type, level, label, prompt, answer, tags, steps, extra = {}) {
  return {
    module: 'binary', level, type, label, prompt, promptBase: 2,
    answer: String(answer), answerBase: 2, keypad: 'bin', tags, steps, ...extra,
  };
}

export function explainBinAdd(a, b, width) {
  const A = pad(a, width).split('').reverse().map(Number);
  const B = pad(b, width).split('').reverse().map(Number);
  const steps = ['和十進位一樣由右往左加，只是滿 2 就進 1'];
  let carry = 0;
  for (let i = 0; i < width; i++) {
    const s = A[i] + B[i] + carry;
    let line = `右數第 ${i + 1} 位：${A[i]} + ${B[i]}` + (carry ? ' + 進位 1' : '') + ` = ${s}`;
    if (s === 2) line += '，二進位是 10：寫 0，進 1';
    if (s === 3) line += '，二進位是 11：寫 1，進 1';
    steps.push(line);
    carry = s >= 2 ? 1 : 0;
  }
  if (carry) steps.push('最左邊還有進位 1，補在最前面');
  steps.push(`答案：${groupBits(toBase(a + b, 2))}`);
  return steps;
}

export function makeBinAdd(a, b, width, level) {
  return binProblem('binadd', level, '二進位加法',
    `${groupBits(pad(a, width))} + ${groupBits(pad(b, width))}`,
    toBase(a + b, 2), ['binadd'], explainBinAdd(a, b, width));
}

// ---------- 補數 ----------

export const ones8 = (x) => (~x) & 0xff;
export const twos8 = (x) => (-x) & 0xff;
/** 8 位元 2 補數的位元型樣代表的十進位（-128～127）。 */
export const fromTwos8 = (x) => (x & 0x80 ? x - 256 : x);

export function makeOnes(x, level) {
  const ans = pad(ones8(x), 8);
  return binProblem('ones', level, '8 位元 1 的補數', groupBits(pad(x, 8)), ans, ['ones'], [
    '1 的補數：每一位 0 變 1、1 變 0',
    `${groupBits(pad(x, 8))} → ${groupBits(ans)}`,
  ], { answerText: groupBits(ans) });
}

function twosSteps(x) {
  const o = ones8(x);
  const t = twos8(x);
  const steps = [
    `先求 1 的補數（0 變 1、1 變 0）：${groupBits(pad(x, 8))} → ${groupBits(pad(o, 8))}`,
    `再加 1：${groupBits(pad(o, 8))} + 1 = ${groupBits(pad(t, 8))}`,
  ];
  if (o + 1 > 0xff) steps.push('加 1 之後超過 8 位，最前面多出來的進位直接丟掉');
  return steps;
}

export function makeTwos(x, level) {
  const ans = pad(twos8(x), 8);
  return binProblem('twos', level, '8 位元 2 的補數', groupBits(pad(x, 8)), ans, ['twos'],
    ['2 的補數 = 1 的補數再加 1', ...twosSteps(x)], { answerText: groupBits(ans) });
}

export function makeTwosDecode(x, level = 3) {
  const v = fromTwos8(x);
  const bits = groupBits(pad(x, 8));
  let steps;
  if (v >= 0) {
    steps = [`最左邊是 0，代表正數，直接換成十進位`, `${bits} = ${v}`];
  } else {
    steps = [
      '最左邊是 1，代表負數，要先算出它有多大',
      ...twosSteps(x),
      `${groupBits(pad(-v, 8))} = ${-v}，加上負號，答案是 −${-v}`,
    ];
  }
  return {
    ...binProblem('twos-decode', level, '8 位元 2 補數代表十進位多少？', bits, String(v), ['twos-decode'], steps),
    answerKind: 'signed', answerBase: 10, keypad: 'signed', answerText: v < 0 ? `−${-v}` : String(v),
  };
}

export function makeTwosEncode(v, level = 3) {
  if (v >= 0 || v < -128) throw new Error('只出 -1～-128 的負數');
  const m = -v;
  const ans = pad(twos8(m), 8);
  return {
    ...binProblem('twos-encode', level, '用 8 位元 2 的補數表示', `−${m}`, ans, ['twos-encode'], [
      `負數要用 2 的補數表示：先寫出 ${m} 的 8 位元二進位：${groupBits(pad(m, 8))}`,
      ...twosSteps(m),
    ]),
    promptBase: 10, answerText: groupBits(ans),
  };
}

// ---------- 有號數範圍 ----------

const RANGE_KIND = {
  unsigned: '無號數（只有 0 和正數）',
  ones: '1 的補數',
  twos: '2 的補數',
};

export function rangeOf(kind, n) {
  if (kind === 'unsigned') return [0, 2 ** n - 1];
  if (kind === 'ones') return [-(2 ** (n - 1) - 1), 2 ** (n - 1) - 1];
  return [-(2 ** (n - 1)), 2 ** (n - 1) - 1];
}

const signedText = (v) => (v < 0 ? `−${-v}` : String(v));

export function makeRange(kind, n, which, level = 3) {
  const [min, max] = rangeOf(kind, n);
  const v = which === 'min' ? min : max;
  const h = n - 1;
  let steps;
  if (kind === 'unsigned') {
    steps = [`${n} 位元全部用來表示大小，最大是 ${n} 個 1`, `2${sup(n)} − 1 = ${2 ** n} − 1 = ${max}`];
  } else if (kind === 'ones') {
    steps = [
      `最左邊 1 位當正負號，剩下 ${h} 位表示大小`,
      `最大：2${sup(h)} − 1 = ${max}；最小：−(2${sup(h)} − 1) = ${signedText(min)}`,
      '1 的補數有 +0 和 −0 兩種 0，所以負數少一個',
    ];
  } else {
    steps = [
      `最左邊 1 位當正負號，剩下 ${h} 位表示大小`,
      `最大：2${sup(h)} − 1 = ${max}；最小：−2${sup(h)} = ${signedText(min)}`,
      '2 的補數只有一種 0，所以負數比正數多一個',
    ];
  }
  return {
    module: 'binary', level, type: `range-${kind}`, label: `${n} 位元${RANGE_KIND[kind]}`,
    prompt: which === 'min' ? '最小值是多少？' : '最大值是多少？',
    answer: String(v), answerBase: 10, answerKind: 'signed', keypad: 'signed',
    answerText: signedText(v), tags: [`range-${kind}`], steps,
  };
}

export function generateBinary(level, rng) {
  const r = rng();
  if (level === 1) {
    if (r < 0.6) return makeBinAdd(randInt(rng, 0, 15), randInt(rng, 0, 15), 4, 1);
    return makeOnes(randInt(rng, 0, 255), 1);
  }
  if (level === 2) {
    if (r < 0.35) return makeBinAdd(randInt(rng, 0, 255), randInt(rng, 0, 255), 8, 2);
    if (r < 0.55) return makeOnes(randInt(rng, 0, 255), 2);
    return makeTwos(randInt(rng, 0, 255), 2);
  }
  if (level === 3) {
    if (r < 0.35) return makeTwosDecode(randInt(rng, 0, 255), 3);
    if (r < 0.7) return makeTwosEncode(-randInt(rng, 1, 128), 3);
    const kind = pick(rng, ['unsigned', 'ones', 'twos', 'twos']);
    const which = kind === 'unsigned' ? 'max' : pick(rng, ['min', 'max']);
    return makeRange(kind, pick(rng, [4, 8, 8, 16]), which, 3);
  }
  throw new Error(`二進位與補數沒有第 ${level} 級`);
}

export const BINARY_LEVEL_NAMES = {
  1: '4 位元加法、1 的補數',
  2: '8 位元加法、1 和 2 的補數',
  3: '2 補數換十進位、負數表示、範圍',
};
