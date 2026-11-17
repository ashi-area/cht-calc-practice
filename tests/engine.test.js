import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../js/rng.js';
import { makeMulTable, makeAdd1 } from '../js/arith.js';
import { makeBase } from '../js/base.js';
import {
  defaultState, normalizeState, validateBackup, makeBackup, dayKey, streak, isCorrect,
  nextLevel, recordAnswer, setLevel, weakness, generateProblem, weakTags, tagName, needsBackup,
} from '../js/engine.js';

const T = (n) => Array(n).fill(true);
const F = (n) => Array(n).fill(false);

test('判斷答案：十進位、二進位前導 0、十六進位小寫', () => {
  eq(isCorrect(makeAdd1(7, 8), '15'), true);
  eq(isCorrect(makeAdd1(7, 8), '015'), true);
  eq(isCorrect(makeAdd1(7, 8), '16'), false);
  eq(isCorrect(makeAdd1(7, 8), ''), false);
  eq(isCorrect(makeBase('d2b', 1, 5), '0101'), true);
  eq(isCorrect(makeBase('d2b', 1, 5), '102'), false);
  eq(isCorrect(makeBase('d2h', 2, 175), 'af'), true);
});

test('升級：最近 20 題答對 18 題（90%）就升級', () => {
  eq(nextLevel([...F(2), ...T(18)], 1, 3), 2);
  eq(nextLevel([...F(3), ...T(17)], 1, 3), 1, '85% 不升級');
  eq(nextLevel(T(19), 1, 3), 1, '不滿 20 題不升級');
  eq(nextLevel(T(20), 3, 3), 3, '最高級不再升');
});

test('降級：最近 10 題低於 60% 就降級', () => {
  eq(nextLevel([...T(5), ...F(5)], 2, 3), 1);
  eq(nextLevel([...T(6), ...F(4)], 2, 3), 2, '剛好 60% 不降級');
  eq(nextLevel(F(9), 2, 3), 2, '不滿 10 題不降級');
  eq(nextLevel(F(10), 1, 3), 1, '第 1 級不再降');
});

test('recordAnswer：升級後清空紀錄，舊等級的題目不算進新等級', () => {
  const s = defaultState();
  const p = makeAdd1(1, 2);
  let change = 0;
  for (let i = 0; i < 20; i++) change = recordAnswer(s, p, true, new Date(2026, 10, 17));
  eq(change, 1);
  eq(s.modules.arith.level, 2);
  eq(s.modules.arith.history, []);
  eq(recordAnswer(s, p, false, new Date(2026, 10, 18)), 0, 'Lv1 的題目不影響 Lv2 的升降');
  eq(s.modules.arith.history, []);
  eq(s.days['2026-11-17'], { n: 20, correct: 20 });
  eq(s.modules.arith.recent.length, 21);
});

test('recordAnswer：記錄題型的錯誤', () => {
  const s = defaultState();
  const p = makeMulTable(7, 8);
  recordAnswer(s, p, false);
  recordAnswer(s, p, true);
  eq(s.tags['mul:7x8'], { n: 2, wrong: 1, recent: [false, true] });
  eq(s.tags['mul-table'].n, 2);
});

test('手動選等級：限制在 1 到最高級之間', () => {
  const s = defaultState();
  setLevel(s, 'arith', 99);
  eq(s.modules.arith.level, 3);
  setLevel(s, 'base', 0);
  eq(s.modules.base.level, 1);
});

test('連續天數：今天還沒練從昨天算；中斷就重新算；跨月', () => {
  const days = { '2026-10-30': { n: 1 }, '2026-10-31': { n: 3 }, '2026-11-01': { n: 2 } };
  eq(streak(days, '2026-11-01'), 3);
  eq(streak(days, '2026-11-02'), 3, '今天還沒練，不歸零');
  eq(streak(days, '2026-11-03'), 0, '昨天沒練就歸零');
  eq(streak({}, '2026-11-01'), 0);
  eq(streak({ '2026-12-31': { n: 1 }, '2027-01-01': { n: 1 } }, '2027-01-01'), 2, '跨年');
});

test('dayKey：用本地時間，補 0', () => {
  eq(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('弱點：錯越多權重越高；題數太少不算', () => {
  eq(weakness(undefined), 0);
  eq(weakness({ recent: [false] }), 0);
  eq(weakness({ recent: [false, false] }), 1);
  eq(weakness({ recent: [true, false, true, false] }), 0.5);
});

test('弱點加權：常錯的 7×8 出現次數明顯變多', () => {
  const count = (state) => {
    const rng = mulberry32(7);
    let hit = 0;
    for (let i = 0; i < 4000; i++) {
      if (generateProblem(state, 'arith', rng, 3).tags.includes('mul:7x8')) hit++;
    }
    return hit;
  };
  const plain = defaultState();
  const weak = defaultState();
  weak.tags['mul:7x8'] = { n: 10, wrong: 10, recent: F(10) };
  const a = count(plain), b = count(weak);
  ok(b > a * 2, `加權前 ${a} 次，加權後 ${b} 次，增加不夠多`);
});

test('最常錯的題型：至少 3 題、依錯誤率排序', () => {
  const s = defaultState();
  s.tags = {
    'mul:7x8': { n: 5, wrong: 3, recent: [false, false, true, false, true] },
    'sub2-borrow': { n: 10, wrong: 2, recent: [true, true, false, true] },
    d2b: { n: 2, wrong: 2, recent: [false, false] },
    add2: { n: 8, wrong: 0, recent: T(8) },
  };
  eq(weakTags(s).map((x) => x.tag), ['mul:7x8', 'sub2-borrow']);
});

test('題型中文名稱', () => {
  eq(tagName('mul:7x8'), '7 × 8');
  eq(tagName('sub:9-4'), '9 − 4');
  eq(tagName('sub2-borrow'), '兩位數減法（借位）');
  eq(tagName('d2b'), '十進位 → 二進位');
});

test('備份：匯出後再匯入，進度完全一樣', () => {
  const s = defaultState();
  for (let i = 0; i < 25; i++) recordAnswer(s, makeMulTable(7, 8), i % 3 !== 0, new Date(2026, 10, 17));
  s.lastBackupAt = 123;
  const file = JSON.stringify(makeBackup(s, new Date(2026, 10, 17)));
  const parsed = JSON.parse(file);
  eq(validateBackup(parsed), null);
  eq(normalizeState(parsed.state), normalizeState(s));
});

test('備份：拒絕格式不對的檔案', () => {
  ok(validateBackup(null));
  ok(validateBackup({ app: 'other', state: {} }));
  ok(validateBackup({ app: 'cht-calc-practice' }));
  ok(validateBackup({ app: 'cht-calc-practice', state: { modules: {} } }));
});

test('normalizeState：壞掉或舊的資料不會讓程式出錯', () => {
  eq(normalizeState(null), defaultState());
  eq(normalizeState('亂碼'), defaultState());
  const s = normalizeState({ modules: { arith: { level: 99 } }, settings: { pace: 'sprint' } });
  eq(s.modules.arith.level, 3);
  eq(s.modules.base.level, 1);
  eq(s.settings, { pace: 'sprint', minutes: 5, theme: 'dark' });
});

test('備份提醒：練超過 30 題、7 天沒備份才提醒', () => {
  const s = defaultState();
  s.days = { '2026-11-17': { n: 29, correct: 29 } };
  eq(needsBackup(s, 0), false);
  s.days['2026-11-17'].n = 30;
  eq(needsBackup(s, 0), true);
  const now = Date.UTC(2026, 10, 17);
  s.lastBackupAt = now - 6 * 86400000;
  eq(needsBackup(s, now), false);
  s.lastBackupAt = now - 8 * 86400000;
  eq(needsBackup(s, now), true);
});
