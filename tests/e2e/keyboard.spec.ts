import { expect, test } from '@playwright/test';
import { hasDatabase } from './helpers/env';

/**
 * 08 문서 §10의 10·16번 — 키보드 조작과 해설 머무르기.
 */
test.skip(!hasDatabase(), 'DATABASE_URL 없음 — 로컬 Supabase 스택이 필요합니다.');

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'lg-1280', '키보드 조작은 lg에서 확인합니다.');
});

test('숫자 키로 보기를 선택할 수 있다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 10000 });

  await page.keyboard.press('1');
  await expect(page.getByRole('status')).toBeVisible({ timeout: 10000 });
});

test('A/S/D/F 키도 동작한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 10000 });

  await page.keyboard.press('a');
  await expect(page.getByRole('status')).toBeVisible({ timeout: 10000 });
});

test('해설을 열면 자동 전환이 멈춘다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 10000 });
  await options.first().click();

  await page.getByRole('button', { name: '해설 자세히' }).click();

  // 자동 전환(1.6초)보다 길게 기다려도 다음 타석으로 넘어가지 않아야 한다.
  await page.waitForTimeout(3000);
  await expect(page.getByText('자동 전환이 멈췄습니다')).toBeVisible();
});

test('Esc 로 나가기 확인이 열린다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });

  await page.keyboard.press('Escape');
  await expect(page.getByText('중도 종료됩니다')).toBeVisible({ timeout: 5000 });
});
