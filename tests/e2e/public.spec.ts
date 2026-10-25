import { expect, test } from '@playwright/test';
import { measureOverflow, measureTouchTargets } from './helpers/env';

/**
 * DB 없이 확인할 수 있는 것들 — 08 문서 §10의 13·14·15번.
 *
 * 공개 화면이 500으로 죽지 않고, 어떤 뷰포트에서도 가로 스크롤이 생기지 않으며,
 * 터치 타깃이 규격을 지키는지 본다.
 */

const PUBLIC_PATHS = [
  { path: '/', name: '랜딩' },
  { path: '/auth', name: '로그인' },
  { path: '/modes', name: '모드 선택' },
  { path: '/rankings', name: '랭킹' },
  { path: '/rankings?kind=volume', name: '랭킹(볼륨)' },
  { path: '/share/00000000-0000-0000-0000-000000000001', name: '공유 카드' },
];

for (const target of PUBLIC_PATHS) {
  test(`${target.name}: 500 없이 열린다`, async ({ page }) => {
    const response = await page.goto(target.path);
    expect(response?.status(), `${target.path} 응답 코드`).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test(`${target.name}: 가로 스크롤이 없다`, async ({ page }) => {
    await page.goto(target.path);
    const result = await measureOverflow(page);
    expect(
      result.hasHorizontalScroll,
      `${target.path} 에서 넘치는 요소: ${result.overflowing.join(', ')}`,
    ).toBe(false);
  });
}

test('모드 선택: 주 버튼이 터치 규격을 지킨다', async ({ page }) => {
  await page.goto('/modes');
  const targets = await measureTouchTargets(page, 'button');
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.height, `"${target.text}" 높이`).toBeGreaterThanOrEqual(44);
  }
});

test('랭킹: 산출 기준과 미완성 범위를 밝힌다', async ({ page }) => {
  await page.goto('/rankings');
  // RP 탭은 P3 전까지 노출하지 않는다 (08 문서 V15).
  await expect(page.getByText('RP 랭킹은 P3에 공개')).toBeVisible();
  await expect(page.getByRole('tab', { name: /비율/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /볼륨/ })).toBeVisible();
});

test('로그인: 설정되지 않은 공급자 버튼을 띄우지 않는다', async ({ page }) => {
  await page.goto('/auth');
  const configured = await page.getByText('Auth 공급자가 아직 설정되지').isVisible();
  if (configured) {
    // 미설정 상태에서는 소셜 버튼이 하나도 없어야 한다.
    await expect(page.getByRole('button', { name: /구글로 계속하기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /카카오로 계속하기/ })).toHaveCount(0);
  }
});

test('공유 카드: 문항과 정답이 담기지 않는다', async ({ page }) => {
  await page.goto('/share/00000000-0000-0000-0000-000000000001');
  const html = await page.content();
  expect(html).not.toContain('is_correct');
  expect(html).not.toContain('정답:');
});

test('컬렉션: 로그인하지 않으면 로그인 화면으로 보내고 돌아올 곳을 기억한다', async ({ page }) => {
  // 업적은 회원의 타석 원장에서 계산한다(14 문서 §5.2). 비회원에게는 보여 줄 것이 없다.
  await page.goto('/me/collection');
  await expect(page).toHaveURL(/\/auth\?returnTo=(%2F|\/)me(%2F|\/)collection/);
});

test('하단 탭은 좁은 화면에서만 보인다', async ({ page }, testInfo) => {
  await page.goto('/modes');
  const bottomNav = page.locator('nav.fixed');
  const width = page.viewportSize()?.width ?? 0;

  if (width >= 1024) {
    await expect(bottomNav, `${testInfo.project.name}: lg에서는 사이드바가 대신한다`).toBeHidden();
  } else {
    await expect(bottomNav, `${testInfo.project.name}: 하단 탭이 보여야 한다`).toBeVisible();
  }
});
