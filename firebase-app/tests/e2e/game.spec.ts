import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import questions from '../../src/content/questions.generated.json' with { type: 'json' };
import {
  answerQuestion as answer,
  accounts,
  becomeGuest,
  clearEmulators,
  finishOnboarding,
  hasFirestore,
  listDocs,
  newGuestUid,
  patchDoc,
  readDoc,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * 4단계 — 개인 퀴즈(1이닝), 비회원 하루 3판, 오답노트 복습, 레벨 테스트.
 * 문제은행을 테스트도 읽어 화면의 문제를 일부러 맞히거나 틀린다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await clearEmulators();
});

/** 틀리기만 해서 3아웃으로 한 판을 끝낸다 */
async function strikeOutInning(page: Page) {
  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answer(page, false);
    await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 15_000 });
}

test('비회원: 게임 시작만 누르면 바로 첫 문제, 3아웃이면 끝나고 기록·오답노트가 남는다', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await accounts();
  await page.goto('/');
  await page.getByRole('link', { name: /게임 시작/ }).click();
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/비공식 1이닝 · 오늘 3판 남음/)).toBeVisible();

  await strikeOutInning(page);
  await expect(page.getByText(/틀린 3문항을 오답노트에 담았어요/)).toBeVisible();

  const uid = await newGuestUid(before);
  expect(await listDocs(`users/${uid}/games`)).toHaveLength(1);
  expect(await readDoc(`users/${uid}/summary/main`)).toHaveProperty('games.integerValue', '1');
  expect(await listDocs(`users/${uid}/wrongNotes`)).toHaveLength(3);
  expect((await listDocs(`users/${uid}/daily`))[0]?.fields).toHaveProperty('count.integerValue', '1');
});

test('비회원은 하루 3판 — 4번째는 가입 안내', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/play');
  await strikeOutInning(page);
  await page.getByRole('button', { name: '한 판 더' }).click();
  await strikeOutInning(page);
  await page.getByRole('button', { name: '한 판 더' }).click();
  await strikeOutInning(page);
  await expect(page.getByRole('button', { name: '한 판 더' })).toHaveCount(0);

  await page.goto('/play');
  await expect(page.getByRole('heading', { name: '오늘 비회원 경기를 다 했어요' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('비회원은 하루 3판까지예요.', { exact: false })).toBeVisible();
});

test('빨리 맞히면 안타 이상, 판정·정답·출처를 보여 준다', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await answer(page, true);
  const verdict = page.getByRole('status').first();
  await expect(verdict).toContainText(/홈런|2루타|3루타|안타|볼넷/);
  await expect(page.getByText(/^정답: [A-D]\./)).toBeVisible();
  await expect(page.getByText(/^출처:/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 타석' })).toBeFocused();
});

test('오답노트: 내일 복습할 문제가 쌓이고, 복습 시각이 지나면 다시 풀어 단계가 오른다', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await accounts();
  await page.goto('/play');
  await strikeOutInning(page);
  const uid = (await newGuestUid(before))!;

  await page.getByRole('link', { name: '오답노트' }).click();
  await expect(page.getByRole('list', { name: '틀린 문제' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '오늘 복습할 문제가 없어요' })).toBeDisabled();

  // 하루가 지난 것처럼 복습 시각을 과거로
  const [note] = await listDocs(`users/${uid}/wrongNotes`);
  await patchDoc(`users/${uid}/wrongNotes/${note!.id}`, {
    nextReviewAt: { timestampValue: new Date(Date.now() - 60_000).toISOString() },
  });
  await page.reload();
  await page.getByRole('button', { name: '복습 시작 (1문제)' }).click();
  await answer(page, true);
  await expect(page.getByText('정답! 다음 복습은 더 뒤에 나와요')).toBeVisible();

  await expect
    .poll(async () => (await readDoc(`users/${uid}/wrongNotes/${note!.id}`)) as Record<string, unknown>)
    .toHaveProperty('stage.integerValue', '1');
});

test('회원: 레벨 테스트 20문제 → 등급 카드, 한 번만', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail();
  await signUp(page, email);
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page);

  await page.getByRole('link', { name: /레벨 테스트/ }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  for (let index = 0; index < 20; index += 1) {
    await expect(page.locator('#question-stem')).toBeVisible();
    await answer(page, index < 19); // 19개 맞히고 1개 틀린다
    await page.getByRole('button', { name: index < 19 ? '다음 문제' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Lv.5 골든글러브' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('20문제 중 19문제 정답')).toBeVisible();

  const uid = (await accounts()).find((user) => user.email === email)!.localId;
  const profile = await readDoc(`users/${uid}`);
  expect(profile).toHaveProperty('levelTest.mapValue.fields.tier.integerValue', '5');

  await page.goto('/');
  await expect(page.getByRole('link', { name: /레벨 테스트/ })).toHaveCount(0);
  await page.goto('/level-test');
  await expect(page.getByText('이미 끝냈어요', { exact: false })).toBeVisible();
});

test('오답노트는 30개씩 읽고 "더 보기"로 이어 읽는다(6단계 — 읽기 절약)', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await accounts();
  await becomeGuest(page);
  const uid = (await newGuestUid(before))!;
  const ids = (questions as { id: string }[]).slice(0, 35).map((question) => question.id);
  const future = Date.now() + 86_400_000;
  await Promise.all(
    ids.map((id, index) =>
      patchDoc(`users/${uid}/wrongNotes/${id}`, {
        questionId: { stringValue: id },
        wrongCount: { integerValue: '1' },
        lastWrongAt: { timestampValue: new Date().toISOString() },
        stage: { integerValue: '0' },
        nextReviewAt: { timestampValue: new Date(future + index * 60_000).toISOString() },
        mastered: { booleanValue: false },
      }),
    ),
  );

  await page.goto('/notes');
  const items = page.getByRole('list', { name: '틀린 문제' }).getByRole('listitem');
  await expect(items).toHaveCount(30);
  await page.getByRole('button', { name: '더 보기' }).click();
  await expect(items).toHaveCount(35);
  await expect(page.getByRole('button', { name: '더 보기' })).toHaveCount(0);
});

test('경기 화면·오답노트: axe critical/serious 위반 0', async ({ page }) => {
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  const check = async (where: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking.map((v) => `${where} ${v.id}: ${v.help}`)).toEqual([]);
  };
  await check('question');
  await answer(page, false);
  await check('verdict');
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: '오답노트' })).toBeVisible();
  await check('notes');
});
