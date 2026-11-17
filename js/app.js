// 畫面與操作。題目和計分邏輯在 engine.js、arith.js、base.js。
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
let ui = { input: '', wrong: null, flash: false, summary: null };
let timer = null;
let lastTick = 0;
let lastSave = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const save = () => { saveState(state); lastSave = Date.now(); };

// ---------- 啟動 ----------

applyTheme();
render();
requestPersist().then((v) => { persisted = v; if (screen === 'home') render(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
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

function renderHome() {
  const today = dayKey();
  const todayN = state.days[today]?.n || 0;
  const s = state.session;
  const weak = weakTags(state);
  const { pace, minutes, theme } = state.settings;
  const d = new Date();

  app.innerHTML = `
  <div class="home">
    <header>
      <h1>計算練習</h1>
      <p class="muted" style="margin:4px 0 0">${d.getMonth() + 1} 月 ${d.getDate()} 日</p>
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

    <section aria-label="練習模組">
      ${Object.entries(MODULES).map(([id, m]) => {
        const mod = state.modules[id];
        return `
        <div class="card" style="margin-bottom:12px">
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
      }).join('')}
      <p class="note">等級會自動調整：同一級最近 20 題答對 9 成以上就升級，最近 10 題答對不到 6 成就降一級。也可以直接點等級切換。</p>
    </section>

    <section>
      <h2>最常錯的題型</h2>
      ${weak.length ? `
      <ul class="weak-list">
        ${weak.map((w) => `<li><span>${esc(tagName(w.tag))}</span><span class="rate">最近錯 ${pct(w.rate)}</span></li>`).join('')}
      </ul>
      <p class="note">這些題型之後會比較常出現。</p>` : '<p class="note" style="margin:0">練幾題之後，這裡會列出最常錯的題型。</p>'}
    </section>

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
    case 'next': nextAfterWrong(); break;
    case 'quit': endSession(); break;
    case 'home': go('home'); break;
    case 'again': startSession(ui.summary.module); break;
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
  ui = { input: '', wrong: null, flash: false, summary: null };
  screen = 'practice';
  startTimer();
  render();
}

function newProblem() {
  const s = state.session;
  s.problem = generateProblem(state, s.module, Math.random);
  ui.input = '';
  ui.wrong = null;
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

function renderPractice() {
  const s = state.session;
  if (!s) { go('home'); return; }
  const p = s.problem;
  const mono = p.module === 'base' && p.answerBase !== 10;
  const promptMono = p.module === 'base' && p.promptBase !== 10;
  const sub = p.module === 'base' ? `<sub>(${p.promptBase})</sub>` : '';
  const clock = s.pace === 'sprint'
    ? `<span class="timer" aria-label="剩餘秒數">${Math.max(0, Math.ceil((s.goalMs - s.elapsedMs) / 1000))}</span>`
    : '<span></span>';

  const shownInput = ui.input === '' ? '＿' : (p.answerBase === 2 ? groupBits(ui.input) : ui.input);

  let middle;
  if (ui.wrong) {
    middle = `
    <div class="question explain">
      <div class="result">
        <p class="muted">${esc(p.label || '算算看')}：${esc(p.prompt)}${p.module === 'arith' ? ' = ?' : ''}</p>
        <p class="big">正確答案：<span class="${mono ? 'mono' : ''}">${esc(p.answerBase === 2 ? groupBits(p.answer) : p.answer)}</span></p>
        <p class="yours">你寫的是 ${esc(ui.wrong)}</p>
      </div>
      <ol class="steps">
        ${p.steps.map((st) => (typeof st === 'string'
          ? `<li>${esc(st)}</li>`
          : `<li><table><thead><tr>${st.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
              <tbody>${st.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></li>`)).join('')}
      </ol>
    </div>`;
  } else {
    middle = `
    <div class="question">
      ${p.label ? `<div class="q-label">${esc(p.label)}</div>` : ''}
      <div class="q-prompt ${promptMono ? 'mono' : ''}">${esc(p.prompt)}${sub}${p.module === 'arith' ? ' =' : ''}</div>
      <div class="answer ${mono ? 'mono' : ''} ${ui.input === '' ? 'empty' : ''} ${ui.flash ? 'good' : ''}" aria-label="你的答案">${esc(shownInput)}</div>
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
    ${ui.wrong ? `
    <div class="pad next"><button class="key ok" data-act="next">${timeUp() ? '看結果' : '看懂了，下一題'}</button></div>`
    : keypad(p.keypad)}
  </section>`;
}

function keypad(kind) {
  const k = (key, cls = '', label = key) =>
    `<button class="key ${cls}" data-act="key" data-key="${key}" ${key === 'del' ? 'aria-label="刪除"' : ''}>${label}</button>`;
  const del = (cls = 'fn') => k('del', cls, '⌫');
  const ok = (cls = 'ok') => `<button class="key ${cls}" data-act="key" data-key="ok" ${ui.input === '' ? 'disabled' : ''}>確定</button>`;
  if (kind === 'bin') {
    return `<div class="pad bin">${k('0')}${k('1')}${del()}${ok()}</div>`;
  }
  if (kind === 'hex') {
    return `<div class="pad hex">
      ${k('7')}${k('8')}${k('9')}${k('A', 'letter')}
      ${k('4')}${k('5')}${k('6')}${k('B', 'letter')}
      ${k('1')}${k('2')}${k('3')}${k('C', 'letter')}
      ${k('0')}${k('D', 'letter')}${k('E', 'letter')}${k('F', 'letter')}
      ${del('fn wide')}${ok('ok wide')}
    </div>`;
  }
  return `<div class="pad dec">
    ${k('1')}${k('2')}${k('3')}${k('4')}${k('5')}${k('6')}${k('7')}${k('8')}${k('9')}
    ${del()}${k('0')}${ok()}
  </div>`;
}

const ALLOWED = { dec: /^[0-9]$/, bin: /^[01]$/, hex: /^[0-9A-F]$/ };

function pressKey(key) {
  const s = state.session;
  if (!s || ui.wrong || ui.flash) return;
  if (key === 'del') ui.input = ui.input.slice(0, -1);
  else if (key === 'ok') { submit(); return; }
  else if (ALLOWED[s.problem.keypad].test(key) && ui.input.length < MAX_INPUT) ui.input += key;
  else return;
  renderPractice();
}

function submit() {
  const s = state.session;
  if (ui.input === '') return;
  const correct = isCorrect(s.problem, ui.input);
  s.n++;
  if (correct) s.correct++;
  const change = recordAnswer(state, s.problem, correct);
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
    ui.wrong = s.problem.answerBase === 2 ? groupBits(ui.input) : ui.input;
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
    ui.summary = {
      module: s.module,
      n: s.n,
      correct: s.correct,
      finished: s.elapsedMs >= s.goalMs,
      levelFrom: s.levelStart,
      levelTo: state.modules[s.module].level,
      minutes: Math.round(s.elapsedMs / 60000),
    };
  }
  state.session = null;
  ui.input = '';
  ui.wrong = null;
  save();
  go(ui.summary ? 'summary' : 'home');
}

// ---------- 結算 ----------

function renderSummary() {
  const r = ui.summary;
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
  if (state.session) { tick(); }
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
  if (ui.wrong) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextAfterWrong(); }
    return;
  }
  if (e.key === 'Enter') pressKey('ok');
  else if (e.key === 'Backspace') pressKey('del');
  else if (/^[0-9a-fA-F]$/.test(e.key)) pressKey(e.key.toUpperCase());
});
