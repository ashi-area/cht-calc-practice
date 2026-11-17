import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import {
  makePow2, makePow2Log, makeDouble, makeHalf, generatePow2, POW2_MAX_LEVEL,
  makeBinAdd, explainBinAdd, ones8, twos8, fromTwos8, makeOnes, makeTwos, makeTwosDecode, makeTwosEncode,
  rangeOf, makeRange, generateBinary, BINARY_MAX_LEVEL, sup,
} from '../js/bits.js';

test('上標數字', () => {
  eq(sup(0), '⁰');
  eq(sup(16), '¹⁶');
});

test('2 的次方：0、10、最大 16', () => {
  eq(makePow2(0).answer, '1');
  eq(makePow2(10).answer, '1024');
  eq(makePow2(16).answer, '65536');
  eq(makePow2(0).prompt, '2⁰');
  eq(makePow2(3).steps, ['從 2⁰ = 1 開始，每次乘 2：', '2⁰ = 1、2¹ = 2、2² = 4、2³ = 8', '所以 2³ = 8']);
  eq(makePow2(12).steps[0], '先記住 2¹⁰ = 1024，再一路乘 2：', '超過 10 次方從 1024 開始');
  eq(makePow2(12).steps[1], '2¹⁰ = 1024、2¹¹ = 2048、2¹² = 4096');
});

test('反推次方：1 是 2⁰、65536 是 2¹⁶', () => {
  eq(makePow2Log(1).answer, '1');
  eq(makePow2Log(16).prompt, '65536');
  eq(makePow2Log(16).answer, '16');
});

test('乘除 2：0 以外的偶數才能出除以 2', () => {
  eq(makeDouble(500).answer, '1000');
  eq(makeHalf(1000).answer, '500');
  eq(makeHalf(2).answer, '1');
  let threw = false;
  try { makeHalf(7); } catch { threw = true; }
  ok(threw);
});

test('2 的次方模組：每一級隨機出題答案正確', () => {
  const rng = mulberry32(21);
  for (let lv = 1; lv <= POW2_MAX_LEVEL; lv++) {
    for (let i = 0; i < 2000; i++) {
      const p = generatePow2(lv, rng);
      let expect;
      if (p.type === 'pow2') expect = 2 ** Number(p.prompt.slice(1).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''));
      if (p.type === 'pow2-log') expect = Math.log2(Number(p.prompt));
      if (p.type === 'x2') expect = Number(p.prompt.split(' ')[0]) * 2;
      if (p.type === 'half') expect = Number(p.prompt.split(' ')[0]) / 2;
      eq(Number(p.answer), expect, p.prompt);
      ok(Number.isInteger(expect));
      if (lv === 1 && p.type === 'pow2') ok(expect <= 1024, 'Lv1 最多 2¹⁰');
    }
  }
});

test('二進位加法：沒有進位、連續進位、最左邊多一位', () => {
  eq(makeBinAdd(5, 2, 4, 1).answer, '111');
  eq(makeBinAdd(15, 1, 4, 1).answer, '10000');
  eq(makeBinAdd(255, 255, 8, 2).answer, '111111110');
  eq(makeBinAdd(0, 0, 4, 1).answer, '0');
  eq(makeBinAdd(5, 2, 4, 1).prompt, '0101 + 0010');
  eq(explainBinAdd(3, 1, 4), [
    '和十進位一樣由右往左加，只是滿 2 就進 1',
    '右數第 1 位：1 + 1 = 2，二進位是 10：寫 0，進 1',
    '右數第 2 位：1 + 0 + 進位 1 = 2，二進位是 10：寫 0，進 1',
    '右數第 3 位：0 + 0 + 進位 1 = 1',
    '右數第 4 位：0 + 0 = 0',
    '答案：100',
  ]);
  const s = explainBinAdd(15, 15, 4);
  ok(s.includes('右數第 2 位：1 + 1 + 進位 1 = 3，二進位是 11：寫 1，進 1'), '1 + 1 + 1');
  ok(s.includes('最左邊還有進位 1，補在最前面'));
});

test('二進位加法：全部 4 位元組合的答案都正確', () => {
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) eq(makeBinAdd(a, b, 4, 1).answer, (a + b).toString(2));
  }
});

test('1 的補數：0、255、一般值', () => {
  eq(ones8(0), 255);
  eq(ones8(255), 0);
  eq(makeOnes(0b10110010, 1).answer, '01001101');
  eq(makeOnes(255, 1).answerText, '0000 0000');
});

test('2 的補數：0 的補數是 0（進位丟掉）、128 的補數是自己', () => {
  eq(twos8(0), 0);
  eq(twos8(1), 255);
  eq(twos8(128), 128);
  eq(makeTwos(0, 2).answer, '00000000');
  ok(makeTwos(0, 2).steps.includes('加 1 之後超過 8 位，最前面多出來的進位直接丟掉'));
  eq(makeTwos(0b00010100, 2).answer, '11101100');
});

test('2 的補數換十進位：0、127、−1、−128', () => {
  eq(fromTwos8(0), 0);
  eq(fromTwos8(127), 127);
  eq(fromTwos8(255), -1);
  eq(fromTwos8(128), -128);
  const p = makeTwosDecode(0b11111011);
  eq(p.answer, '-5');
  eq(p.answerText, '−5');
  eq(p.keypad, 'signed');
  eq(p.steps[p.steps.length - 1], '0000 0101 = 5，加上負號，答案是 −5');
  eq(makeTwosDecode(128).answer, '-128');
  eq(makeTwosDecode(0b01100100).steps[0], '最左邊是 0，代表正數，直接換成十進位');
});

test('負數換 2 的補數：−1、−20、−128；正數或超出範圍報錯', () => {
  eq(makeTwosEncode(-1).answer, '11111111');
  eq(makeTwosEncode(-20).answer, '11101100');
  eq(makeTwosEncode(-128).answer, '10000000');
  let threw = 0;
  for (const v of [0, 5, -129]) { try { makeTwosEncode(v); } catch { threw++; } }
  eq(threw, 3);
});

test('2 的補數：-128～127 每個值編碼再解碼都還原', () => {
  for (let v = -128; v <= 127; v++) eq(fromTwos8((v + 256) & 0xff), v);
  for (let m = 1; m <= 128; m++) eq(fromTwos8(twos8(m)), -m);
});

test('數值範圍：4、8、16 位元', () => {
  eq(rangeOf('twos', 8), [-128, 127]);
  eq(rangeOf('ones', 8), [-127, 127]);
  eq(rangeOf('unsigned', 8), [0, 255]);
  eq(rangeOf('twos', 4), [-8, 7]);
  eq(rangeOf('twos', 16), [-32768, 32767]);
  eq(rangeOf('unsigned', 16), [0, 65535]);
  const p = makeRange('twos', 8, 'min');
  eq(p.answer, '-128');
  eq(p.answerText, '−128');
  eq(makeRange('ones', 4, 'min').answer, '-7');
});

test('二進位與補數模組：每一級隨機出題，答案和另外算的一致', () => {
  const rng = mulberry32(22);
  for (let lv = 1; lv <= BINARY_MAX_LEVEL; lv++) {
    for (let i = 0; i < 2000; i++) {
      const p = generateBinary(lv, rng);
      const bits = p.prompt.replace(/\s/g, '');
      if (p.type === 'binadd') {
        const [a, b] = p.prompt.split(' + ').map((x) => parseInt(x.replace(/\s/g, ''), 2));
        eq(parseInt(p.answer, 2), a + b);
      } else if (p.type === 'ones') eq(parseInt(p.answer, 2), 255 - parseInt(bits, 2));
      else if (p.type === 'twos') eq(parseInt(p.answer, 2), (256 - parseInt(bits, 2)) % 256);
      else if (p.type === 'twos-decode') eq(Number(p.answer), fromTwos8(parseInt(bits, 2)));
      else if (p.type === 'twos-encode') eq(fromTwos8(parseInt(p.answer, 2)), -Number(p.prompt.slice(1)));
      else ok(p.type.startsWith('range-'), p.type);
      ok(p.steps.length > 0);
    }
  }
});
