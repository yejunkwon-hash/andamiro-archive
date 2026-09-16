/* 안다 아카이브 — 서비스 워커 (세션 BO 후반: 예전 PWA 캐시 워커 + 푸시 알림을 합쳤다)
   1) 예전 역할 그대로: 앱 껍데기(index.html·아이콘·manifest)를 캐시해 오프라인/느린 망에서도 뜨게 한다.
      Supabase API·CAPTCHA는 절대 캐시하지 않는다. 문서(index.html)는 네트워크 먼저, 실패하면 캐시.
   2) 새 역할: 푸시 알림 표시 + 알림 탭 → 앱을 KYPT 탭으로 연다.
   ★캐시 이름을 올렸다(anda-v1 → anda-v2): 이 파일이 설치되면 예전 캐시는 activate에서 지워진다. */
const CACHE = 'anda-v4';   // 세션 CI: manifest 파일명 변경(anda-archive.webmanifest)   // 세션 BS: 배지·목적지 수정 — 이름을 올려야 폰이 새 워커를 받는다
const SHELL = ['./', './index.html', './icon-192.png', './icon-512.png', './anda-archive.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))   // 하나 실패해도 설치는 진행
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase(데이터·인증·스토리지)와 CAPTCHA는 서비스 워커가 손대지 않는다
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('cloudflare.com') ||
      url.hostname.includes('challenges.cloudflare.com')) return;

  const isDoc = req.mode === 'navigate' ||
                (req.destination === 'document') ||
                url.pathname.endsWith('/') ||
                url.pathname.endsWith('index.html');

  if (isDoc) {
    // 네트워크 먼저 → 새로 받은 index.html을 캐시에 넣는다. 실패하면 캐시본으로 앱을 띄운다.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 그 외 정적 자원(아이콘·CDN 라이브러리): 캐시 먼저, 없으면 받아서 캐시
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});

/* ---------- 푸시 알림 (106 · kypt-nudge) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '안다 아카이브';
  const url = d.url || '#//kypt';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || 'anda',
    renotify: true,
    icon: d.icon || './icon-192.png',      // 오른쪽 큰 그림 — 앱 아이콘
    badge: d.badge || './badge-96.png',    // 상태줄 작은 단색 표식 (컬러 아이콘을 넣으면 검은 네모가 된다)
    data: { url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  /* ★세션 BP: 사이트가 하위 경로(예: /repo/)에 있을 수 있다 — 서비스 워커의 scope(= index.html이 있는 폴더)를 기준으로 만든다.
     예전엔 origin 기준 '/#//kypt' 라서 GitHub Pages 같은 곳에서 404로 갔다. */
  const raw = (e.notification.data && e.notification.data.url) || '#//kypt';
  const base = self.registration.scope;                                  // 예: https://user.github.io/repo/
  const target = /^https?:/i.test(raw) ? raw : new URL(raw.replace(/^\/+/, ''), base).href;
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
