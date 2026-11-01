import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accounts, answerQuestion as answer, hasFirestore, listDocs, newGuestUid, patchDoc } from './helpers';

/**
 * 다시 오게 만들기 1차(docs/retention-plan.md) — 오늘의 1이닝·결과 공유, 매일 알림(달력), 오늘 복습 안내.
 */
test.describe.configure({ mode: 'serial' });

test('오늘의 1이닝: 로그인 없이 3문제 → 이모지 한 줄 공유, 계정·서버 기록이 생기지 않고, 같은 날 다시 풀 수 없다', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await accounts();
  // 공유 창 대신 보낼 글을 잡아 둔다
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: (data: ShareData) => ((window as unknown as { __shared: string }).__shared = data.text ?? ''), configurable: true });
  });
  await page.goto('/');
  await page.getByRole('link', { name: /오늘의 1이닝/ }).click();
  await expect(page.getByText('첫 문제는 20초')).toBeVisible({ timeout: 15_000 });
  for (const [index, correct] of [true, false, true].entries()) {
    await expect(page.locator('#question-stem')).toBeVisible();
    await answer(page, correct);
    await page.getByRole('button', { name: index < 2 ? '다음 문제' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: '오늘의 1이닝 끝!' })).toBeVisible();
  const line = page.getByLabel('공유할 글');
  await expect(line).toContainText(/⚾ 야구왕 오늘의 1이닝 \d+\/\d+/);
  await expect(line).toContainText(/🟩🟥🟩|🟨🟥🟩|🟩🟥🟨|🟨🟥🟨/);
  await page.getByRole('button', { name: '결과 공유하기' }).click();
  expect(await page.evaluate(() => (window as unknown as { __shared: string }).__shared)).toContain('/daily');
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);

  // 같은 날 다시 열면 결과만, 홈 단추에 오늘 결과
  await page.reload();
  await expect(page.getByRole('heading', { name: '오늘의 1이닝 끝!' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#question-stem')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /오늘의 1이닝/ })).toContainText('오늘 끝!');
  expect(await accounts()).toEqual(before); // 비회원 계정도 만들지 않는다
});

test('중간에 닫아도 이어서 — 이미 답한 문제는 다시 나오지 않는다', async ({ page }) => {
  await page.goto('/daily');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  const first = await page.locator('#question-stem').textContent();
  await answer(page, true);
  await page.reload();
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('2 / 3번째 공')).toBeVisible();
  expect(await page.locator('#question-stem').textContent()).not.toBe(first);
});

test('매일 알림: 아침 11시·저녁 8시 반복 일정 파일을 기기에서 만든다, 구글 캘린더 단추는 시각마다', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: '매일 알림 받기' });
  await expect(card.getByRole('link', { name: /구글 캘린더에 넣기/ })).toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: /달력에 넣기/ }).click()]);
  expect(download.suggestedFilename()).toBe('yaguking-alarm.ics');
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  expect(text).toContain('SUMMARY:매일 아침 11시 야구왕');
  expect(text).toContain('SUMMARY:매일 저녁 8시 야구왕');
  expect(text.match(/RRULE:FREQ=DAILY/g)).toHaveLength(2);
  await expect(card.getByRole('status')).toContainText('yaguking-alarm.ics');

  await card.getByLabel('매일 아침 11시 야구왕').uncheck();
  await expect(card.getByRole('link', { name: /구글 캘린더에 넣기/ })).toHaveCount(1);
  await card.getByLabel('매일 저녁 8시 야구왕').uncheck();
  await expect(card.getByRole('button', { name: /달력에 넣기/ })).toBeDisabled();
});

test('오늘 복습 안내: 복습 시각이 지난 문제가 있으면 홈에 "오늘 복습할 문제 N개"', async ({ page }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(60_000);
  const before = await accounts();
  await page.goto('/play');
  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answer(page, false);
    await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await expect(page.getByText(/틀린 3문항을 오답노트에 담았어요/)).toBeVisible({ timeout: 15_000 }); // 저장이 끝난 뒤
  const uid = (await newGuestUid(before))!;
  await page.goto('/');
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /오늘 복습할 문제/ })).toHaveCount(0); // 내일부터

  const notes = await listDocs(`users/${uid}/wrongNotes`);
  for (const note of notes.slice(0, 2))
    await patchDoc(`users/${uid}/wrongNotes/${note.id}`, { nextReviewAt: { timestampValue: new Date(Date.now() - 60_000).toISOString() } });
  await page.reload();
  await page.getByRole('link', { name: '오늘 복습할 문제 2개' }).click();
  await expect(page).toHaveURL(/\/notes$/);
});
