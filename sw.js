// Service worker：第一次打開後把整個 App 存在手機裡，之後沒有網路也能用。
// 每次發布新版時，把 VERSION 加 1，手機下次開 App 就會換成新版。
const VERSION = 'v3';
const CACHE = `cht-calc-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/arith.js',
  'js/base.js',
  'js/engine.js',
  'js/rng.js',
  'js/storage.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

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

// 先用手機裡存的版本（快、離線也能用），同時在背景上網抓新版存起來。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  url.search = '';
  const key = url.href; // 網址後面的 ?參數 不另外存一份
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        event.waitUntil(network.then(() => undefined));
        return cached;
      }
      return network;
    }),
  );
});
