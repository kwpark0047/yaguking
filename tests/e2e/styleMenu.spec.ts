import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { hasDatabase, measureOverflow, waitForPlayable, WCAG_TAGS } from './helpers/env';

/**
 * 비회원의 화면 스타일 진입점 (08 문서 §2.6).
 *
 * 설정 화면은 회원 전용이라 비회원은 스타일을 고를 곳이 없었다. 비회원에게는
 * 랜딩이 곧 첫 타석이므로 경기 화면 헤더와 결과 화면에 "화면" 메뉴를 둔다.
 *
 * 경기 화면이라 생기는 위험을 함께 지킨다.
 *   - 메뉴 안에서 누른 키가 답 단축키(1~4, A·S·D·F)로 새면 안 된다
 *   - Esc는 메뉴만 닫아야 한다. 경기 화면에서 Esc는 "나가기" 확인을 연다
 *
 * Playwright는 테스트마다 새 브라우저 문맥을 쓰므로 매번 새 비회원이다.
 */
test.skip(!hasDatabase(), 'DATABASE_URL 없음 — 로컬 Supabase 스택이 필요합니다.');

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !['sm-360', 'lg-1280'].includes(testInfo.project.name),
    '진입점은 sm·lg에서만 확인합니다.',
  );
});

async function openGame(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15000 });
}

const styleButton = (page: Page) => page.getByRole('button', { name: '화면' });

test('비회원이 경기 화면에서 고대비를 고르면 즉시 바뀌고 새로고침해도 유지된다', async ({
  page,
  context,
}) => {
  await openGame(page);

  await styleButton(page).click();
  await expect(styleButton(page)).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('radio', { name: /고대비/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'contrast');

  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'yk_style')?.value).toBe('contrast');

  // 서버가 쿠키를 읽어 첫 화면부터 고대비로 그린다
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'contrast');
});

test('메뉴 안에서 A·1을 눌러도 답이 제출되지 않는다', async ({ page }) => {
  await openGame(page);

  // 카운트다운이 끝나 답을 낼 수 있는 상태까지 기다린다
  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.first()).toBeEnabled({ timeout: 10000 });
  const stem = await page.locator('#question-stem').textContent();

  await styleButton(page).click();
  // 타석 시간이 흐르는 중이라는 경고가 보인다
  await expect(page.getByText('타석 시간은 멈추지 않습니다')).toBeVisible();
  // 초점은 메뉴의 선택된 항목에 있다
  await expect(page.getByRole('radio', { name: /자동/ })).toBeFocused();

  for (const key of ['a', 's', '1', '2']) await page.keyboard.press(key);

  // 제출되었다면 "판정 확인 중"이 뜨거나 보기가 잠긴다
  await expect(page.getByText('판정 확인 중')).toHaveCount(0);
  await expect(options.first()).toBeEnabled();
  await expect(page.locator('#question-stem')).toHaveText(stem ?? '');
});

test('Esc는 메뉴만 닫고 나가기 확인을 띄우지 않는다', async ({ page }) => {
  await openGame(page);

  await styleButton(page).click();
  await expect(page.getByRole('radio', { name: /자동/ })).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(styleButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('radio', { name: /자동/ })).toBeHidden();
  await expect(page.getByText('지금 나가면')).toHaveCount(0);
  // 닫히면 초점이 버튼으로 돌아온다
  await expect(styleButton(page)).toBeFocused();
});

test('메뉴를 열어도 가로 스크롤이 생기지 않고 axe 위반이 없다', async ({ page }) => {
  await openGame(page);
  await styleButton(page).click();
  await expect(page.getByRole('radio', { name: /부드러운/ })).toBeVisible();

  const overflow = await measureOverflow(page);
  expect(overflow.hasHorizontalScroll, overflow.overflowing.join(', ')).toBe(false);

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.nodes.length}곳): ${v.help}`).join('\n'),
  ).toEqual([]);
});

test('결과 화면에도 진입점이 있다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'sm-360', '3아웃까지 가야 해서 한 뷰포트만 돈다.');
  await openGame(page);

  // 첫 보기를 계속 눌러 아웃을 쌓는다. 최대 20타석.
  for (let i = 0; i < 20; i += 1) {
    if ((await waitForPlayable(page)) === 'result') break;
    await page.getByRole('group', { name: '보기' }).getByRole('button').first().click();
    await page.waitForTimeout(2200);
  }
  await expect(page).toHaveURL(/\/result/, { timeout: 20000 });

  await styleButton(page).click();
  await page.getByRole('radio', { name: /부드러운/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'soft');
});
