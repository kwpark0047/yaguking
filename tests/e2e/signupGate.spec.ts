import { expect, test, type Page } from '@playwright/test';
import { hasDatabase, waitForPlayable } from './helpers/env';

/**
 * 08 문서 §10의 3·5번 — 가입 게이트와 체험 상한.
 *
 * 실제 로그인은 Auth 공급자 자격증명이 있어야 하므로 여기서는
 * **게이트가 규칙대로 동작하는지**까지 본다: 결과를 가리지 않는가, 닫을 수
 * 있는가, 모달이 아닌가, 숫자를 쓰는가.
 */
test.skip(!hasDatabase(), 'DATABASE_URL 없음 — 로컬 Supabase 스택이 필요합니다.');

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'sm-360', '게이트는 sm에서만 확인합니다.');
});

async function playUntilResult(page: Page) {
  await page.goto('/');

  for (let i = 0; i < 20; i += 1) {
    if ((await waitForPlayable(page)) === 'result') return;
    const options = page.getByRole('group', { name: '보기' }).getByRole('button');
    await options.first().click();
    await page.waitForTimeout(2200);
  }
}

test('결과는 비회원에게도 전부 공개된다', async ({ page }) => {
  await playUntilResult(page);
  await expect(page).toHaveURL(/\/result/, { timeout: 20000 });

  // 박스스코어를 가리지 않는다 (08 문서 §5.1).
  const boxScore = page.getByRole('region', { name: 'BOX SCORE' });
  await expect(boxScore).toBeVisible();
  await expect(boxScore.getByText('타율', { exact: true })).toBeVisible();
  await expect(boxScore.getByText('OPS', { exact: true })).toBeVisible();
  await expect(boxScore.getByText('출루율', { exact: true })).toBeVisible();
});

test('G1 게이트는 모달이 아니고 닫을 수 있다', async ({ page }) => {
  await playUntilResult(page);
  await expect(page).toHaveURL(/\/result/, { timeout: 20000 });

  const gate = page.getByRole('region', { name: '아직 저장되지 않았습니다' });
  await expect(gate).toBeVisible();

  // 화면을 덮는 레이어가 아니어야 한다.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  await page.getByRole('button', { name: '가입 안내 닫기' }).click();
  await expect(gate).toHaveCount(0);

  // 닫아도 박스스코어는 그대로 보인다.
  await expect(page.getByText('BOX SCORE')).toBeVisible();
});

test('게이트 문구에 이 경기의 숫자가 들어간다', async ({ page }) => {
  await playUntilResult(page);
  await expect(page).toHaveURL(/\/result/, { timeout: 20000 });

  const gateText = await page
    .getByRole('region', { name: '아직 저장되지 않았습니다' })
    .textContent();

  // "기록을 저장하세요"가 아니라 안타·타율 같은 실제 값이 들어가야 한다.
  expect(gateText ?? '').toMatch(/(안타|타율|임시 기록)/);
});

test('체험 3번째 시도는 시작 전에 막힌다', async ({ page }) => {
  // 두 이닝을 끝까지 플레이한다. 타석마다 2.2초를 기다리고 첫 타석엔
  // 카운트다운이 있어, 기본 제한 시간(30초)으로는 늘 한계선이었다 — 통과한
  // 실행이 29초대였고, 안타가 몇 개만 더 나오면 플레이 도중 시간 초과로
  // 실패했다. 판정과 무관한 실패이므로 하는 일에 맞게 시간을 준다.
  test.setTimeout(90_000);

  // 1·2이닝 소진
  for (let round = 0; round < 2; round += 1) {
    await playUntilResult(page);
    await page.goto('/modes');
  }

  await page.goto('/modes');
  await page.getByRole('button', { name: /체험 1이닝/ }).click();

  await expect(page.getByText(/체험.*사용|이닝을 모두/)).toBeVisible({ timeout: 10000 });
});
