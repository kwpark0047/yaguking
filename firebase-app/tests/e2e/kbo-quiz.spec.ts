import { expect, test, type Page } from '@playwright/test';
import { KBO_QUIZ_START, publishAtOf } from '@/lib/kbo/set';
import { accounts, clearEmulators, hasFirestore, passAgeCheckIfAsked, patchDoc, readDoc, signUp, uniqueEmail } from './helpers';

/**
 * 어제의 KBO 퀴즈 — 비회원이 풀고, 답 뒤에만 정답을 읽고, 가입으로 이어진다. 에뮬레이터에 지어낸 묶음을 깐다.
 * 앱 시계만 시작일로 옮긴다(공개 시각은 규칙이 서버 시각으로 보므로 묶음의 공개 시각은 과거로 둔다).
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터가 필요합니다');

const DAY = KBO_QUIZ_START;
const string = (stringValue: string) => ({ stringValue });
const options = (texts: string[]) => ({
  arrayValue: { values: texts.map((text, index) => ({ mapValue: { fields: { label: string('ABCD'[index]!), text: string(text) } } })) },
});
const question = (stem: string, texts: string[]) => ({
  mapValue: {
    fields: { stem: string(stem), options: options(texts), difficulty: string('easy'), category: string('team-history'), recordAsOf: string('2026-11-11'), seasonScope: string('2026 시즌') },
  },
});

async function seedSet(fields: Record<string, unknown> = {}) {
  await patchDoc(`kboSets/${DAY}`, {
    kind: string('review'),
    gamesDate: string(''),
    publishAt: { timestampValue: new Date(Date.now() - 3_600_000).toISOString() },
    state: string('approved'),
    isTest: { booleanValue: false },
    withdrawn: { arrayValue: { values: [] } },
    questions: { arrayValue: { values: [question('첫째 테스트 문제는?', ['가', '나', '다', '라']), question('둘째 테스트 문제는?', ['마', '바', '사', '아'])] } },
    updatedAt: { timestampValue: new Date().toISOString() },
    by: string('test'),
    ...fields,
  });
  for (const [index, correct] of ['A', 'B'].entries()) {
    await patchDoc(`kboSets/${DAY}/keys/${index}`, {
      correct: string(correct),
      explanation: string(`${index + 1}번 해설`),
      sourceName: string('테스트 출처'),
      sourceUrl: string('https://example.test/source'),
      recordAsOf: string('2026-11-11'),
    });
  }
}

const openDay = (page: Page) => page.clock.setFixedTime(new Date(publishAtOf(DAY) + 6 * 3_600_000));
const pick = (page: Page, text: string) => page.getByRole('group', { name: '보기' }).getByRole('button', { name: new RegExp(text) }).click();

test.beforeEach(async () => {
  await clearEmulators();
});

test('시작일 전에는 홈 카드가 없고 화면도 닫혀 있다', async ({ page }) => {
  await seedSet();
  await page.clock.setFixedTime(new Date(publishAtOf(DAY) - 2 * 86_400_000));
  await page.goto('/');
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /돌아보기/ })).toHaveCount(0);
  await page.goto('/yesterday');
  await expect(page.getByText('아직 열리지 않았어요')).toBeVisible();
});

test('비회원: 홈 카드 → 풀이 → 답 뒤 정답·해설 → 가입 유도', async ({ page }) => {
  await seedSet();
  await openDay(page);
  await page.goto('/');
  await page.getByRole('link', { name: /2026 시즌 돌아보기/ }).click();
  await expect(page.getByRole('button', { name: '시작' })).toBeVisible({ timeout: 15_000 });

  // 들어온 것만으로 정답이 기기에 오지 않는다
  const body = await page.content();
  expect(body).not.toContain('1번 해설');

  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.getByText('1 / 2')).toBeVisible();
  await pick(page, '가');
  await expect(page.getByRole('status').filter({ hasText: '정답!' })).toBeVisible();
  await expect(page.getByText('1번 해설')).toBeVisible();
  await expect(page.getByRole('link', { name: '테스트 출처' })).toHaveAttribute('href', 'https://example.test/source');
  await page.getByRole('button', { name: '다음 문제' }).click();

  await pick(page, '마');
  await expect(page.getByRole('status').filter({ hasText: '아쉬워요' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText('2문제 중 1개 맞혔어요!')).toBeVisible();

  // 새로고침해도 다시 풀지 않고 결과가 나온다
  await page.reload();
  await expect(page.getByText('2문제 중 1개 맞혔어요!')).toBeVisible({ timeout: 15_000 });

  // 가입: 같은 계정(uid)으로 이어지고, 답은 남고, 포인트로 바뀌지 않는다
  const [guest] = await accounts();
  await page.getByRole('link', { name: '가입하고 기록 쌓기' }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
  await expect.poll(async () => (await readDoc(`kboSets/${DAY}/attempts/${guest!.localId}`))?.signupClickedAt).toBeTruthy();
  await signUp(page, uniqueEmail());
  await passAgeCheckIfAsked(page);
  await expect.poll(async () => (await accounts()).find((user) => user.email)?.localId).toBe(guest!.localId);
  expect(await accounts()).toHaveLength(1);
  expect(await readDoc(`kboSets/${DAY}/attempts/${guest!.localId}`)).not.toBeNull();
  expect(await readDoc(`users/${guest!.localId}/wallet/main`)).toBeNull();
});

test('철회한 문제는 건너뛰고 결과에서 뺀다', async ({ page }) => {
  await seedSet({ withdrawn: { arrayValue: { values: [{ integerValue: '0' }] } } });
  await openDay(page);
  await page.goto('/yesterday');
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.getByText('2 / 2')).toBeVisible();
  await pick(page, '바');
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText('1문제 중 1개 맞혔어요!')).toBeVisible();
  await expect(page.getByText('첫째 테스트 문제는?')).toHaveCount(0);
});

test('경기 없는 날: 안내만 보이고 비회원 계정을 만들지 않는다', async ({ page }) => {
  await seedSet({ kind: string('no-game'), gamesDate: string('2026-11-19'), questions: { arrayValue: { values: [] } } });
  await openDay(page);
  await page.goto('/yesterday');
  await expect(page.getByRole('status').filter({ hasText: /경기가 없었어요/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '오늘의 1이닝' })).toBeVisible();
  await expect(page.getByRole('button', { name: '시작' })).toHaveCount(0);
  expect(await accounts()).toHaveLength(0);
});

test('묶음이 없는 날: 준비 중 안내', async ({ page }) => {
  await openDay(page);
  await page.goto('/yesterday');
  await expect(page.getByRole('status').filter({ hasText: '준비 중' })).toBeVisible({ timeout: 15_000 });
  expect(await readDoc(`kboSets/${DAY}`)).toBeNull();
});
