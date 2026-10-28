import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { clearEmulators, finishOnboarding, hasFirestore, signUp, uniqueEmail } from './helpers';

/**
 * 즐겨찾기(머리줄 별표)·홈 화면에 추가(PWA) — docs/pwa.md. 개발 서버라 서비스 워커는 등록하지 않는다(운영 빌드 확인은 문서 참고).
 * 브라우저 설치 창(beforeinstallprompt)은 크롬이 조건이 될 때만 보내므로, 같은 모양의 이벤트를 직접 보내 단추 동작을 본다.
 */
test.describe.configure({ mode: 'serial' });

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
}

async function pageWith(browser: Browser, userAgent: string) {
  const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, hasTouch: true });
  return context.newPage();
}

/** 크롬이 보내는 설치 이벤트와 같은 모양 — prompt()를 부르면 기록하고 "설치함"으로 답한다 */
async function offerNativeInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
    event.prompt = async () => {
      (window as unknown as { __prompted: boolean }).__prompted = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
}

test.beforeAll(async () => {
  await clearEmulators();
});

test('데스크톱(윈도): 별표 → Ctrl + D 안내 창, Esc로 닫히고 초점이 별표로 돌아온다', async ({ page }) => {
  await page.goto('/');
  const star = page.getByRole('button', { name: '즐겨찾기 방법' });
  await star.click();
  const dialog = page.getByRole('dialog', { name: '즐겨찾기에 추가' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('note')).toContainText('Ctrl + D');
  await expect(dialog).toContainText('앱처럼 쓰려면 설치도 할 수 있어요'); // 크롬은 설치도 됨
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(star).toBeFocused();
});

test('맥: ⌘ Cmd + D, 아이폰 사파리: 공유 → 홈 화면에 추가, 안드로이드: 메뉴 → 앱 설치', async ({ browser }) => {
  const mac = await pageWith(browser, UA.mac);
  await mac.goto('/');
  await mac.getByRole('button', { name: '즐겨찾기 방법' }).click();
  await expect(mac.getByRole('dialog', { name: '즐겨찾기에 추가' }).getByRole('note')).toContainText('⌘ Cmd + D');

  const iphone = await pageWith(browser, UA.iphone);
  await iphone.goto('/');
  await iphone.getByRole('button', { name: '즐겨찾기 방법' }).click();
  const ios = iphone.getByRole('dialog', { name: '홈 화면에 추가' });
  await expect(ios).toContainText('공유 단추');
  await expect(ios.getByRole('listitem')).toHaveCount(3);
  await expect(ios.getByRole('button', { name: '앱 설치하기' })).toHaveCount(0); // iOS에는 설치 창이 없다
  await axe(iphone);
  await ios.getByRole('button', { name: '닫기' }).click();
  await expect(ios).toBeHidden();

  const android = await pageWith(browser, UA.android);
  await android.goto('/');
  await android.getByRole('button', { name: '즐겨찾기 방법' }).click();
  await expect(android.getByRole('dialog', { name: '홈 화면에 추가' })).toContainText('메뉴(⋮)');
  // 설치 창이 오면 "앱 설치하기" 단추로 바로 띄운다
  await offerNativeInstall(android);
  await android.getByRole('dialog', { name: '홈 화면에 추가' }).getByRole('button', { name: '앱 설치하기' }).click();
  await expect.poll(() => android.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
  await expect(android.getByRole('dialog', { name: '홈 화면에 추가' }).getByRole('status')).toContainText('설치했어요');
});

test('가입 직후 한 번: 홈 화면에 추가 권유 → "나중에"는 기억하고 앱은 그대로, 설정에서 다시 설치할 수 있다', async ({ page }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(60_000);
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page);
  const offer = page.getByRole('complementary', { name: '⚾ 야구왕을 홈 화면에 추가하고 언제든 야구 퀴즈에 도전하세요!' });
  await expect(offer).toBeVisible({ timeout: 8_000 }); // 환영 띠가 닫힌 뒤
  await expect(offer.getByRole('button', { name: '앱 설치하기' })).toBeVisible();
  await axe(page);
  await offer.getByRole('button', { name: '나중에' }).click();
  await expect(offer).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('yk_pwa')))!)).toHaveProperty('dismissedAt');

  // 앱은 그대로 — 게임 시작
  await page.getByRole('link', { name: /게임 시작/ }).click();
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });

  // 설정: 설치 창이 없으면 안내, 오면 단추, 설치하면 "이미 설치"
  await page.goto('/settings');
  const install = page.getByRole('region', { name: '앱 설치' });
  await expect(install).toContainText('설치 아이콘');
  await offerNativeInstall(page);
  await install.getByRole('button', { name: '앱 설치하기' }).click();
  await expect(install.getByRole('status')).toContainText('설치했어요');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toContainText('이미 설치했어요');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('yk_pwa')))!)).toMatchObject({ installed: true });
});

test('이미 설치한(홈 화면 앱으로 연) 사람에게는 가입 직후 권유를 띄우지 않는다', async ({ browser }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(60_000);
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes('display-mode: standalone') ? ({ ...original(query), matches: true, media: query } as MediaQueryList) : original(query);
  });
  const page = await context.newPage();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page);
  await expect(page.getByRole('status').filter({ hasText: '환영해요' })).toBeVisible();
  await expect(page.locator('.welcome-banner')).toHaveCount(0, { timeout: 6_000 });
  await page.waitForTimeout(500);
  await expect(page.locator('.install-offer')).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: '앱 설치' })).toContainText('이미 설치했어요');
});
