import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerQuestion as answer, clearEmulators, finishOnboarding, hasFirestore, signUp, uniqueEmail } from './helpers';

/**
 * 애니메이션 2차·소리(docs/motion-plan.md, docs/sound-plan.md) — 뜨고, 사라지고, 아무것도 막지 않는지.
 * 소리는 귀로 확인할 수 없어 "소리 장치(AudioContext)가 언제 생기나"로 본다: 기본 끔이면 생기지 않는다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await clearEmulators();
});

/** 소리 장치가 몇 번 만들어졌는지 센다 */
async function countAudioContexts(page: Page) {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    (window as unknown as { __audioContexts: number }).__audioContexts = 0;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        (window as unknown as { __audioContexts: number }).__audioContexts += 1;
      }
    };
  });
}
const audioContexts = (page: Page) => page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

test('경기: 문제 카드가 밀려 들어오고, 첫 안타·첫 홈런 표시, 3아웃 체인지, 비공식 레벨 막대 — 소리는 기본 끔', async ({ page }) => {
  test.setTimeout(90_000);
  await countAudioContexts(page);
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('section.fx-pitch-in')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '소리' })).toHaveAttribute('aria-pressed', 'false');

  await answer(page, true);
  await expect(page.getByText(/^첫 (홈런|안타)!$/)).toBeVisible();
  await page.getByRole('button', { name: '다음 타석' }).click();

  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible();
    await answer(page, false);
    await expect(page.locator('.fx-shake')).toHaveCount(1); // 아웃 글자만 흔들림
    await expect(page.getByText(/^첫 (홈런|안타)!$/)).toHaveCount(0); // 두 번째부터는 없음
    if (out < 2) await page.getByRole('button', { name: '다음 타석' }).click();
  }
  await expect(page.locator('.play-ball-banner')).toHaveText('3아웃 체인지');
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('heading', { name: /Lv\.1 육성선수/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('progressbar', { name: '다음 레벨까지' })).toBeVisible();
  expect(await audioContexts(page)).toBe(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
});

test('소리: 홈에서 켜면 그때 소리 장치가 생기고 기기에 남는다, 경기 화면 단추로 끈다', async ({ page }) => {
  await countAudioContexts(page);
  await page.goto('/');
  await expect(page.getByLabel('소리')).toHaveValue('off');
  expect(await audioContexts(page)).toBe(0);
  await page.getByLabel('소리').selectOption('mid');
  await expect.poll(() => audioContexts(page)).toBe(1);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('yk_sound')))!)).toEqual({ on: true, volume: 'mid', taps: false });

  await page.goto('/play');
  const toggle = page.getByRole('button', { name: '소리' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await answer(page, true); // 소리가 나도 화면은 그대로
  await expect(page.getByRole('button', { name: '다음 타석' })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('yk_sound'))).toBeNull(); // 기본값으로 돌아오면 지움
});

test('화면 전환: 주소가 바뀌면 새 화면이 올라온다, 가입이 끝나면 환영 띠', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.locator('.page-enter')).toHaveCount(1);
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  const nickname = await finishOnboarding(page);
  await expect(page.getByRole('status').filter({ hasText: '환영해요' })).toContainText(`환영해요, ${nickname} 선수!`);
  await expect(page.locator('.welcome-banner')).toHaveCount(0, { timeout: 6_000 }); // 2.6초 뒤 닫힘
  await page.reload();
  await expect(page.getByRole('heading', { name: '야구 상식으로 홈런 치자!' })).toBeVisible();
  await expect(page.locator('.welcome-banner')).toHaveCount(0); // 새로고침해도 다시 뜨지 않음
});

test('동작 줄이기: 움직임 없음(띠도 흔들림도), 결과 글자는 그대로', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  expect(await page.locator('section.fx-pitch-in').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await answer(page, false);
  expect(await page.locator('.fx-shake').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect(page.getByRole('status').first()).toContainText('아웃');
});
