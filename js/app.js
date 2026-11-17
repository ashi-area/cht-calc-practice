// 畫面與操作。題目和計分邏輯在 engine.js 和各模組檔案。
import { loadState, saveState, requestPersist } from './storage.js';
import {
  MODULES, generateProblem, recordAnswer, isCorrect, setLevel, streak, dayKey, accuracy,
  weakTags, tagName, needsBackup, makeBackup, validateBackup, normalizeState,
} from './engine.js';
import { groupBits } from './base.js';

const app = document.getElementById('app');
const importInput = document.getElementById('import-file');
const MAX_INPUT = 12;
const SAVE_EVERY_MS = 2000;

let state = loadState();
let screen = 'home';
let persisted = null;
let offlineReady = null; // null：還在確認；true：已存進手機；false：還不能離線
let ui = freshUi();
let summary = null; // 上一次練習的結算
let timer = null;
let lastTick = 0;
let lastSave = 0;

function freshUi() {
  return { input: '', fields: ['', ''], field: 0, wrong: null, flash: false };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const save = () => { saveState(state); lastSave = Date.now(); };

// ---------- 啟動 ----------

applyTheme();
render();
requestPersist().then((v) => { persisted = v; if (screen === 'home') render(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  checkOffline();
  navigator.serviceWorker.addEventListener('controllerchange', checkOffline);
} else {
  offlineReady = false;
}

/** 確認 App 已經存進手機：service worker 啟用，而且快取裡有首頁。 */
async function checkOffline() {
  try {
    await navigator.serviceWorker.ready;
    const home = new URL('./', location.href).href;
    const keys = (await caches.keys()).filter((k) => k.startsWith('cht-calc-'));
    let found = false;
    for (const k of keys) {
      if (await (await caches.open(k)).match(home)) found = true;
    }
    offlineReady = found;
  } catch {
    offlineReady = false;
  }
  if (screen === 'home') render();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { tick(); save(); } else { lastTick = performance.now(); }
});
window.addEventListener('pagehide', () => { tick(); save(); });

// ---------- 畫面切換 ----------

function render() {
  if (screen === 'practice') renderPractice();
  else if (screen === 'summary') renderSummary();
  else renderHome();
}

function go(next) {
  screen = next;
  if (next !== 'practice') stopTimer();
  render();
  window.scrollTo(0, 0);
}

function applyTheme() {
  const theme = state.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f5f7' : '#14161a';
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ---------- 首頁 ----------

function moduleCard(id, m) {
  const mod = state.modules[id];
  return `
  <div class="card">
    <div class="card-head">
      <h3>${esc(m.name)}</h3>
      <span class="acc">最近正確率 ${pct(accuracy(mod.recent))}</span>
    </div>
    <p class="level-name">Lv${mod.level}：${esc(m.levelNames[mod.level])}</p>
    <div class="chips" role="group" aria-label="${esc(m.name)}等級">
      ${Array.from({ length: m.maxLevel }, (_, i) => i + 1).map((lv) => `
        <button class="chip" data-act="level" data-module="${id}" data-level="${lv}" aria-pressed="${lv === mod.level}">Lv${lv}</button>`).join('')}
    </div>
    <button class="btn primary big" data-act="start" data-module="${id}">開始練習</button>
  </div>`;
}

function renderHome() {
  const today = dayKey();
  const todayN = state.days[today]?.n || 0;
  const s = state.session;
  const weak = weakTags(state);
  const { pace, minutes, theme } = state.settings;
  const d = new Date();
  const groups = {};
  for (const [id, m] of Object.entries(MODULES)) (groups[m.group] ||= []).push([id, m]);

  app.innerHTML = `
  <div class="home">
    <header>
      <h1>計算練習</h1>
      <p class="muted" style="margin:4px 0 0">${d.getMonth() + 1} 月 ${d.getDate()} 日</p>
      <p class="note offline ${offlineReady ? 'ready' : ''}">${offlineReady
        ? '✓ 已存進手機，沒有網路也能練'
        : offlineReady === false ? '還不能離線使用：請保持網路，重新打開一次 App' : '正在存進手機，先保持網路連線……'}</p>
    </header>

    <section class="stats" aria-label="今天的練習">
      <div class="stat"><b>${todayN}</b><span>今天練了幾題</span></div>
      <div class="stat"><b>${streak(state.days, today)}</b><span>連續練習天數</span></div>
    </section>

    ${s ? `
    <div class="banner">
      <p>上次的${esc(MODULES[s.module].name)}還沒練完，已答 ${s.n} 題</p>
      <button class="btn primary small" data-act="resume">繼續</button>
    </div>` : ''}

    ${needsBackup(state) ? `
    <div class="banner warn">
      <p>${state.lastBackupAt ? '超過 7 天沒備份了' : '還沒備份過進度'}，建議匯出一份存到「檔案」</p>
      <button class="btn small" data-act="export">備份</button>
    </div>` : ''}

    <section>
      <h2>最常錯的題型</h2>
      ${weak.length ? `
      <ul class="weak-list">
        ${weak.map((w) => `<li><span>${esc(tagName(w.tag))}</span><span class="rate">最近錯 ${pct(w.rate)}</span></li>`).join('')}
      </ul>
      <p class="note">這些題型之後會比較常出現。</p>` : '<p class="note" style="margin:0">練幾題之後，這裡會列出最常錯的題型。</p>'}
    </section>

    ${Object.entries(groups).map(([g, list]) => `
    <section class="modules" aria-label="${esc(g)}">
      <h2>${esc(g)}</h2>
      ${list.map(([id, m]) => moduleCard(id, m)).join('')}
    </section>`).join('')}
    <p class="note" style="margin-top:-8px">等級會自動調整：同一級最近 20 題答對 9 成以上就升級，最近 10 題答對不到 6 成就降一級。也可以直接點等級切換。</p>

    <section>
      <h2>設定</h2>
      <div class="setting">
        <span>節奏</span>
        <div class="chips">
          <button class="chip" data-act="pace" data-value="untimed" aria-pressed="${pace === 'untimed'}">不計時</button>
          <button class="chip" data-act="pace" data-value="sprint" aria-pressed="${pace === 'sprint'}">60 秒衝刺</button>
        </div>
      </div>
      ${pace === 'untimed' ? `
      <div class="setting">
        <span>每次練習多久</span>
        <div class="chips">
          ${[3, 5, 10].map((m) => `<button class="chip" data-act="minutes" data-value="${m}" aria-pressed="${minutes === m}">${m} 分鐘</button>`).join('')}
        </div>
        <p class="note" style="margin:0">畫面上不會倒數，時間到了才提醒你。</p>
      </div>` : ''}
      <div class="setting">
        <span>外觀</span>
        <div class="chips">
          <button class="chip" data-act="theme" data-value="dark" aria-pressed="${theme === 'dark'}">深色</button>
          <button class="chip" data-act="theme" data-value="light" aria-pressed="${theme === 'light'}">淺色</button>
        </div>
      </div>
    </section>

    <section>
      <h2>備份進度</h2>
      <div class="row">
        <button class="btn" data-act="export">匯出備份</button>
        <button class="btn" data-act="import">從備份還原</button>
      </div>
      <p class="note">進度只存在這支手機裡。換手機或清除 Safari 資料前，先匯出備份存到「檔案」。
        ${state.lastBackupAt ? `上次備份：${new Date(state.lastBackupAt).toLocaleDateString('zh-TW')}。` : ''}
        ${persisted === true ? '已請系統保留這個 App 的資料。' : ''}</p>
    </section>
  </div>`;
}

app.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, module: moduleId, value } = btn.dataset;
  switch (act) {
    case 'start': startSession(moduleId); break;
    case 'resume': resumeSession(); break;
    case 'level':
      setLevel(state, moduleId, Number(btn.dataset.level));
      save(); render(); break;
    case 'pace': state.settings.pace = value; save(); render(); break;
    case 'minutes': state.settings.minutes = Number(value); save(); render(); break;
    case 'theme': state.settings.theme = value; applyTheme(); save(); render(); break;
    case 'export': exportBackup(); break;
    case 'import': importInput.value = ''; importInput.click(); break;
    case 'key': pressKey(btn.dataset.key); break;
    case 'field': if (!ui.wrong) { ui.field = Number(btn.dataset.index); renderPractice(); } break;
    case 'choose': if (!ui.wrong && !ui.flash) { ui.input = value; submit(); } break;
    case 'next': nextAfterWrong(); break;
    case 'quit': endSession(); break;
    case 'home': go('home'); break;
    case 'again': startSession(summary.module); break;
    default: break;
  }
});

// ---------- 練習 ----------

function startSession(moduleId) {
  const pace = state.settings.pace;
  state.session = {
    module: moduleId,
    pace,
    goalMs: pace === 'sprint' ? 60_000 : state.settings.minutes * 60_000,
    elapsedMs: 0,
    n: 0,
    correct: 0,
    levelStart: state.modules[moduleId].level,
    problem: null,
  };
  newProblem();
  screen = 'practice';
  startTimer();
  render();
}

function resumeSession() {
  if (!state.session) return;
  if (!state.session.problem) newProblem();
  ui = freshUi();
  screen = 'practice';
  startTimer();
  render();
}

function newProblem() {
  const s = state.session;
  s.problem = generateProblem(state, s.module, Math.random);
  ui = freshUi();
  save();
}

function startTimer() {
  stopTimer();
  lastTick = performance.now();
  timer = setInterval(() => { tick(); updateClock(); }, 250);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** 累計練習時間。看解說的時候不計時。 */
function tick() {
  const now = performance.now();
  const s = state.session;
  if (screen === 'practice' && s && !ui.wrong && !document.hidden) {
    s.elapsedMs += now - lastTick;
    if (Date.now() - lastSave > SAVE_EVERY_MS) save();
  }
  lastTick = now;
}

function timeUp() {
  const s = state.session;
  return s && s.elapsedMs >= s.goalMs;
}

function updateClock() {
  const s = state.session;
  if (!s || screen !== 'practice') return;
  const bar = app.querySelector('.progress i');
  if (bar) bar.style.width = `${Math.min(100, (s.elapsedMs / s.goalMs) * 100)}%`;
  const clock = app.querySelector('.timer');
  if (clock) clock.textContent = Math.max(0, Math.ceil((s.goalMs - s.elapsedMs) / 1000));
  // 衝刺模式時間一到就結束；不計時模式等這一題答完再提醒
  if (s.pace === 'sprint' && timeUp() && !ui.wrong) endSession();
}

// ---- 題目的顯示方式 ----

const EQ_TYPES = new Set(['x2', 'half', 'binadd']);
const isMono = (base) => base === 2 || base === 16;

function promptHtml(p) {
  const eq = p.module === 'arith' || EQ_TYPES.has(p.type) ? ' =' : '';
  const sub = p.module === 'base' ? `<sub>(${p.promptBase})</sub>` : '';
  // 中文字的寬度大約是數字的兩倍，算兩格
  const len = [...p.prompt.replace(/\n.*/s, '')].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
  const mono = isMono(p.promptBase) || p.module === 'subnet' ? 'mono' : '';
  // 等寬字比較寬，提早縮小；二進位加法這種超過 20 字的再小一級
  const size = len > 20 ? 'xxlong' : len > (mono ? 12 : 16) ? 'xlong' : len > (mono ? 8 : 9) ? 'long' : '';
  return `<div class="q-prompt ${mono} ${size}">${esc(p.prompt)}${sub}${eq}</div>`;
}

function answerMono(p) {
  return isMono(p.answerBase) || p.answerKind === 'ip';
}

function shown(p, s) {
  return p.answerBase === 2 && !p.answerKind ? groupBits(s) : s;
}

function answerHtml(p) {
  if (p.keypad === 'choice') return '';
  if (p.keypad === 'divmod') {
    return `<div class="answer-pair">
      ${['商', '餘數'].map((name, i) => `
        <button class="answer slot ${ui.field === i ? 'active' : ''} ${ui.fields[i] === '' ? 'empty' : ''} ${ui.flash ? 'good' : ''}"
          data-act="field" data-index="${i}" aria-label="${name}">
          <small>${name}</small>${esc(ui.fields[i] === '' ? '＿' : ui.fields[i])}
        </button>`).join('')}
    </div>`;
  }
  const v = ui.input === '' ? '＿' : shown(p, ui.input);
  const size = v.length > 15 ? 'xlong' : v.length > 11 ? 'long' : '';
  return `<div class="answer ${size} ${answerMono(p) ? 'mono' : ''} ${ui.input === '' ? 'empty' : ''} ${ui.flash ? 'good' : ''}" aria-label="你的答案">${esc(v)}</div>`;
}

function correctText(p) {
  return p.answerText || (p.answerBase === 2 ? groupBits(p.answer) : p.answer);
}

function givenText(p, given) {
  if (p.keypad === 'divmod') {
    const [q, r] = given.split(',');
    return `商 ${q}，餘數 ${r}`;
  }
  if (p.keypad === 'choice') return given === 'yes' ? '「是同一個網段」' : '「不是同一個網段」';
  return shown(p, given);
}

function stepsHtml(p) {
  return `<ol class="steps">
    ${p.steps.map((st) => (typeof st === 'string'
      ? `<li>${esc(st).replace(/(\d)\.(?=\d)/g, '$1.<wbr>')}</li>`
      : `<li><table><thead><tr>${st.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${st.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></li>`)).join('')}
  </ol>`;
}

function renderPractice() {
  const s = state.session;
  if (!s) { go('home'); return; }
  const p = s.problem;
  const clock = s.pace === 'sprint'
    ? `<span class="timer" aria-label="剩餘秒數">${Math.max(0, Math.ceil((s.goalMs - s.elapsedMs) / 1000))}</span>`
    : '<span></span>';

  let middle;
  if (ui.wrong !== null) {
    middle = `
    <div class="question explain">
      <div class="result">
        <p class="muted">${esc((p.label || '算算看').replace(/[？?]$/, ''))}：${esc(p.prompt.replace(/\n/g, '、'))}</p>
        <p class="big">正確答案：<span class="${answerMono(p) ? 'mono' : ''}">${esc(correctText(p))}</span></p>
        <p class="yours">${p.keypad === 'choice' ? '你選的是' : '你寫的是'} ${esc(givenText(p, ui.wrong))}</p>
      </div>
      ${stepsHtml(p)}
    </div>`;
  } else {
    middle = `
    <div class="question">
      ${p.label ? `<div class="q-label">${esc(p.label)}</div>` : ''}
      ${promptHtml(p)}
      ${answerHtml(p)}
    </div>`;
  }

  app.innerHTML = `
  <section class="practice">
    <div class="bar">
      <button class="btn small" data-act="quit">結束</button>
      ${clock}
      <span class="count">${s.n} 題・對 ${s.correct}</span>
    </div>
    <div class="progress" aria-hidden="true"><i style="width:${Math.min(100, (s.elapsedMs / s.goalMs) * 100)}%"></i></div>
    ${middle}
    ${ui.wrong !== null ? `
    <div class="pad next"><button class="key ok" data-act="next">${timeUp() ? '看結果' : '看懂了，下一題'}</button></div>`
    : keypad(p.keypad)}
  </section>`;
}

function canSubmit(p) {
  if (p.keypad === 'divmod') return ui.fields[0] !== '' && ui.fields[1] !== '';
  if (p.keypad === 'ip') return /^\d{1,3}(\.\d{1,3}){3}$/.test(ui.input);
  if (p.keypad === 'signed') return /\d/.test(ui.input);
  return ui.input !== '';
}

function keypad(kind) {
  const p = state.session.problem;
  const k = (key, cls = '', label = key, aria = '') =>
    `<button class="key ${cls}" data-act="key" data-key="${key}" ${aria ? `aria-label="${aria}"` : ''}>${label}</button>`;
  const del = (cls = 'fn') => k('del', cls, '⌫', '刪除');
  const ok = (cls = 'ok') => {
    const nextField = kind === 'divmod' && ui.field === 0;
    const enabled = nextField ? ui.fields[0] !== '' : canSubmit(p);
    return `<button class="key ${cls}" data-act="key" data-key="ok" ${enabled ? '' : 'disabled'}>${nextField ? '下一格' : '確定'}</button>`;
  };
  if (kind === 'choice') {
    return `<div class="pad choice">
      <button class="key" data-act="choose" data-value="yes">是，同一個網段</button>
      <button class="key" data-act="choose" data-value="no">不是同一個網段</button>
    </div>`;
  }
  if (kind === 'bin') {
    return `<div class="pad bin">${k('0')}${k('1')}${del()}${ok()}</div>`;
  }
  if (kind === 'hex') {
    return `<div class="pad hex">
      ${k('1')}${k('2')}${k('3')}${k('A', 'letter')}
      ${k('4')}${k('5')}${k('6')}${k('B', 'letter')}
      ${k('7')}${k('8')}${k('9')}${k('C', 'letter')}
      ${k('0')}${k('D', 'letter')}${k('E', 'letter')}${k('F', 'letter')}
      ${del('fn wide')}${ok('ok wide')}
    </div>`;
  }
  if (kind === 'divmod' || kind === 'ip' || kind === 'signed') {
    const extra = kind === 'divmod' ? k('swap', 'fn', '⇄', '切換商和餘數')
      : kind === 'ip' ? k('.', 'fn dot', '.', '點')
        : k('neg', 'fn', '−', '負號');
    return `<div class="pad four">
      ${k('1')}${k('2')}${k('3')}${del()}
      ${k('4')}${k('5')}${k('6')}${extra}
      ${k('7')}${k('8')}${k('9')}${ok('ok tall')}
      ${k('0', 'wide3')}
    </div>`;
  }
  return `<div class="pad dec">
    ${k('1')}${k('2')}${k('3')}${k('4')}${k('5')}${k('6')}${k('7')}${k('8')}${k('9')}
    ${del()}${k('0')}${ok()}
  </div>`;
}

const DIGITS = { dec: /^[0-9]$/, bin: /^[01]$/, hex: /^[0-9A-F]$/, divmod: /^[0-9]$/, ip: /^[0-9]$/, signed: /^[0-9]$/ };

function pressKey(key) {
  const s = state.session;
  if (!s || ui.wrong !== null || ui.flash) return;
  const kind = s.problem.keypad;
  if (kind === 'choice') return;
  if (key === 'ok') {
    if (kind === 'divmod' && ui.field === 0) {
      if (ui.fields[0] !== '') { ui.field = 1; renderPractice(); }
      return;
    }
    if (canSubmit(s.problem)) submit();
    return;
  }
  if (key === 'del') {
    if (kind === 'divmod') {
      if (ui.fields[ui.field] === '' && ui.field === 1) ui.field = 0;
      else ui.fields[ui.field] = ui.fields[ui.field].slice(0, -1);
    } else ui.input = ui.input.slice(0, -1);
  } else if (key === 'swap' && kind === 'divmod') {
    ui.field = 1 - ui.field;
  } else if (key === 'neg' && kind === 'signed') {
    ui.input = ui.input.startsWith('−') ? ui.input.slice(1) : `−${ui.input}`;
  } else if (key === '.' && kind === 'ip') {
    if (ui.input === '' || ui.input.endsWith('.') || ui.input.split('.').length >= 4) return;
    ui.input += '.';
  } else if (DIGITS[kind]?.test(key)) {
    if (kind === 'divmod') {
      if (ui.fields[ui.field].length >= 4) return;
      ui.fields[ui.field] += key;
    } else if (kind === 'ip') {
      if (ui.input.split('.').pop().length >= 3) return;
      ui.input += key;
    } else {
      if (ui.input.replace('−', '').length >= MAX_INPUT) return;
      ui.input += key;
    }
  } else return;
  renderPractice();
}

function submit() {
  const s = state.session;
  const p = s.problem;
  const given = p.keypad === 'divmod' ? ui.fields.join(',') : ui.input;
  const correct = isCorrect(p, given);
  s.n++;
  if (correct) s.correct++;
  const change = recordAnswer(state, p, correct);
  save();
  if (change === 1) toast(`升到 Lv${state.modules[s.module].level}！`);
  if (change === -1) toast(`先回到 Lv${state.modules[s.module].level} 練穩一點`);

  if (correct) {
    ui.flash = true;
    renderPractice();
    setTimeout(() => {
      ui.flash = false;
      if (screen !== 'practice') return;
      if (timeUp()) { endSession(); return; }
      newProblem();
      renderPractice();
    }, 350);
  } else {
    ui.wrong = given;
    save();
    renderPractice();
  }
}

function nextAfterWrong() {
  ui.wrong = null;
  lastTick = performance.now();
  if (timeUp()) { endSession(); return; }
  newProblem();
  renderPractice();
}

function endSession() {
  const s = state.session;
  stopTimer();
  if (s) {
    summary = {
      module: s.module,
      n: s.n,
      correct: s.correct,
      finished: s.elapsedMs >= s.goalMs,
      levelFrom: s.levelStart,
      levelTo: state.modules[s.module].level,
    };
  }
  state.session = null;
  ui = freshUi();
  save();
  go(summary ? 'summary' : 'home');
}

// ---------- 結算 ----------

function renderSummary() {
  const r = summary;
  const name = MODULES[r.module].name;
  const lv = r.levelTo > r.levelFrom ? `升級了：Lv${r.levelFrom} → Lv${r.levelTo}`
    : r.levelTo < r.levelFrom ? `等級調整：Lv${r.levelFrom} → Lv${r.levelTo}` : `維持在 Lv${r.levelTo}`;
  app.innerHTML = `
  <section class="summary">
    <h1>${r.finished ? '時間到，練完了' : '這次練到這裡'}</h1>
    <p class="muted" style="margin:0">${esc(name)}</p>
    <p class="score">${r.correct} / ${r.n}</p>
    <p style="margin:0">答對 ${r.correct} 題，共 ${r.n} 題（${pct(r.n ? r.correct / r.n : null)}）</p>
    <p class="muted" style="margin:0">${lv}</p>
    <div class="spacer"></div>
    <button class="btn primary big" data-act="again">再練一次</button>
    <button class="btn big" data-act="home">回首頁</button>
  </section>`;
}

// ---------- 備份 ----------

async function exportBackup() {
  if (state.session) tick();
  const name = `計算練習備份-${dayKey()}.json`;
  const backupState = { ...state, lastBackupAt: Date.now() };
  const file = new File([JSON.stringify(makeBackup(backupState), null, 2)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // 使用者自己取消
    toast('匯出失敗，請再試一次');
    return;
  }
  state.lastBackupAt = backupState.lastBackupAt;
  save();
  toast('已匯出備份');
  if (screen === 'home') render();
}

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    toast('讀不懂這個檔案');
    return;
  }
  const err = validateBackup(obj);
  if (err) { toast(err); return; }
  const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString('zh-TW') : '不明時間';
  if (!confirm(`要用 ${when} 的備份取代目前的進度嗎？目前的進度會被覆蓋。`)) return;
  state = normalizeState(obj.state);
  save();
  applyTheme();
  toast('已從備份還原');
  go('home');
});

// ---------- 電腦鍵盤（方便在電腦上測試） ----------

document.addEventListener('keydown', (e) => {
  if (screen !== 'practice' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (ui.wrong !== null) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextAfterWrong(); }
    return;
  }
  if (e.key === 'Enter') pressKey('ok');
  else if (e.key === 'Backspace') pressKey('del');
  else if (e.key === '.') pressKey('.');
  else if (e.key === '-') pressKey('neg');
  else if (e.key === 'Tab') { e.preventDefault(); pressKey('swap'); }
  else if (/^[0-9a-fA-F]$/.test(e.key)) pressKey(e.key.toUpperCase());
});
