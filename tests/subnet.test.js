import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import {
  prefixToMask, maskToPrefix, parseIp, ipToInt, intToIp, networkAddress, broadcastAddress, usableHosts,
  sameNetwork, explainCidrToMask, explainMaskToCidr, explainHosts, explainNetwork, explainBroadcast,
  makeSame, generateSubnet, SUBNET_MAX_LEVEL,
} from '../js/subnet.js';

test('CIDR 換遮罩：/0、/8、/24、/26、/31、/32', () => {
  eq(prefixToMask(0), '0.0.0.0');
  eq(prefixToMask(8), '255.0.0.0');
  eq(prefixToMask(24), '255.255.255.0');
  eq(prefixToMask(26), '255.255.255.192');
  eq(prefixToMask(20), '255.255.240.0');
  eq(prefixToMask(31), '255.255.255.254');
  eq(prefixToMask(32), '255.255.255.255');
});

test('遮罩換 CIDR：0～32 全部互相還原；不連續的遮罩不合法', () => {
  for (let p = 0; p <= 32; p++) eq(maskToPrefix(prefixToMask(p)), p);
  ok(Number.isNaN(maskToPrefix('255.0.255.0')));
  ok(Number.isNaN(maskToPrefix('255.255.255.1')));
  ok(Number.isNaN(maskToPrefix('255.255.256.0')));
  ok(Number.isNaN(maskToPrefix('255.255.0')));
});

test('IP 解析：前導 0、超過 255、少一段', () => {
  eq(parseIp('192.168.001.010'), [192, 168, 1, 10]);
  eq(parseIp('192.168.1.256'), null);
  eq(parseIp('192.168.1'), null);
  eq(parseIp('1..2.3'), null);
  eq(intToIp(ipToInt('255.255.255.255')), '255.255.255.255');
  eq(intToIp(ipToInt('0.0.0.0')), '0.0.0.0');
  eq(ipToInt('255.255.255.255'), 4294967295);
});

test('可用主機數：/24、/30、/16，以及 /31 和 /32 的特例', () => {
  eq(usableHosts(24), 254);
  eq(usableHosts(30), 2);
  eq(usableHosts(26), 62);
  eq(usableHosts(16), 65534);
  eq(usableHosts(31), 2);
  eq(usableHosts(32), 1);
  eq(explainHosts(26), ['主機位元 = 32 − 26 = 6', '位址總數 = 2⁶ = 64', '扣掉網路位址和廣播位址這 2 個：64 − 2 = 62']);
  ok(explainHosts(31)[1].includes('RFC 3021'));
});

test('網路位址和廣播位址：/26、/20、/24、/8、/31、/32', () => {
  eq(networkAddress('192.168.10.77', 26), '192.168.10.64');
  eq(broadcastAddress('192.168.10.77', 26), '192.168.10.127');
  eq(networkAddress('172.16.200.5', 20), '172.16.192.0');
  eq(broadcastAddress('172.16.200.5', 20), '172.16.207.255');
  eq(networkAddress('192.168.1.200', 24), '192.168.1.0');
  eq(broadcastAddress('192.168.1.200', 24), '192.168.1.255');
  eq(networkAddress('10.20.30.40', 8), '10.0.0.0');
  eq(broadcastAddress('10.20.30.40', 8), '10.255.255.255');
  eq(networkAddress('192.168.1.7', 31), '192.168.1.6');
  eq(broadcastAddress('192.168.1.7', 31), '192.168.1.7');
  eq(networkAddress('192.168.1.7', 32), '192.168.1.7');
  eq(broadcastAddress('192.168.1.7', 32), '192.168.1.7');
  eq(broadcastAddress('255.255.255.254', 24), '255.255.255.255', '最大的位址不會溢位');
});

test('網路位址：和用位元 AND 算的結果一致（隨機 5000 組）', () => {
  const rng = mulberry32(41);
  for (let i = 0; i < 5000; i++) {
    const n = Math.floor(rng() * 2 ** 32);
    const p = Math.floor(rng() * 33);
    const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    eq(ipToInt(networkAddress(intToIp(n), p)), (n & mask) >>> 0, `${intToIp(n)}/${p}`);
    eq(ipToInt(broadcastAddress(intToIp(n), p)), ((n & mask) | (~mask >>> 0)) >>> 0, `${intToIp(n)}/${p}`);
  }
});

test('說明：遮罩的換算步驟', () => {
  eq(explainCidrToMask(26), [
    '/26 代表 32 個位元裡，前面 26 個是 1，後面 6 個是 0',
    '11111111.11111111.11111111.11000000',
    '11000000 = 128 + 64 = 192',
    '每 8 位換成十進位（8 個 1 是 255）：255.255.255.192',
  ]);
  eq(explainCidrToMask(24).length, 3, '/24 沒有不完整的那一段');
  const s = explainMaskToCidr('255.255.240.0');
  eq(s[s.length - 1], '8 + 8 + 4 + 0 = 20，所以是 /20');
});

test('說明：網路位址和廣播位址的區塊算法', () => {
  eq(explainNetwork('192.168.10.77', 26), [
    '/26 的遮罩是 255.255.255.192',
    '前 3 段遮罩是 255，原樣保留：192.168.10',
    '第 4 段遮罩是 192，每一塊的大小 = 256 − 192 = 64',
    '77 落在 64～127 這一塊（64 的倍數裡，不超過 77 的最大一個是 64）',
    '第 4 段取這一塊的開頭 64：192.168.10.64',
  ]);
  const b = explainBroadcast('172.16.200.5', 20);
  eq(b[b.length - 1], '第 3 段取這一塊的最後一個 207，後面的段都變成 255：172.16.207.255');
  const c = explainNetwork('10.1.2.3', 16);
  eq(c[c.length - 1], '主機部分全部變成 0：10.1.0.0');
});

test('是否同網段', () => {
  ok(sameNetwork('192.168.1.10', '192.168.1.120', 25));
  ok(!sameNetwork('192.168.1.10', '192.168.1.130', 25));
  const p = makeSame('192.168.1.10', '192.168.1.130', 25);
  eq(p.answer, 'no');
  eq(p.keypad, 'choice');
  eq(p.steps[p.steps.length - 1], '不一樣，所以不是同一個網段');
});

test('子網路模組：每一級隨機出題，答案和另外算的一致', () => {
  const rng = mulberry32(42);
  let same = 0, diff = 0;
  for (let lv = 1; lv <= SUBNET_MAX_LEVEL; lv++) {
    for (let i = 0; i < 2000; i++) {
      const p = generateSubnet(lv, rng);
      if (p.type === 'cidr2mask') eq(maskToPrefix(p.answer), Number(p.prompt.slice(1)));
      else if (p.type === 'mask2cidr') eq(prefixToMask(Number(p.answer)), p.prompt);
      else if (p.type === 'hosts') eq(Number(p.answer), 2 ** (32 - Number(p.prompt.slice(1))) - 2);
      else if (p.type === 'netaddr' || p.type === 'bcast') {
        const [ip, pre] = p.prompt.split('/');
        const fn = p.type === 'netaddr' ? networkAddress : broadcastAddress;
        eq(p.answer, fn(ip, Number(pre)));
        ok(parseIp(ip), `IP 格式不對 ${ip}`);
      } else {
        const [a, b] = p.prompt.split('\n');
        const pre = Number(p.label.match(/\/(\d+)/)[1]);
        eq(p.answer, sameNetwork(a, b, pre) ? 'yes' : 'no');
        if (p.answer === 'yes') same++; else diff++;
      }
      const last = p.steps[p.steps.length - 1];
      if (p.answerKind === 'ip') ok(last.endsWith(p.answer), `說明最後一行要是答案：${last}`);
    }
  }
  ok(same > 100 && diff > 100, `同網段 ${same} 題、不同 ${diff} 題，比例要接近一半`);
});
