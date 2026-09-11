/* 안다 아카이브 — 서비스 워커 (세션 BO)
   역할은 두 가지뿐: ① 푸시 알림 표시 ② 알림 탭 → 앱을 KYPT 탭으로 연다.
   ★캐시하지 않는다 — index.html을 캐시하면 새 배포가 안 보인다(세션 교훈: 배포 후 Ctrl+Shift+R). */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '안다 아카이브';
  const url = d.url || '/#//kypt';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || 'anda',
    renotify: true,
    icon: d.icon || 'icon-192.png',
    badge: d.badge || 'icon-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#//kypt';
  const target = new URL(url, self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        try { await w.focus(); } catch (_) {}
        try { if ('navigate' in w) { await w.navigate(target); } else { w.postMessage({ go: target }); } } catch (_) {}
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
