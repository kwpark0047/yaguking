import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accounts, answerQuestion as answer, becomeGuest } from './helpers';

/** 가입 유도 1차(docs/signup-boost.md) — 회원 전용 미리보기, 잘한 순간 권유, 결과 카드 이미지 */
test.describe.configure({ mode: 'serial' });

test('로그인 전·비회원 홈에 "회원이 되면 열려요" — 가입 화면으로 간다, 로그인 전에는 계정을 만들지 않는다', async ({ page }) => {
  const before = await accounts();
  await page.goto('/');
  const perks = page.getByRole('region', { name: '회원이 되면' });
  await expect(perks).toBeVisible({ timeout: 15_000 });
  await expect(perks.getByText('오늘의 공식전')).toBeVisible();
  await expect(perks.getByText('문제 풀이 힌트')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  expect(await accounts()).toEqual(before);
  await perks.getByRole('link', { name: /지금 가입/ }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);

  await becomeGuest(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: '회원이 되면' })).toBeVisible({ timeout: 15_000 });
});

test('오늘의 1이닝: 잘 치면 가입 권유와 결과 카드(이미지 내려받기)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/daily');
  for (const [index] of [0, 1, 2].entries()) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answer(page, true);
    await page.getByRole('button', { name: index < 2 ? '다음 문제' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: '오늘의 1이닝 끝!' })).toBeVisible();
  const nudge = page.getByRole('region', { name: '가입 권유' });
  await expect(nudge).toBeVisible();
  await expect(nudge.getByRole('link', { name: '가입하고 기록 남기기' })).toHaveAttribute('href', '/auth?mode=signup');

  // 공유 창이 파일을 못 받는 브라우저면 내려받는다(테스트는 공유 창을 끈다)
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '결과 카드 공유' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^yaguking-daily-\d{4}-\d{2}-\d{2}\.png$/);
  const bytes = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks));
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');

  await nudge.getByRole('button', { name: '나중에' }).click();
  await expect(page.getByRole('region', { name: '가입 권유' })).toHaveCount(0);
});

test('개인 경기: 비회원이 잘 치면 결과 화면에서 가입을 권한다', async ({ page }) => {
  test.setTimeout(90_000);
  await becomeGuest(page);
  await page.goto('/play');
  // 맞히고 맞히다 일부러 틀려 3아웃까지(찬스 이벤트는 건너뛴다)
  let outs = 0;
  let hits = 0;
  for (let turn = 0; turn < 12 && outs < 3; turn += 1) {
    const skip = page.getByRole('button', { name: /건너뛰기/ });
    await Promise.race([page.locator('#question-stem').waitFor({ timeout: 20_000 }), skip.waitFor({ timeout: 20_000 }).then(() => skip.click())]);
    await page.locator('#question-stem').waitFor({ timeout: 20_000 });
    const correct = hits < 2;
    await answer(page, correct);
    if (correct) hits += 1;
    else outs += 1;
    const finish = page.getByRole('button', { name: '결과 보기' });
    const next = page.getByRole('button', { name: '다음 타석' });
    await expect(finish.or(next)).toBeVisible();
    if (await finish.count()) {
      await finish.click();
      break;
    }
    await next.click();
  }
  await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: '가입 권유' })).toBeVisible();
  await expect(page.getByRole('button', { name: '결과 카드 공유' })).toBeVisible();
});
