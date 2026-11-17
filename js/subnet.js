// 計概計算：IPv4 子網路。CIDR 和遮罩互換、可用主機數、網路位址、廣播位址、是否同網段。
import { randInt, pick } from './rng.js';
import { sup as toSup } from './bits.js';

export const SUBNET_MAX_LEVEL = 3;

// ---------- 基本換算 ----------

export function prefixToMask(p) {
  const oct = [];
  for (let i = 0; i < 4; i++) {
    const bits = Math.min(Math.max(p - 8 * i, 0), 8);
    oct.push(bits === 0 ? 0 : 256 - 2 ** (8 - bits));
  }
  return oct.join('.');
}

export function parseIp(s) {
  const parts = String(s).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums;
}

export const ipToInt = (ip) => parseIp(ip).reduce((a, o) => a * 256 + o, 0);
export const intToIp = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');

/** 遮罩換成前綴長度；不是連續的 1 就回傳 NaN。 */
export function maskToPrefix(mask) {
  const oct = parseIp(mask);
  if (!oct) return NaN;
  const bits = oct.map((o) => o.toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(bits)) return NaN;
  return bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
}

export function networkAddress(ip, p) {
  const n = ipToInt(ip);
  const size = 2 ** (32 - p);
  return intToIp(n - (n % size));
}

export function broadcastAddress(ip, p) {
  const n = ipToInt(ip);
  const size = 2 ** (32 - p);
  return intToIp(n - (n % size) + size - 1);
}

/** 可以分給電腦用的位址數。/31（RFC 3021 點對點）是 2，/32 是單一主機 1。 */
export function usableHosts(p) {
  if (p === 32) return 1;
  if (p === 31) return 2;
  return 2 ** (32 - p) - 2;
}

export const sameNetwork = (a, b, p) => networkAddress(a, p) === networkAddress(b, p);

// ---------- 說明 ----------

const octBits = (o) => o.toString(2).padStart(8, '0');

export function explainCidrToMask(p) {
  const mask = prefixToMask(p);
  const oct = parseIp(mask);
  const steps = [
    `/${p} 代表 32 個位元裡，前面 ${p} 個是 1，後面 ${32 - p} 個是 0`,
    oct.map(octBits).join('.'),
  ];
  const partial = oct.find((o) => o !== 0 && o !== 255);
  if (partial !== undefined) {
    const vals = octBits(partial).split('').map((b, i) => (b === '1' ? 2 ** (7 - i) : 0)).filter(Boolean);
    steps.push(`${octBits(partial)} = ${vals.join(' + ')} = ${partial}`);
  }
  steps.push(`每 8 位換成十進位（8 個 1 是 255）：${mask}`);
  return steps;
}

export function explainMaskToCidr(mask) {
  const oct = parseIp(mask);
  const counts = oct.map((o) => octBits(o).split('').filter((b) => b === '1').length);
  return [
    '把每一段換成二進位，數有幾個 1：',
    ...oct.map((o, i) => `${o} = ${octBits(o)}（${counts[i]} 個 1）`),
    `${counts.join(' + ')} = ${maskToPrefix(mask)}，所以是 /${maskToPrefix(mask)}`,
  ];
}

export function explainHosts(p) {
  const h = 32 - p;
  if (p === 32) return ['/32 只有 1 個位址，代表單一台主機，答案是 1'];
  if (p === 31) {
    return ['/31 只有 2 個位址', '一般要扣掉網路位址和廣播位址，但 RFC 3021 規定 /31 用在點對點連線時兩個都能用，答案是 2'];
  }
  return [
    `主機位元 = 32 − ${p} = ${h}`,
    `位址總數 = 2${toSup(h)} = ${2 ** h}`,
    `扣掉網路位址和廣播位址這 2 個：${2 ** h} − 2 = ${2 ** h - 2}`,
  ];
}

/** 找出遮罩不是 255 也不是 0 的那一段，算區塊大小。 */
function blockInfo(ip, p) {
  const oct = parseIp(ip);
  const mask = parseIp(prefixToMask(p));
  const k = mask.findIndex((m) => m !== 255);
  if (k === -1 || mask[k] === 0) return { oct, mask, k, block: null };
  const block = 256 - mask[k];
  const start = oct[k] - (oct[k] % block);
  return { oct, mask, k, block, start };
}

function blockLines(ip, p) {
  const { oct, mask, k, block, start } = blockInfo(ip, p);
  const lines = [`/${p} 的遮罩是 ${mask.join('.')}`];
  if (block === null) {
    lines.push(k === -1 ? '遮罩每一段都是 255，位址本身就是一個網段' : '遮罩是 255 的段原樣保留，遮罩是 0 的段是主機的部分');
    return { lines, k, block };
  }
  if (k > 0) lines.push(`前 ${k} 段遮罩是 255，原樣保留：${oct.slice(0, k).join('.')}`);
  lines.push(`第 ${k + 1} 段遮罩是 ${mask[k]}，每一塊的大小 = 256 − ${mask[k]} = ${block}`);
  lines.push(`${oct[k]} 落在 ${start}～${start + block - 1} 這一塊（${block} 的倍數裡，不超過 ${oct[k]} 的最大一個是 ${start}）`);
  return { lines, k, block, start };
}

export function explainNetwork(ip, p) {
  const { lines, k, block, start } = blockLines(ip, p);
  const ans = networkAddress(ip, p);
  if (block === null) lines.push(k === -1 ? `網路位址：${ans}` : `主機部分全部變成 0：${ans}`);
  else lines.push(`第 ${k + 1} 段取這一塊的開頭 ${start}${k < 3 ? '，後面的段都變成 0' : ''}：${ans}`);
  return lines;
}

export function explainBroadcast(ip, p) {
  const { lines, k, block, start } = blockLines(ip, p);
  const ans = broadcastAddress(ip, p);
  if (block === null) lines.push(k === -1 ? `廣播位址：${ans}` : `主機部分全部變成 255：${ans}`);
  else lines.push(`第 ${k + 1} 段取這一塊的最後一個 ${start + block - 1}${k < 3 ? '，後面的段都變成 255' : ''}：${ans}`);
  return lines;
}

export function explainSame(a, b, p) {
  const na = networkAddress(a, p), nb = networkAddress(b, p);
  const lines = ['兩個位址各自算出網路位址，一樣就是同一個網段'];
  const ia = blockInfo(a, p), ib = blockInfo(b, p);
  if (ia.block !== null) {
    const k = ia.k;
    lines.push(`第 ${k + 1} 段每 ${ia.block} 個一塊：${ia.oct[k]} 在 ${ia.start}～${ia.start + ia.block - 1}，${ib.oct[k]} 在 ${ib.start}～${ib.start + ib.block - 1}`);
  }
  lines.push(`${a} 的網路位址：${na}`);
  lines.push(`${b} 的網路位址：${nb}`);
  lines.push(na === nb ? '一樣，所以是同一個網段' : '不一樣，所以不是同一個網段');
  return lines;
}

// ---------- 出題 ----------

function subnetProblem(type, level, label, prompt, answer, tags, steps, extra = {}) {
  return {
    module: 'subnet', level, type, label, prompt,
    answer: String(answer), answerBase: 10, keypad: 'dec', tags, steps, ...extra,
  };
}

export function makeCidrToMask(p, level = 1) {
  return subnetProblem('cidr2mask', level, 'CIDR → 子網路遮罩', `/${p}`, prefixToMask(p),
    ['cidr2mask'], explainCidrToMask(p), { answerKind: 'ip', keypad: 'ip' });
}

export function makeMaskToCidr(p, level = 1) {
  const mask = prefixToMask(p);
  return subnetProblem('mask2cidr', level, '子網路遮罩 → CIDR（填 / 後面的數字）', mask, p,
    ['mask2cidr'], explainMaskToCidr(mask));
}

export function makeHosts(p, level = 2) {
  return subnetProblem('hosts', level, '可用主機數（可以分給電腦的位址）', `/${p}`, usableHosts(p),
    ['hosts'], explainHosts(p));
}

export function makeNetwork(ip, p, level = 3) {
  return subnetProblem('netaddr', level, '網路位址是？', `${ip}/${p}`, networkAddress(ip, p),
    ['netaddr'], explainNetwork(ip, p), { answerKind: 'ip', keypad: 'ip' });
}

export function makeBroadcast(ip, p, level = 3) {
  return subnetProblem('bcast', level, '廣播位址是？', `${ip}/${p}`, broadcastAddress(ip, p),
    ['bcast'], explainBroadcast(ip, p), { answerKind: 'ip', keypad: 'ip' });
}

export function makeSame(a, b, p, level = 3) {
  const same = sameNetwork(a, b, p);
  return subnetProblem('samenet', level, `遮罩 /${p}，這兩個位址在同一個網段嗎？`, `${a}\n${b}`,
    same ? 'yes' : 'no', ['samenet'], explainSame(a, b, p),
    { answerKind: 'choice', keypad: 'choice', answerText: same ? '是，同一個網段' : '不是同一個網段' });
}

export function randomPrivateIp(rng) {
  const r = rng();
  if (r < 0.5) return `192.168.${randInt(rng, 0, 255)}.${randInt(rng, 1, 254)}`;
  if (r < 0.75) return `172.${randInt(rng, 16, 31)}.${randInt(rng, 0, 255)}.${randInt(rng, 1, 254)}`;
  return `10.${randInt(rng, 0, 255)}.${randInt(rng, 0, 255)}.${randInt(rng, 1, 254)}`;
}

/** 同網段題：一半出同一塊裡的另一個位址，一半出隔壁那一塊。 */
function partnerIp(ip, p, same, rng) {
  const size = 2 ** (32 - p);
  const net = ipToInt(networkAddress(ip, p));
  let n;
  if (same) n = net + randInt(rng, 1, size - 2);
  else {
    const neighbor = rng() < 0.5 && net >= size ? net - size : net + size;
    n = neighbor + randInt(rng, 1, size - 2);
  }
  return intToIp(n);
}

export function generateSubnet(level, rng) {
  if (level === 1) {
    const p = randInt(rng, 8, 32);
    return rng() < 0.5 ? makeCidrToMask(p, 1) : makeMaskToCidr(p, 1);
  }
  if (level === 2) {
    const r = rng();
    if (r < 0.5) return makeHosts(randInt(rng, 16, 30), 2);
    const p = randInt(rng, 16, 30);
    return r < 0.75 ? makeCidrToMask(p, 2) : makeMaskToCidr(p, 2);
  }
  if (level === 3) {
    const p = rng() < 0.75 ? randInt(rng, 24, 30) : randInt(rng, 16, 23);
    const ip = randomPrivateIp(rng);
    const kind = pick(rng, ['net', 'bcast', 'same']);
    if (kind === 'net') return makeNetwork(ip, p, 3);
    if (kind === 'bcast') return makeBroadcast(ip, p, 3);
    const same = rng() < 0.5;
    const other = partnerIp(ip, p, same, rng);
    return makeSame(ip, other, p, 3);
  }
  throw new Error(`子網路沒有第 ${level} 級`);
}

export const SUBNET_LEVEL_NAMES = {
  1: 'CIDR 和遮罩互換',
  2: '可用主機數',
  3: '網路位址、廣播位址、同網段',
};
