// 進度只存在這台裝置的瀏覽器裡（localStorage），不會上傳到任何地方。
import { normalizeState, defaultState } from './engine.js';

const KEY = 'cht-calc-practice/state';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** 請瀏覽器不要在空間不足時自動清掉這個 App 的資料。回傳是否成功。 */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
