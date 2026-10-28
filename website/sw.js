// 連線時先向伺服器確認 html / css / js 是否更新，離線才用瀏覽器裡的舊檔。
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.destination !== 'document' && req.destination !== 'script' && req.destination !== 'style') return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).catch(() => caches.match(req).then((hit) => hit || Promise.reject()))
  );
});
