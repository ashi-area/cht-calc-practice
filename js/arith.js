// 模組一：四則運算。出題、解題、拆步驟說明。
import { randInt } from './rng.js';

export const ARITH_MAX_LEVEL = 3;

const digits = (n) => ({ ones: n % 10, tens: Math.floor(n / 10) % 10 });

function base(level, type, prompt, answer, tags, steps) {
  return {
    module: 'arith', level, type, label: '', prompt,
    answer: String(answer), answerBase: 10, keypad: 'dec', tags, steps,
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

export function explainAddColumns(a, b) {
  const A = digits(a), B = digits(b);
  const s1 = A.ones + B.ones;
  const c1 = s1 >= 10 ? 1 : 0;
  const s10 = A.tens + B.tens + c1;
  const steps = [];
  steps.push(`個位：${A.ones} + ${B.ones} = ${s1}` + (c1 ? `，寫 ${s1 - 10}，進 1 到十位` : ''));
  steps.push(`十位：${A.tens} + ${B.tens}` + (c1 ? ' + 進位 1' : '') + ` = ${s10}` +
    (s10 >= 10 ? `，寫 ${s10 - 10}，進 1 到百位` : ''));
  steps.push(`答案：${a + b}`);
  return steps;
}

export function explainSubColumns(a, b) {
  const A = digits(a), B = digits(b);
  const diff = a - b;
  const steps = [];
  if (A.ones < B.ones) {
    steps.push(`個位：${A.ones} − ${B.ones} 不夠減，向十位借 1`);
    steps.push(`十位的 ${A.tens} 變成 ${A.tens - 1}，個位的 ${A.ones} 變成 ${A.ones + 10}`);
    steps.push(`個位：${A.ones + 10} − ${B.ones} = ${A.ones + 10 - B.ones}`);
    steps.push(`十位：${A.tens - 1} − ${B.tens} = ${A.tens - 1 - B.tens}`);
  } else {
    steps.push(`個位：${A.ones} − ${B.ones} = ${A.ones - B.ones}`);
    steps.push(`十位：${A.tens} − ${B.tens} = ${A.tens - B.tens}`);
  }
  steps.push(`答案：${diff}`);
  steps.push(`驗算：${diff} + ${b} = ${a}`);
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

export function explainMul2x1(a, b) {
  const { ones, tens } = digits(a);
  const t = tens * 10;
  const p = a * b;
  if (ones === 0) {
    return [`先算 ${tens} × ${b} = ${tens * b}`, `${a} 是 ${tens} 個十，後面補一個 0：${p}`];
  }
  return [
    `把 ${a} 拆成 ${t} 和 ${ones}`,
    `${a} × ${b} = ${t} × ${b} + ${ones} × ${b}`,
    `= ${t * b} + ${ones * b}`,
    `= ${p}`,
  ];
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
  return base(3, 'mul2x1', `${a} × ${b}`, a * b, ['mul2x1'], explainMul2x1(a, b));
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
    default:
      throw new Error(`四則運算沒有第 ${level} 級`);
  }
}

export const ARITH_LEVEL_NAMES = {
  1: '一位數加減',
  2: '兩位數加減',
  3: '九九乘法、兩位數 × 一位數',
};
