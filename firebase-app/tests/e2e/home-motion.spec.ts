import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * 메인 움직임 — 히어로 바탕(HeroSky: 켜기면 별빛·조명·빛 안개, 줄이기면 별빛만, 끄기·동작 줄이기면 멈춤)과 게임 시작 단추(StartButton).
 * Firestore 없이 도는 화면(첫 방문 메인)만 본다.
 */
const sky = (page: Page) => page.locator('main.home-hero .hero-sky');

/** `within`(기본: 히어로 바탕 층) 안에서 돌고 있는 애니메이션 이름 — 가상 요소(::before·::after)의 것도 */
const running = (page: Page, within = '.hero-sky') =>
  page.evaluate(
    (selector) =>
      document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return a.playState === 'running' && target instanceof Element && target.closest(selector);
        })
        .map((a) => (a as CSSAnimation).animationName)
        .sort(),
    within,
  );
const startButton = (page: Page) => page.getByRole('link', { name: /게임 시작/ });
const startAnimations = (page: Page) => running(page, '.start-cta');

/** 소리 합성기(오실레이터)가 몇 개 만들어졌는지 센다 — 시작 소리는 6개, 문제 화면의 투구 소리는 0개 */
async function countOscillators(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __oscillators: number };
    w.__oscillators = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__oscillators += 1;
      return original.call(this);
    };
  });
}
const oscillators = (page: Page) => page.evaluate(() => (window as unknown as { __oscillators: number }).__oscillators);

test('켜기(기본): 별빛 세 무리·조명·빛 안개가 돌고, 누르는 것을 막지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'full');
  await expect(sky(page)).toHaveCount(1);
  expect(await sky(page).evaluate((el) => [getComputedStyle(el).pointerEvents, el.getAttribute('aria-hidden')])).toEqual(['none', 'true']);
  await expect.poll(() => running(page)).toEqual(['hero-glow', 'hero-haze', 'hero-twinkle', 'hero-twinkle', 'hero-twinkle']);
  // 별빛이 실제로 밝아졌다 어두워진다(투명도가 바뀐다)
  const opacity = () => sky(page).locator('.hero-sky__stars--1').evaluate((el) => Number(getComputedStyle(el).opacity));
  const first = await opacity();
  await expect.poll(opacity, { timeout: 4_000 }).not.toBe(first);
  // 꾸밈 층이 단추를 가리지 않는다
  await page.getByRole('link', { name: /게임 시작/ }).click({ trial: true });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
});

test('줄이기: 조명·안개는 멈추고 별빛만 느리게, 끄기: 모두 멈춘다(원래 그림)', async ({ page }) => {
  await page.goto('/');
  const select = page.getByLabel('화면 효과');
  await select.selectOption('reduced');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'calm');
  await expect.poll(() => running(page)).toEqual(['hero-twinkle-calm', 'hero-twinkle-calm', 'hero-twinkle-calm']);
  await expect(sky(page).locator('.hero-sky__haze')).toBeHidden();
  await expect(sky(page).locator('.hero-sky__lights')).toBeHidden();

  await select.selectOption('off');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  await expect(sky(page)).toBeHidden();
  await expect.poll(() => running(page)).toEqual([]);

  // 다시 열어도 멈춘 그대로(기기에 남음)
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  await expect(sky(page)).toBeHidden();
  expect(await running(page)).toEqual([]);
  await select.selectOption('on');
  await expect.poll(() => running(page)).toHaveLength(5);
});

test('기기의 동작 줄이기: 설정이 켜기여도 바탕은 움직이지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  await expect(page.getByLabel('화면 효과')).toHaveValue('on');
  await expect(sky(page)).toBeHidden();
  await page.waitForTimeout(500);
  expect(await running(page)).toEqual([]);
});

test('고대비 테마: 바탕 그림이 없으므로 움직임 층도 없다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('yk_theme', 'contrast'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'contrast');
  await expect(sky(page)).toBeHidden();
  expect(await running(page)).toEqual([]);
});

test.describe('게임 시작 단추', () => {
  test('켜기: 둘레 빛·지나가는 빛·▶가 움직여도 단추 자리는 그대로, 소리가 꺼져 있으면(기본) 소리 장치 없이 경기로', async ({ page }) => {
    await countOscillators(page);
    await page.goto('/');
    await expect(startButton(page)).toBeVisible();
    await expect.poll(() => startAnimations(page)).toEqual(['start-halo', 'start-nudge', 'start-shine']);
    // 단추 상자 자체는 움직이지 않는다(위쪽 카드가 늦게 뜨며 밀리는 것과 별개로) — 크기 그대로, 변형·애니메이션 없음
    const own = () =>
      startButton(page).evaluate((el) => {
        const style = getComputedStyle(el);
        const { width, height } = el.getBoundingClientRect();
        return [Math.round(width), Math.round(height), style.transform, style.animationName]; // 글꼴이 뜨며 생기는 1px 미만 차이는 무시
      });
    const before = await own();
    expect(before.slice(2)).toEqual(['none', 'none']);
    await page.waitForTimeout(800);
    expect(await own()).toEqual(before);
    await startButton(page).click();
    await expect(page).toHaveURL(/\/play$/);
    expect(await oscillators(page)).toBe(0);
  });

  test('소리를 켜면 누를 때 시작 소리(방망이·응원)가 난다', async ({ page }) => {
    await countOscillators(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('yk_sound', JSON.stringify({ on: true, volume: 'low', taps: false })));
    await page.reload();
    await startButton(page).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect.poll(() => oscillators(page)).toBeGreaterThanOrEqual(6);
  });

  test('줄이기: 둘레 빛만 느리게, 끄기: 모두 멈춘다', async ({ page }) => {
    await page.goto('/');
    const select = page.getByLabel('화면 효과');
    await select.selectOption('reduced');
    await expect.poll(() => startAnimations(page)).toEqual(['start-halo']);
    expect(await page.locator('.start-cta').evaluate((el) => getComputedStyle(el, '::before').animationDuration)).toBe('5s');
    await select.selectOption('off');
    await expect.poll(() => startAnimations(page)).toEqual([]);
    await select.selectOption('on');
    await expect.poll(() => startAnimations(page)).toHaveLength(3);
  });

  test('기기의 동작 줄이기: 단추 장식이 움직이지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(startButton(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(await startAnimations(page)).toEqual([]);
  });
});
