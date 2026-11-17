// 模組一：四則運算。出題、解題、拆步驟說明。
import { randInt, pick } from './rng.js';

export const ARITH_MAX_LEVEL = 6;

const PLACES = ['個位', '十位', '百位', '千位', '萬位'];
const digitsOf = (n) => String(n).split('').reverse().map(Number); // 個位在前

function base(level, type, prompt, answer, tags, steps, extra = {}) {
  return {
    module: 'arith', level, type, label: '', prompt,
    answer: String(answer), answerBase: 10, keypad: 'dec', tags, steps, ...extra,
  };
}

// ---------- 說明 ----------

export function explainAdd1(a, b) {
  const sum = a + b;
  if (sum < 10 || a === 0 || b === 0) {
    return [`${a} + ${b} = ${sum}`];
  }
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const need = 10 - big;
  return [
    `先湊成 10：${big} 還差 ${need} 就是 10`,
    `把 ${small} 拆成 ${need} 和 ${small - need}`,
    `${big} + ${need} = 10`,
    `10 + ${small - need} = ${sum}`,
  ];
}

export function explainSub1(a, b) {
  return [
    `${a} − ${b}：想成「${b} 加多少會變 ${a}」`,
    `${b} + ${a - b} = ${a}`,
    `所以 ${a} − ${b} = ${a - b}`,
  ];
}

/** 直式加法，任意位數：由個位往左加，滿 10 進 1。 */
export function explainAddColumns(a, b) {
  const A = digitsOf(a), B = digitsOf(b);
  const n = Math.max(A.length, B.length);
  const steps = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const x = A[i] || 0, y = B[i] || 0;
    const s = x + y + carry;
    steps.push(`${PLACES[i]}：${x} + ${y}` + (carry ? ' + 進位 1' : '') + ` = ${s}` +
      (s >= 10 ? `，寫 ${s - 10}，進 1 到${PLACES[i + 1]}` : ''));
    carry = s >= 10 ? 1 : 0;
  }
  steps.push(`答案：${a + b}`);
  return steps;
}

/** 直式減法，任意位數，包含「中間是 0 要連續借位」。a 必須 ≥ b。 */
export function explainSubColumns(a, b) {
  const A = digitsOf(a), B = digitsOf(b);
  const steps = [];
  for (let i = 0; i < A.length; i++) {
    const y = B[i] || 0;
    if (A[i] < y) {
      const orig = A[i];
      let j = i + 1;
      while (A[j] === 0) j++;
      if (j === i + 1) {
        steps.push(`${PLACES[i]}：${orig} − ${y} 不夠減，向${PLACES[j]}借 1`);
        steps.push(`${PLACES[j]}的 ${A[j]} 變成 ${A[j] - 1}，${PLACES[i]}的 ${orig} 變成 ${orig + 10}`);
      } else {
        const zeros = PLACES.slice(i + 1, j).join('、');
        steps.push(`${PLACES[i]}：${orig} − ${y} 不夠減，${zeros}是 0 沒辦法借，要一路往${PLACES[j]}借`);
        steps.push(`${PLACES[j]}的 ${A[j]} 變成 ${A[j] - 1}，借來的 1 讓${zeros}變成 10，再借 1 給${PLACES[i]}，${zeros}剩 9`);
        steps.push(`${PLACES[i]}的 ${orig} 變成 ${orig + 10}`);
        for (let k = i + 1; k < j; k++) A[k] = 9;
      }
      A[j] -= 1;
      A[i] += 10;
    }
    steps.push(`${PLACES[i]}：${A[i]} − ${y} = ${A[i] - y}`);
  }
  steps.push(`答案：${a - b}`);
  steps.push(`驗算：${a - b} + ${b} = ${a}`);
  return steps;
}

export function explainMulTable(a, b) {
  const p = a * b;
  if (b >= 6) {
    return [
      `把 ${b} 拆成 5 和 ${b - 5}`,
      `${a} × ${b} = ${a} × 5 + ${a} × ${b - 5}`,
      `= ${a * 5} + ${a * (b - 5)}`,
      `= ${p}`,
    ];
  }
  const terms = Array(b).fill(a).join(' + ');
  return [`${a} × ${b} 就是 ${b} 個 ${a} 相加`, `${terms} = ${p}`];
}

const joinParts = (xs) => (xs.length <= 2 ? xs.join(' 和 ') : `${xs.slice(0, -1).join('、')} 和 ${xs[xs.length - 1]}`);
const PLACE_UNIT = ['', '十', '百'];
const ZEROS = ['', '一個 0', '兩個 0'];

/** 多位數 × 一位數：依位值拆開再相加。 */
export function explainMulNx1(a, b) {
  const D = digitsOf(a);
  const parts = D.map((d, i) => d * 10 ** i).filter((x) => x > 0).reverse();
  const p = a * b;
  if (parts.length === 1) {
    const i = D.length - 1;
    const lead = D[i];
    return [`先算 ${lead} × ${b} = ${lead * b}`, `${a} 是 ${lead} 個${PLACE_UNIT[i]}，後面補${ZEROS[i]}：${p}`];
  }
  return [
    `把 ${a} 拆成 ${joinParts(parts)}`,
    `${a} × ${b} = ${parts.map((x) => `${x} × ${b}`).join(' + ')}`,
    `= ${parts.map((x) => x * b).join(' + ')}`,
    `= ${p}`,
  ];
}
export const explainMul2x1 = explainMulNx1;

/** 直式除法（除數一位數），最後用乘法驗算。 */
export function explainLongDivision(n, d) {
  const D = String(n).split('').map(Number);
  const steps = [];
  let rem = 0;
  let started = false;
  let q = '';
  for (let i = 0; i < D.length; i++) {
    const cur = rem * 10 + D[i];
    if (!started && cur < d && i < D.length - 1) {
      steps.push(`先看最前面的 ${cur}，比 ${d} 小不夠除，再多看一位：${cur * 10 + D[i + 1]}`);
      rem = cur;
      continue;
    }
    if (started) steps.push(`把下一位 ${D[i]} 拿下來，變成 ${cur}`);
    started = true;
    const qd = Math.floor(cur / d);
    const r = cur - qd * d;
    steps.push(`${cur} ÷ ${d} 商 ${qd}：${qd} × ${d} = ${qd * d}，${cur} − ${qd * d} = ${r}`);
    q += qd;
    rem = r;
  }
  const quotient = Number(q);
  steps.push(rem ? `商是 ${quotient}，餘數是 ${rem}` : `商是 ${quotient}，剛好除盡`);
  steps.push(rem ? `驗算：${quotient} × ${d} + ${rem} = ${n}` : `驗算：${quotient} × ${d} = ${n}`);
  return steps;
}

// ---------- 四則混合：依「括號 → 乘除 → 加減」一步一步算 ----------

const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };

export function formatTokens(tokens) {
  return tokens.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

/** 算一次最優先的運算。回傳新的算式和這一步的說明。 */
function reduceOnce(tokens) {
  let open = -1, close = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '(') open = i;
    if (tokens[i] === ')') { close = i; break; }
  }
  const lo = close >= 0 ? open + 1 : 0;
  const hi = close >= 0 ? close : tokens.length;
  const seg = tokens.slice(lo, hi);
  let k = seg.findIndex((t) => t === '×' || t === '÷');
  const mulDiv = k >= 0;
  if (!mulDiv) k = seg.findIndex((t) => t === '+' || t === '−');
  const [a, op, b] = [seg[k - 1], seg[k], seg[k + 1]];
  const v = OPS[op](a, b);
  if (!Number.isInteger(v) || v < 0) throw new Error(`中間結果不是 0 以上的整數：${a} ${op} ${b}`);
  const newSeg = [...seg.slice(0, k - 1), v, ...seg.slice(k + 2)];
  let out;
  if (close >= 0 && newSeg.length === 1) out = [...tokens.slice(0, open), v, ...tokens.slice(close + 1)];
  else out = [...tokens.slice(0, lo), ...newSeg, ...tokens.slice(hi)];
  const why = close >= 0 ? '先算括號裡面' : mulDiv ? '先算乘除' : '再算加減';
  return { tokens: out, line: `${why}：${a} ${op} ${b} = ${v}` };
}

export function evalTokens(tokens) {
  let t = tokens.slice();
  const steps = [];
  while (t.length > 1) {
    const r = reduceOnce(t);
    t = r.tokens;
    steps.push(r.line);
    if (t.length > 1) steps.push(`變成 ${formatTokens(t)}`);
  }
  steps.push(`答案：${t[0]}`);
  return { value: t[0], steps };
}

const MIX_TEMPLATES = [
  (r) => [randInt(r, 2, 40), '+', randInt(r, 2, 12), '×', randInt(r, 2, 9)],
  (r) => [randInt(r, 2, 12), '×', randInt(r, 2, 9), '−', randInt(r, 1, 20)],
  (r) => ['(', randInt(r, 2, 20), '+', randInt(r, 2, 20), ')', '×', randInt(r, 2, 9)],
  (r) => ['(', randInt(r, 10, 40), '−', randInt(r, 1, 9), ')', '×', randInt(r, 2, 9)],
  (r) => { const c = randInt(r, 2, 9); return [randInt(r, 20, 60), '−', c * randInt(r, 2, 9), '÷', c]; },
  (r) => { const c = randInt(r, 2, 9); const s = c * randInt(r, 2, 12); const a = randInt(r, 1, s - 1); return ['(', a, '+', s - a, ')', '÷', c]; },
  (r) => [randInt(r, 2, 9), '×', randInt(r, 2, 9), '+', randInt(r, 2, 9), '×', randInt(r, 2, 9)],
  (r) => [randInt(r, 2, 40), '+', randInt(r, 2, 9), '×', randInt(r, 2, 9), '−', randInt(r, 1, 20)],
  (r) => [randInt(r, 2, 9), '×', '(', randInt(r, 2, 20), '+', randInt(r, 2, 20), ')'],
  (r) => { const b = randInt(r, 2, 9); return [b * randInt(r, 2, 12), '÷', b, '+', randInt(r, 2, 9), '×', randInt(r, 2, 9)]; },
];

export function makeMixed(tokens) {
  const { value, steps } = evalTokens(tokens);
  const paren = tokens.includes('(');
  return base(6, 'mix', formatTokens(tokens), value, [paren ? 'mix-paren' : 'mix-order'], steps);
}

function generateMixed(rng) {
  for (let i = 0; i < 100; i++) {
    const tokens = pick(rng, MIX_TEMPLATES)(rng);
    try {
      const p = makeMixed(tokens);
      if (Number(p.answer) <= 999) return p;
    } catch { /* 中間出現負數或除不盡，重抽 */ }
  }
  return makeMixed([2, '+', 3, '×', 4]);
}

// ---------- 出題 ----------

export function makeAdd1(a, b) {
  const tags = [a + b >= 10 ? 'add1-cross10' : 'add1', `add:${Math.min(a, b)}+${Math.max(a, b)}`];
  return base(1, 'add1', `${a} + ${b}`, a + b, tags, explainAdd1(a, b));
}
export function makeSub1(a, b) {
  return base(1, 'sub1', `${a} − ${b}`, a - b, ['sub1', `sub:${a}-${b}`], explainSub1(a, b));
}
export function makeAdd2(a, b) {
  const carry = (a % 10) + (b % 10) >= 10;
  return base(2, 'add2', `${a} + ${b}`, a + b, [carry ? 'add2-carry' : 'add2'], explainAddColumns(a, b));
}
export function makeSub2(a, b) {
  const borrow = a % 10 < b % 10;
  return base(2, 'sub2', `${a} − ${b}`, a - b, [borrow ? 'sub2-borrow' : 'sub2'], explainSubColumns(a, b));
}
export function makeMulTable(a, b) {
  return base(3, 'mul-table', `${a} × ${b}`, a * b,
    ['mul-table', `mul:${Math.min(a, b)}x${Math.max(a, b)}`], explainMulTable(a, b));
}
export function makeMul2x1(a, b) {
  return base(3, 'mul2x1', `${a} × ${b}`, a * b, ['mul2x1'], explainMulNx1(a, b));
}
export function makeDivExact(n, d) {
  if (n % d !== 0) throw new Error('整除題必須除得盡');
  return base(4, 'div-exact', `${n} ÷ ${d}`, n / d, ['div-exact', `div:${d}`], explainLongDivision(n, d));
}

/** 減法時有沒有借位、有沒有跨過 0 連續借位。 */
export function borrowKind(a, b) {
  const A = digitsOf(a), B = digitsOf(b);
  let kind = 'none';
  for (let i = 0; i < A.length; i++) {
    if (A[i] < (B[i] || 0)) {
      if (A[i + 1] === 0) return 'chain';
      kind = 'borrow';
      A[i + 1] -= 1;
    }
  }
  return kind;
}

export function makeAdd3(a, b) {
  return base(5, 'add3', `${a} + ${b}`, a + b, ['add3'], explainAddColumns(a, b));
}
export function makeSub3(a, b) {
  const kind = borrowKind(a, b);
  const tag = kind === 'chain' ? 'sub3-chain' : kind === 'borrow' ? 'sub3-borrow' : 'sub3';
  return base(5, 'sub3', `${a} − ${b}`, a - b, [tag], explainSubColumns(a, b));
}
export function makeMul3x1(a, b) {
  return base(5, 'mul3x1', `${a} × ${b}`, a * b, ['mul3x1'], explainMulNx1(a, b));
}
export function makeDivRem(n, d) {
  const q = Math.floor(n / d), r = n % d;
  return base(5, 'div-rem', `${n} ÷ ${d}`, `${q},${r}`, ['div-rem'], explainLongDivision(n, d), {
    answerKind: 'divmod', keypad: 'divmod', answerText: `商 ${q}，餘數 ${r}`,
  });
}

export function generateArith(level, rng) {
  switch (level) {
    case 1: {
      if (rng() < 0.5) return makeAdd1(randInt(rng, 0, 9), randInt(rng, 0, 9));
      const a = randInt(rng, 0, 9);
      return makeSub1(a, randInt(rng, 0, a));
    }
    case 2: {
      if (rng() < 0.5) return makeAdd2(randInt(rng, 10, 99), randInt(rng, 10, 99));
      const a = randInt(rng, 11, 99);
      return makeSub2(a, randInt(rng, 10, a - 1));
    }
    case 3: {
      if (rng() < 0.5) return makeMulTable(randInt(rng, 2, 9), randInt(rng, 2, 9));
      return makeMul2x1(randInt(rng, 11, 99), randInt(rng, 2, 9));
    }
    case 4: {
      const d = randInt(rng, 2, 9);
      const q = randInt(rng, Math.ceil(10 / d), Math.floor(999 / d));
      return makeDivExact(d * q, d);
    }
    case 5: {
      const kind = randInt(rng, 0, 3);
      if (kind === 0) return makeAdd3(randInt(rng, 100, 999), randInt(rng, 100, 999));
      if (kind === 1) {
        const a = randInt(rng, 101, 999);
        return makeSub3(a, randInt(rng, 100, a - 1));
      }
      if (kind === 2) return makeMul3x1(randInt(rng, 100, 999), randInt(rng, 2, 9));
      const d = randInt(rng, 2, 9);
      let n;
      do { n = randInt(rng, 10, 999); } while (n % d === 0);
      return makeDivRem(n, d);
    }
    case 6:
      return generateMixed(rng);
    default:
      throw new Error(`四則運算沒有第 ${level} 級`);
  }
}

export const ARITH_LEVEL_NAMES = {
  1: '一位數加減',
  2: '兩位數加減',
  3: '九九乘法、兩位數 × 一位數',
  4: '整除（兩三位數 ÷ 一位數）',
  5: '三位數加減乘、有餘數的除法',
  6: '四則混合（先乘除後加減、括號）',
};
