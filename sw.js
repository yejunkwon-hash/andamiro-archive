/* 안다 아카이브 서비스 워커
   원칙:
   1) Supabase API 응답은 절대 캐시하지 않는다 — 낡은 문서·낡은 권한이 보이면 재앙이다.
   2) 앱 껍데기(index.html·아이콘·CDN 스크립트)만 캐시한다 → 실험실 와이파이가 흔들려도 앱은 뜬다.
   3) index.html은 '네트워크 먼저, 실패하면 캐시' — 배포한 새 버전이 즉시 반영된다.
   버전을 올리면 옛 캐시는 전부 지워진다. */
const CACHE = 'anda-v1';
const SHELL = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.webmanifest'];

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

  // ★Supabase(데이터·인증·스토리지)와 CAPTCHA는 서비스 워커가 손대지 않는다
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('cloudflare.com') ||
      url.hostname.includes('challenges.cloudflare.com')) {
    return;
  }

  const isDoc = req.mode === 'navigate' ||
                (req.destination === 'document') ||
                url.pathname.endsWith('/') ||
                url.pathname.endsWith('index.html');

  if (isDoc) {
    // 네트워크 먼저 → 새로 배포한 index.html을 바로 받는다. 실패하면 캐시본으로 앱을 띄운다.
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
