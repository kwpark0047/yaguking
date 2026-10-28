import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import questions from '../../src/content/questions.generated.json' with { type: 'json' };
import { accounts, answerQuestion as answer, clearEmulators, hasFirestore, listDocs, newGuestUid } from './helpers';

/**
 * 찬스 이벤트 1차(docs/fun-plan.md) — 연속 정답 2개 뒤 타이밍 배팅, 못해도 손해 없음, 건너뛰기, 저장.
 * 규칙 문항은 경기의 절반 이하 — 첫 문제는 규칙이 아닌 문항.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await clearEmulators();
});

const categoryByStem = new Map((questions as { stem: string; category: string }[]).map((q) => [q.stem, q.category]));
const stemOf = async (page: import('@playwright/test').Page) => ((await page.locator('#question-stem').textContent()) ?? '').trim();

test('연속 정답 2개 → 타이밍 배팅: 못 쳐도 아웃은 그대로, 경기 계속, 경기 기록에 결과 저장', async ({ page }) => {
  test.setTimeout(90_000);
  const before = await accounts();
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  expect(categoryByStem.get(await stemOf(page))).not.toBe('rules'); // 첫 문제는 규칙이 아닌 것

  await answer(page, true);
  await page.getByRole('button', { name: '다음 타석' }).click();
  await expect(page.locator('#question-stem')).toBeVisible();
  await answer(page, true);
  await page.getByRole('button', { name: '다음 타석' }).click();

  await expect(page.getByRole('heading', { name: '타이밍 배팅' })).toBeVisible();
  await expect(page.getByText('찬스! 보너스 타격 · 못해도 손해 없어요')).toBeVisible();
  const outs = await page.locator('p[aria-live="polite"].sr-only').textContent();
  await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze().then((results) =>
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]),
  );
  await page.getByRole('button', { name: '투구 시작' }).click();
  // 누르지 않으면 공이 지나가 "못 쳤어요" — 아웃은 늘지 않는다
  await expect(page.getByRole('status').filter({ hasText: '못 쳤어요' })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 5_000 });
  expect(await page.locator('p[aria-live="polite"].sr-only').textContent()).toBe(outs);

  // 끝까지 — 틀려서 3아웃(중간에 찬스가 또 뜨면 건너뛴다)
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('heading', { name: /경기 종료/ }).isVisible()) break;
    const skip = page.getByRole('button', { name: '건너뛰기' });
    if (await skip.isVisible()) {
      await skip.click();
      continue;
    }
    if (await page.locator('#question-stem').isVisible()) {
      await answer(page, false);
      await page.getByRole('button', { name: /다음 타석|결과 보기/ }).click();
    } else await page.waitForTimeout(200);
  }
  await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 15_000 });
  const uid = (await newGuestUid(before))!;
  const [game] = await listDocs(`users/${uid}/games`);
  const events = JSON.stringify(game?.fields.events);
  expect(events).toContain('timing');
  expect(events).toContain('miss');
});

test('건너뛰기는 바로 다음 문제로', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 2; i++) {
    await answer(page, true);
    await page.getByRole('button', { name: '다음 타석' }).click();
    if (i === 0) await expect(page.locator('#question-stem')).toBeVisible();
  }
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.locator('#question-stem')).toBeVisible();
});
