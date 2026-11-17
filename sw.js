// Service worker：第一次打開後把整個 App 存在手機裡，之後沒有網路也能用。
// 每次發布新版時，把 VERSION 加 1，手機下次開 App 就會換成新版。
const VERSION = 'v5';
const CACHE = `cht-calc-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/arith.js',
  'js/base.js',
  'js/bits.js',
  'js/engine.js',
  'js/rng.js',
  'js/storage.js',
  'js/subnet.js',
  'js/units.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
// App 的首頁。沒有網路時，不管從哪個網址打開，都拿這一份。
const HOME = new URL('./', self.registration.scope).href;
const NAV_TIMEOUT_MS = 3000;

// GitHub Pages 會讓瀏覽器暫存檔案 10 分鐘。建立新版快取時用 cache: 'reload'
// 直接向網站拿最新的檔案，避免把瀏覽器暫存的舊檔案存進新版快取。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cachedHome() {
  return caches.open(CACHE)
    .then((c) => c.match(HOME))
    .then((r) => r || caches.match(HOME))
    .then((r) => r || Response.error());
}

/** 打開 App（網頁導覽）：有網路就拿最新版，沒網路或 3 秒沒回應就用手機裡存的首頁。 */
function handleNavigate(req) {
  const network = fetch(req).then((res) => {
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(HOME, copy)).catch(() => {});
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  return Promise.race([network.catch(() => null), timeout])
    .then((res) => res || cachedHome());
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }

  // 其他檔案（程式、樣式、圖示）：先用手機裡存的，同時在背景抓新版存起來。
  url.search = '';
  const key = url.href;
  const update = fetch(key, { cache: 'no-cache' })
    .then(async (res) => {
      if (res.ok) {
        const c = await caches.open(CACHE);
        await c.put(key, res.clone());
      }
      return res;
    });
  const fromCache = caches.open(CACHE).then((c) => c.match(key));
  event.respondWith(
    fromCache
      .then((cached) => cached || update)
      .catch(() => fromCache.then((cached) => cached || Response.error())),
  );
  event.waitUntil(update.then(() => undefined, () => undefined));
});
