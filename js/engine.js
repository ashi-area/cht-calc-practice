// 進度、等級升降、弱點加權出題。這裡都是純函式，不碰畫面和儲存。
import { generateArith, ARITH_MAX_LEVEL, ARITH_LEVEL_NAMES } from './arith.js';
import { generateBase, fromBase, BASE_MAX_LEVEL, BASE_LEVEL_NAMES } from './base.js';

export const STATE_VERSION = 1;

export const MODULES = {
  arith: { name: '四則運算', maxLevel: ARITH_MAX_LEVEL, levelNames: ARITH_LEVEL_NAMES, generate: generateArith },
  base: { name: '進位轉換', maxLevel: BASE_MAX_LEVEL, levelNames: BASE_LEVEL_NAMES, generate: generateBase },
};

/** 升降級門檻，之後想調整只要改這裡。 */
export const LEVEL_RULES = { upWindow: 20, upAccuracy: 0.9, downWindow: 10, downAccuracy: 0.6 };
const RECENT_KEEP = 10; // 每個題型記住最近幾題
const MODULE_RECENT_KEEP = 30; // 首頁正確率看最近幾題
const CANDIDATES = 6; // 弱點加權時，一次產生幾題候選

export function defaultState() {
  return {
    version: STATE_VERSION,
    settings: { pace: 'untimed', minutes: 5, theme: 'dark' },
    modules: {
      arith: { level: 1, history: [], recent: [] },
      base: { level: 1, history: [], recent: [] },
    },
    tags: {},
    days: {},
    lastBackupAt: null,
    session: null,
  };
}

/** 讀進來的資料補上缺的欄位，避免舊版資料讓程式出錯。 */
export function normalizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.settings = { ...d.settings, ...(raw.settings || {}) };
  s.modules = { ...d.modules };
  for (const id of Object.keys(d.modules)) {
    const m = (raw.modules || {})[id] || {};
    const max = MODULES[id].maxLevel;
    const level = Number.isInteger(m.level) ? Math.min(Math.max(m.level, 1), max) : 1;
    s.modules[id] = {
      level,
      history: Array.isArray(m.history) ? m.history.slice(-LEVEL_RULES.upWindow) : [],
      recent: Array.isArray(m.recent) ? m.recent.slice(-MODULE_RECENT_KEEP) : [],
    };
  }
  s.tags = raw.tags && typeof raw.tags === 'object' ? raw.tags : {};
  s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
  s.version = STATE_VERSION;
  return s;
}

/** 匯入備份前檢查格式。回傳錯誤訊息，沒問題就回傳 null。 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return '檔案內容不是備份格式';
  if (obj.app !== 'cht-calc-practice') return '這不是計算練習 App 的備份檔';
  if (!obj.state || typeof obj.state !== 'object') return '備份檔裡沒有進度資料';
  if (!obj.state.modules || !obj.state.days) return '備份檔的進度資料不完整';
  return null;
}

export function makeBackup(state, now = new Date()) {
  return { app: 'cht-calc-practice', exportedAt: now.toISOString(), state };
}

// ---------- 日期 ----------

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** 連續練習天數。今天還沒練，就從昨天往回算，不會因為早上還沒練就歸零。 */
export function streak(days, today = dayKey()) {
  let key = days[today]?.n > 0 ? today : prevDay(today);
  let count = 0;
  while (days[key]?.n > 0) {
    count++;
    key = prevDay(key);
  }
  return count;
}

// ---------- 答題 ----------

export function isCorrect(problem, input) {
  const v = fromBase(input, problem.answerBase);
  return !Number.isNaN(v) && v === fromBase(problem.answer, problem.answerBase);
}

export function accuracy(list) {
  if (!list.length) return null;
  return list.filter(Boolean).length / list.length;
}

/** 依最近的答題紀錄決定等級。回傳新等級。 */
export function nextLevel(history, level, maxLevel, rules = LEVEL_RULES) {
  if (history.length >= rules.upWindow && level < maxLevel &&
      accuracy(history.slice(-rules.upWindow)) >= rules.upAccuracy) {
    return level + 1;
  }
  if (history.length >= rules.downWindow && level > 1 &&
      accuracy(history.slice(-rules.downWindow)) < rules.downAccuracy) {
    return level - 1;
  }
  return level;
}

/** 記錄一題的結果（會直接修改 state）。回傳等級變化：1 升級、-1 降級、0 不變。 */
export function recordAnswer(state, problem, correct, now = new Date()) {
  const key = dayKey(now);
  const day = state.days[key] || { n: 0, correct: 0 };
  day.n++;
  if (correct) day.correct++;
  state.days[key] = day;

  for (const tag of problem.tags) {
    const t = state.tags[tag] || { n: 0, wrong: 0, recent: [] };
    t.n++;
    if (!correct) t.wrong++;
    t.recent = [...t.recent, correct].slice(-RECENT_KEEP);
    state.tags[tag] = t;
  }

  const mod = state.modules[problem.module];
  mod.recent = [...mod.recent, correct].slice(-MODULE_RECENT_KEEP);
  // 只有目前等級的題目才算進升降級紀錄
  if (problem.level !== mod.level) return 0;
  mod.history = [...mod.history, correct].slice(-LEVEL_RULES.upWindow);
  const newLevel = nextLevel(mod.history, mod.level, MODULES[problem.module].maxLevel);
  if (newLevel === mod.level) return 0;
  const change = newLevel > mod.level ? 1 : -1;
  setLevel(state, problem.module, newLevel);
  return change;
}

export function setLevel(state, moduleId, level) {
  const max = MODULES[moduleId].maxLevel;
  state.modules[moduleId].level = Math.min(Math.max(level, 1), max);
  state.modules[moduleId].history = [];
}

// ---------- 弱點 ----------

/** 這個題型最近的錯誤率（0～1）。題數太少就當作 0。 */
export function weakness(tagStats) {
  if (!tagStats || tagStats.recent.length < 2) return 0;
  return 1 - accuracy(tagStats.recent);
}

/** 依錯誤率加權挑題：錯越多的題型越容易出現，但不會只出那一種。 */
export function generateProblem(state, moduleId, rng, level = state.modules[moduleId].level) {
  const gen = MODULES[moduleId].generate;
  const candidates = Array.from({ length: CANDIDATES }, () => gen(level, rng));
  const weights = candidates.map((p) => 1 + 4 * Math.max(...p.tags.map((t) => weakness(state.tags[t]))));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** 首頁「最常錯的題型」：至少做過 3 題、有錯過的，依最近錯誤率排序。 */
export function weakTags(state, k = 3) {
  return Object.entries(state.tags)
    .filter(([, t]) => t.n >= 3 && t.wrong > 0)
    .map(([tag, t]) => ({ tag, rate: weakness(t), n: t.n, wrong: t.wrong }))
    .filter((x) => x.rate > 0)
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong)
    .slice(0, k);
}

const TAG_NAMES = {
  add1: '一位數加法',
  'add1-cross10': '一位數加法（湊十）',
  sub1: '一位數減法',
  add2: '兩位數加法',
  'add2-carry': '兩位數加法（進位）',
  sub2: '兩位數減法',
  'sub2-borrow': '兩位數減法（借位）',
  'mul-table': '九九乘法',
  mul2x1: '兩位數 × 一位數',
  b2d: '二進位 → 十進位',
  d2b: '十進位 → 二進位',
  h2d: '十六進位 → 十進位',
  d2h: '十進位 → 十六進位',
  b2h: '二進位 → 十六進位',
  h2b: '十六進位 → 二進位',
};

export function tagName(tag) {
  if (TAG_NAMES[tag]) return TAG_NAMES[tag];
  let m;
  if ((m = tag.match(/^mul:(\d+)x(\d+)$/))) return `${m[1]} × ${m[2]}`;
  if ((m = tag.match(/^add:(\d+)\+(\d+)$/))) return `${m[1]} + ${m[2]}`;
  if ((m = tag.match(/^sub:(\d+)-(\d+)$/))) return `${m[1]} − ${m[2]}`;
  return tag;
}

// ---------- 備份提醒 ----------

const DAY_MS = 24 * 60 * 60 * 1000;

/** 練超過 30 題，而且 7 天沒備份（或從沒備份過），就提醒。 */
export function needsBackup(state, now = Date.now()) {
  const total = Object.values(state.days).reduce((a, d) => a + d.n, 0);
  if (total < 30) return false;
  if (!state.lastBackupAt) return true;
  return now - state.lastBackupAt > 7 * DAY_MS;
}
