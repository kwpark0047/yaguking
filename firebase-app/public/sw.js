/*
 * 야구왕 서비스 워커 — 홈 화면에 추가(PWA)용. src/lib/pwa/install.ts가 운영 빌드에서만 등록한다.
 *
 * 하는 일은 작게:
 * - 같은 주소의 **파일 이름에 해시가 붙은 정적 파일**(/assets/*)과 아이콘만 한 번 받아 두고 다시 쓴다(빠른 다시 열기)
 * - 화면(HTML)은 항상 네트워크에서 — 배포하면 바로 새 화면. 오프라인 기능은 없다(오프라인이면 브라우저 기본 오류)
 * - **다른 주소(Firebase 인증·Firestore 등)와 GET이 아닌 요청, 로그인 처리 주소(/__/)는 손대지 않는다** —
 *   로그인 토큰·개인 기록·API 응답은 저장하지 않는다
 *
 * 판(CACHE)을 올리면 활성화될 때 이전 판 저장소를 지운다. 해시 파일은 배포마다 새 이름이라 판을 올리지 않아도
 * 새 파일을 받는다 — 쌓이지 않게 MAX_ENTRIES개만 남긴다.
 */
const CACHE = 'yaguking-static-v1';
const MAX_ENTRIES = 80;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('yaguking-') && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** 저장해도 되는 요청 — 같은 주소의 해시 정적 파일·아이콘만 */
function cacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  if (!cacheable(event.request)) return; // 브라우저 기본(네트워크) 그대로
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        await cache.put(event.request, response.clone());
        await trim(cache);
      }
      return response;
    })(),
  );
});
