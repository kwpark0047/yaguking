/**
 * PWA 확인(운영 빌드) — 매니페스트·아이콘, 크롬의 설치 가능 판정, 서비스 워커 등록·제어, 저장소에 든 것.
 *
 *   npx cross-env VITE_USE_EMULATORS=true npm run build && npx vite preview --port 4173 (다른 창)
 *   node scripts/check-pwa.mjs [http://localhost:4173]
 *
 * 실제 사이트로도 돌릴 수 있다(읽기만): node scripts/check-pwa.mjs https://yaguking.web.app
 */
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch();
const problems = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'load' });
  const cdp = await context.newCDPSession(page);

  const manifest = await cdp.send('Page.getAppManifest');
  if (!manifest.url) problems.push('매니페스트를 찾지 못함');
  for (const error of manifest.errors ?? []) problems.push(`매니페스트 오류: ${error.message}`);

  // 서비스 워커가 페이지를 제어할 때까지(등록은 load 뒤)
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, { timeout: 15_000 }).catch(() => undefined);
  await page.reload({ waitUntil: 'load' });
  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { scope: registration?.scope ?? null, controlled: navigator.serviceWorker.controller !== null };
  });
  if (!sw.scope) problems.push('서비스 워커가 등록되지 않음');
  if (!sw.controlled) problems.push('서비스 워커가 페이지를 제어하지 않음');

  const installability = await cdp.send('Page.getInstallabilityErrors');
  for (const error of installability.installabilityErrors ?? []) problems.push(`설치 불가: ${error.errorId}`);

  const cached = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) out.push(`${name} ${new URL(request.url).pathname}`);
    return out;
  });
  const bad = cached.filter((line) => !/ \/(assets|icons)\//.test(line));
  if (bad.length > 0) problems.push(`저장하면 안 되는 것: ${bad.join(', ')}`);

  console.log(JSON.stringify({ base, manifest: manifest.url, serviceWorker: sw, cached: cached.length, sample: cached.slice(0, 5), problems }, null, 2));
} finally {
  await browser.close();
}
process.exit(problems.length > 0 ? 1 : 0);
