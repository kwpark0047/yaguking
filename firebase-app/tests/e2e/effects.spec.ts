import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerQuestion as answer, clearEmulators, hasFirestore } from './helpers';

/**
 * 축하 효과 1차(docs/effects-plan.md) — 효과가 나오고, 사라지고, 아무것도 막지 않는지.
 * 빨리 맞히면 홈런이므로 테스트가 일부러 홈런을 친다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await clearEmulators();
});

const layer = (page: Page) => page.locator('canvas.effects-layer');

async function firstQuestion(page: Page) {
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
}

test('켜기(기본): 플레이 볼 띠 → 홈런 폭죽, 효과 중에도 다음 타석이 눌리고 효과는 사라진다', async ({ page }) => {
  await firstQuestion(page);
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'full');
  await expect(page.locator('.play-ball-banner')).toHaveCount(0, { timeout: 5_000 }); // 1.2초 뒤 스스로 사라짐

  await answer(page, true);
  await expect(page.getByRole('status').first()).toContainText(/홈런|2루타|3루타|안타/);
  const homeRun = (await page.locator('#verdict-title').textContent())?.includes('홈런');
  if (homeRun) {
    await expect(layer(page)).toHaveCount(1, { timeout: 5_000 });
    expect(await layer(page).evaluate((canvas) => [getComputedStyle(canvas).pointerEvents, canvas.getAttribute('aria-hidden')])).toEqual([
      'none',
      'true',
    ]);
  }
  // 효과가 도는 중에도 바로 다음 문제로
  await page.getByRole('button', { name: '다음 타석' }).click();
  await expect(page.locator('#question-stem')).toBeVisible();
  await expect(layer(page)).toHaveCount(0, { timeout: 8_000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
});

test('기기의 동작 줄이기: 띠·폭죽 없이 결과 글자만', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await firstQuestion(page);
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  await expect(page.locator('.play-ball-banner')).toHaveCount(0);
  await answer(page, true);
  await expect(page.getByRole('status').first()).toContainText(/홈런|2루타|3루타|안타/);
  await page.waitForTimeout(1_500);
  await expect(layer(page)).toHaveCount(0);
});

test('홈의 "화면 효과" 끄기는 기기에 남고(yk_effects), 다시 열어도 효과가 없다', async ({ page }) => {
  await page.goto('/');
  const select = page.getByLabel('화면 효과');
  await expect(select).toHaveValue('on');
  await select.selectOption('off');
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  expect(await page.evaluate(() => localStorage.getItem('yk_effects'))).toBe('off');

  await firstQuestion(page);
  await expect(page.locator('html')).toHaveAttribute('data-effects', 'none');
  await expect(page.locator('.play-ball-banner')).toHaveCount(0);
  await answer(page, true);
  await page.waitForTimeout(1_500);
  await expect(layer(page)).toHaveCount(0);

  await page.goto('/');
  await page.getByLabel('화면 효과').selectOption('on');
  expect(await page.evaluate(() => localStorage.getItem('yk_effects'))).toBeNull(); // 기본값은 저장하지 않는다
});
