import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { WCAG_TAGS, hasDatabase, measureOverflow, waitForPlayable } from './helpers/env';

/**
 * 내 선수 카드 — 공유 화면 (14 문서 §5.1, 1단계).
 *
 * 진짜 기록이 있어야 카드가 나온다. 비회원으로 1이닝을 끝까지 하고 그 세션의
 * 공유 주소를 연다. 비회원 카드는 Lv.1(무지 종이)·브랜드 테마다. 다른 등급의
 * 마크업은 단위 테스트(tests/unit/share/playerCard.test.ts)가 본다.
 */
test.skip(!hasDatabase(), 'DATABASE_URL 없음 — 로컬 Supabase 스택이 필요합니다.');

test.beforeEach(async ({}, testInfo) => {
  // 한 이닝을 끝까지 하므로 오래 걸린다. 뷰포트별 확인은 테스트 안에서 바꿔 가며 한다.
  test.skip(testInfo.project.name !== 'sm-360', '카드는 sm에서 한 번 만들어 확인합니다.');
});

let sharePath = '';

async function finishedSharePath(page: Page): Promise<string> {
  if (sharePath) return sharePath;

  await page.goto('/');
  for (let i = 0; i < 20; i += 1) {
    if ((await waitForPlayable(page)) === 'result') break;
    await page.getByRole('group', { name: '보기' }).getByRole('button').first().click();
    await page.waitForTimeout(2200);
  }
  await expect(page).toHaveURL(/\/play\/[^/]+\/result/, { timeout: 20000 });

  const sessionId = new URL(page.url()).pathname.split('/')[2];
  sharePath = `/share/${sessionId}`;
  return sharePath;
}

test.describe.configure({ mode: 'serial' });

test('공유 화면에 선수 카드가 나온다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(await finishedSharePath(page));

  const card = page.getByRole('article', { name: '비회원' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { level: 1, name: '비회원' })).toBeVisible();
  await expect(card.getByText('Lv.1')).toBeVisible();
  for (const label of ['득점', '타석', '타율', 'OPS']) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
  }

  // 5:7 비율
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height / box!.width).toBeCloseTo(7 / 5, 1);

  // 그림 자산 없이 — 이미지 요소가 없다
  await expect(card.locator('img, svg')).toHaveCount(0);
});

test('공유 화면: axe critical/serious 위반 0', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(await finishedSharePath(page));

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  const summary = blocking
    .map((violation) => `${violation.id} (${violation.nodes.length}곳): ${violation.help}`)
    .join('\n');
  expect(blocking, summary).toEqual([]);
});

test('공유 화면: 어느 폭에서도 가로 스크롤이 없다', async ({ page }) => {
  test.setTimeout(90_000);
  const path = await finishedSharePath(page);

  for (const width of [320, 360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(path);
    const result = await measureOverflow(page);
    expect(result.hasHorizontalScroll, `${width}px: ${result.overflowing.join(', ')}`).toBe(false);
  }
});

test('고대비 스타일에서는 소재 질감을 빼고 단색으로 그린다', async ({ page, context }) => {
  test.setTimeout(90_000);
  const path = await finishedSharePath(page);

  // 쿠키 주소를 알려면 먼저 한 번 연다(앞 테스트에서 경로를 받아 왔다면 아직 빈 페이지다).
  await page.goto(path);
  await context.addCookies([{ name: 'yk_style', value: 'contrast', url: page.url() }]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'contrast');

  const material = page.locator('.player-card__material');
  const style = await material.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { image: computed.backgroundImage, animation: computed.animationName };
  });
  expect(style.image).toBe('none');
  expect(style.animation).toBe('none');
});
