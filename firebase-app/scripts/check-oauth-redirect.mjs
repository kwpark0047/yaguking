/**
 * 구글 로그인 처리 주소가 구글 OAuth 클라이언트에 등록됐는지 확인한다 — 로그인은 하지 않는다(구글 로그인 첫 화면까지만 연다).
 *
 *   node scripts/check-oauth-redirect.mjs            # .env.production.local의 API 키로
 *
 * 등록 안 됨: 구글이 "Access blocked: This app's request is invalid"(redirect_uri_mismatch) 화면을 보여 준다.
 * 이용자 앱은 authDomain을 앱 주소(yaguking.web.app)로 쓰므로(src/lib/firebase/app.ts) 그 주소가 반드시 통과해야 한다.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const env = readFileSync(new URL('../.env.production.local', import.meta.url), 'utf8');
const apiKey = /^VITE_FIREBASE_API_KEY=(.*)$/m.exec(env)?.[1]?.trim();
if (!apiKey) throw new Error('.env.production.local에 VITE_FIREBASE_API_KEY가 없습니다.');
const hosts = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['yaguking.web.app', 'yaguking-bc25c.firebaseapp.com'];

const browser = await chromium.launch();
let failed = false;
try {
  for (const host of hosts) {
    const page = await browser.newPage();
    const params = new URLSearchParams({ apiKey, appName: '[DEFAULT]', authType: 'signInViaPopup', redirectUrl: `https://${host}/`, v: '13.1.0', providerId: 'google.com', eventId: 'check' });
    await page.goto(`https://${host}/__/auth/handler?${params}`);
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 }).catch(() => undefined);
    const blocked = /oauth\/error/.test(page.url());
    failed ||= blocked;
    console.log(`${host}: ${blocked ? '✗ 등록 안 됨(구글이 막음)' : '✓ 구글 로그인 화면이 열림'}`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
