import { expect, test } from '@playwright/test';
import { hasDatabase } from './helpers/env';

/**
 * 08 문서 §10의 1·2·6·7·9·16번 — 경기 진행 전 과정.
 *
 * DB가 필요하다. DATABASE_URL이 없으면 전체를 건너뛴다.
 * 뷰포트 조합까지 모두 돌릴 필요는 없어 sm·lg 두 가지에서만 수행한다.
 */
test.skip(!hasDatabase(), 'DATABASE_URL 없음 — 로컬 Supabase 스택이 필요합니다.');

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !['sm-360', 'lg-1280'].includes(testInfo.project.name),
    '경기 흐름은 sm·lg에서만 확인합니다.',
  );
});

test('랜딩 진입부터 첫 타석 제출까지 탭 0회', async ({ page }) => {
  await page.goto('/');

  // 0탭 진입: 문항이 이미 떠 있어야 한다 (08 문서 §3).
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  // 첫 타석에는 3초 카운트다운이 있다.
  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options).toHaveCount(4);

  await expect(options.first()).toBeEnabled({ timeout: 10000 });
  await options.first().click();

  // 판정 시트가 뜬다.
  await expect(page.getByRole('status')).toBeVisible({ timeout: 10000 });
});

test('3아웃이면 결과 화면으로 이동한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  // 정답을 모르므로 틀릴 때까지 눌러 아웃을 쌓는다. 최대 20타석.
  for (let i = 0; i < 20; i += 1) {
    if (page.url().includes('/result')) break;

    const options = page.getByRole('group', { name: '보기' }).getByRole('button');
    if ((await options.count()) === 0) break;

    await expect(options.first()).toBeEnabled({ timeout: 10000 });
    await options.first().click();
    await page.waitForTimeout(2200); // 판정 1.6초 + 여유
  }

  await expect(page).toHaveURL(/\/result/, { timeout: 20000 });
  await expect(page.getByText('BOX SCORE')).toBeVisible();
});

test('경기 중 새로고침해도 상태가 복원되고 타석이 중복되지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  const beforeStem = await page.locator('#question-stem').textContent();
  await page.reload();

  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });
  const afterStem = await page.locator('#question-stem').textContent();

  // 같은 타석이 복원되어야 한다 (새 문항이 뽑히면 안 된다).
  expect(afterStem).toBe(beforeStem);
});

test('제출 직후 새로고침해도 중복 제출이 생기지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 10000 });
  await options.first().click();
  await expect(page.getByRole('status')).toBeVisible({ timeout: 10000 });

  await page.reload();
  // 복원 후에도 경기가 계속되거나 결과로 이동한다. 오류 화면이면 안 된다.
  await expect(page.getByText('경기를 찾을 수 없습니다')).toHaveCount(0);
});

test('오프라인이면 입력이 잠기고 안내가 뜬다', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await expect(page.getByRole('alert')).toContainText('오프라인', { timeout: 5000 });

  await context.setOffline(false);
});
