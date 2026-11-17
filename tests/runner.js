// 迷你測試工具：不需要安裝任何東西，用瀏覽器打開 tests/index.html 就會跑。
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

function fmt(v) {
  return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 0);
}

export function eq(actual, expected, msg = '') {
  const a = fmt(actual), e = fmt(expected);
  if (a !== e) throw new Error(`${msg} 預期 ${e}，實際 ${a}`);
}

export function ok(cond, msg = '條件不成立') {
  if (!cond) throw new Error(msg);
}

export async function run() {
  const out = document.getElementById('out');
  let pass = 0, fail = 0;
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
    } catch (err) {
      fail++;
      failures.push(`✗ ${t.name}\n    ${err.message}`);
    }
  }
  const summary = `${fail === 0 ? 'PASS' : 'FAIL'}：${pass} 通過，${fail} 失敗（共 ${tests.length}）`;
  document.title = summary;
  out.textContent = [summary, '', ...failures].join('\n');
  out.className = fail === 0 ? 'pass' : 'fail';
  window.__testResult = { pass, fail, failures };
}
