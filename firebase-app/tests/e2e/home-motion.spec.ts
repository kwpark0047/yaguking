import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * 메인 히어로 바탕 움직임(HeroSky) — 켜기면 별빛·조명·빛 안개가 돌고, 줄이기면 별빛만, 끄기·기기의 동작 줄이기면 멈춘다.
 * Firestore 없이 도는 화면(첫 방문 메인)만 본다.
 */
const sky = (page: Page) => page.locator('main.home-hero .hero-sky');

/** 히어로 바탕 층에서 돌고 있는 애니메이션 이름 */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return a.playState === 'running' && target instanceof Element && target.closest('.hero-sky');
      })
      .map((a) => (a as CSSAnimation).animationName)
      .sort(),
  );

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
