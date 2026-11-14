// Service worker: network-first, so a new version shows up as soon as the phone is online,
// with the last good copy of every file kept so the app still opens offline.
// Add EVERY new file to SHELL, or it will not open offline (lesson from Dreaming).
const CACHE = 'cyber-colizeum';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'version.json',
  'css/app.css',
  'css/live.css',
  'css/deals.css',
  'css/book.css',
  'css/me.css',
  'css/staff.css',
  'js/app.js',
  'js/api.js',
  'js/push.js',
  'js/engine.js',
  'js/store.js',
  'js/time.js',
  'js/ui.js',
  'js/data/club.js',
  'js/data/live.js',
  'js/data/deals.js',
  'js/data/bookings.js',
  'js/data/inbox.js',
  'js/screens/live.js',
  'js/screens/deals.js',
  'js/screens/book.js',
  'js/screens/me.js',
  'js/screens/staff.js',
  'js/screens/deal-edit.js',
  'js/screens/map.js',
  'img/logo.png',
  'img/wordmark.png',
  'icons/logo-180.png',
  'icons/logo-192.png',
  'icons/logo-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // no-cache: always ask the server whether the file changed (GitHub Pages caches for 10 minutes).
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

// A notification from the club's server (server/server.js → Web Push): show it, and tell an open app so the
// message also lands in its inbox. iPhone requires every push to show a notification.
self.addEventListener('push', (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch { m = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    await self.registration.showNotification(m.title || 'Cyber Colizeum', {
      body: m.body || '',
      icon: 'icons/logo-192.png',
      tag: m.id || undefined,
      data: { link: m.link || '#deals' },
    });
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const win of wins) win.postMessage({ type: 'push', message: m });
  })());
});

// Tapping a notification opens the app (or brings it forward) on the screen the message points to.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '#live';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins[0]) {
        wins[0].postMessage({ link });
        return wins[0].focus();
      }
      return self.clients.openWindow(`./${link}`);
    })
  );
});
