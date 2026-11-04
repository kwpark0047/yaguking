import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runOfficial } from '../../ops/official.mjs';
import { accounts, answerQuestion as answer, clearEmulators, finishOnboarding, hasFirestore, PROJECT, signUp, uniqueEmail } from './helpers';

/**
 * 문제 풀이 힌트(docs/hint-plan.md) — 출석 포인트(지갑)로 쓰기. 지갑은 운영자 PC가 만들므로 관리 SDK로 깔아 둔다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-hints'));
const header =
  'category_slug,difficulty,record_as_of,era_year,season_scope,stem,explanation,option_a,option_b,option_c,option_d,correct_label,source_name,source_url,verified_at,rights_note';
const pool = [
  header,
  ...Array.from({ length: 20 }, (_, i) => `rules,easy,2026-11-01,,,E2E 힌트 공식전 문항 ${i}번은 무엇?,E2E 해설 ${i},가${i},나${i},다${i},라${i},A,운영자 작성,,2026-11-01,직접 씀`),
].join('\n');

const hintButton = (page: Page) => page.getByRole('button', { name: '힌트', exact: true });
const spent = async (uid: string) => (await db.doc(`users/${uid}/wallet/main`).get()).get('spent') as number;
const secondsLeft = async (page: Page) => Number((await page.locator('.g-timer .g-num').textContent())?.replace('초', ''));

async function newMember(page: Page, earned: number, spentBefore = 0): Promise<string> {
  const before = await accounts();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page);
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible({ timeout: 15_000 });
  const uid = (await accounts()).find((user) => !before.some((known) => known.localId === user.localId))!.localId;
  await db.doc(`users/${uid}/wallet/main`).set({ earned, spent: spentBefore, earnedThrough: '2026-11-10', updatedAt: new Date() });
  return uid;
}

test.beforeAll(async () => {
  await clearEmulators();
});

test('회원: 반반은 보기 둘을 지우고 맞혀도 2루타까지, 초성은 정답 초성, 한 경기 둘까지 — 포인트는 서버에서 줄고 등수와 무관', async ({ page }) => {
  test.setTimeout(120_000);
  const uid = await newMember(page, 100);
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });

  // 힌트 창 — 값과 포인트, 안내. 시간은 계속 흐른다
  await hintButton(page).click();
  const panel = page.getByRole('group', { name: '힌트 고르기' });
  await expect(panel).toContainText('쓸 수 있는 포인트 100P');
  await expect(panel).toContainText('반반·초성을 쓰면 맞혀도 2루타까지');
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);

  // 반반 30P
  await panel.getByRole('button', { name: /반반/ }).click();
  await expect(page.getByText('틀린 보기 둘을 지웠어요')).toBeVisible();
  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  await expect(options.and(page.locator(':disabled'))).toHaveCount(2);
  expect(await spent(uid)).toBe(30);
  await expect(hintButton(page)).toHaveCount(0); // 한 문제에 하나

  // 지운 보기는 키보드로도 못 고른다
  const gone = (await options.and(page.locator(':disabled')).first().locator('.g-label').textContent())?.trim();
  await page.keyboard.press(gone!.toLowerCase() === 'a' ? 'a' : gone!.toLowerCase() === 'b' ? 's' : gone!.toLowerCase() === 'c' ? 'd' : 'f');
  await expect(page.locator('#question-stem')).toBeVisible();

  await answer(page, true);
  const verdict = page.getByRole('status').first();
  await expect(verdict).toContainText(/2루타|안타|볼넷/);
  await expect(verdict).not.toContainText(/홈런|3루타/);
  await expect(page.getByText(/반반 힌트 — 맞혀도 2루타까지/)).toBeVisible();
  await page.getByRole('button', { name: '다음 타석' }).click();

  // 초성 20P — 문제마다 지갑을 다시 읽지 않는다
  await expect(page.locator('#question-stem')).toBeVisible();
  await hintButton(page).click();
  await expect(panel).toContainText('쓸 수 있는 포인트 70P');
  await panel.getByRole('button', { name: /초성/ }).click();
  await expect(page.getByText(/정답의 초성:/)).toBeVisible();
  expect(await spent(uid)).toBe(50);
  await answer(page, false);
  await page.getByRole('button', { name: '다음 타석' }).click();

  // 한 경기 둘까지
  await expect(page.locator('#question-stem')).toBeVisible();
  await expect(page.getByRole('button', { name: /이 경기 힌트를 다 썼어요/ })).toBeDisabled();
});

test('오늘의 1이닝: 시간 +5초로 제한 시간이 늘고, 공유 줄에 힌트 수를 적는다 / 포인트가 모자라면 못 쓴다', async ({ page }) => {
  test.setTimeout(120_000);
  const uid = await newMember(page, 20);
  await page.goto('/daily');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  const before = await secondsLeft(page);
  const startedAt = Date.now();
  await hintButton(page).click();
  const panel = page.getByRole('group', { name: '힌트 고르기' });
  await expect(panel).toContainText('쓸 수 있는 포인트 20P');
  await expect(panel.getByRole('button', { name: /반반/ })).toBeDisabled(); // 30P — 모자람
  await panel.getByRole('button', { name: /시간/ }).click();
  await expect(page.getByText('시간을 5초 더 받았어요')).toBeVisible();
  // 흐른 시간을 빼고도 5초 가까이 더 남아 있다
  await expect.poll(async () => (await secondsLeft(page)) - (before - (Date.now() - startedAt) / 1000)).toBeGreaterThan(4);
  expect(await spent(uid)).toBe(20);
  await answer(page, true);
  await page.getByRole('button', { name: '다음 문제' }).click();

  // 이제 0P — 모두 흐리고 안내
  await expect(page.locator('#question-stem')).toBeVisible();
  await hintButton(page).click();
  await expect(panel).toContainText('출석하면 하루 10P');
  for (const name of [/반반/, /초성/, /시간/]) await expect(panel.getByRole('button', { name })).toBeDisabled();
  await answer(page, true);
  await page.getByRole('button', { name: '다음 문제' }).click();
  await expect(page.locator('#question-stem')).toBeVisible();
  await answer(page, false);
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByLabel('공유할 글')).toContainText('· 힌트 1');
});

test('로그인 안 한 사람·비회원: 힌트를 누르면 가입 안내, 지갑을 읽지 않는다(계정도 안 생긴다)', async ({ page }) => {
  const before = await accounts();
  await page.goto('/daily');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await hintButton(page).click();
  await expect(page.getByRole('link', { name: '가입하고 출석하기' })).toHaveAttribute('href', /mode=signup/);
  await expect(page.getByRole('group', { name: '힌트 고르기' })).toHaveCount(0);
  expect(await accounts()).toEqual(before);
});

test('공식전·레벨 테스트에는 힌트가 없다', async ({ page }) => {
  test.setTimeout(90_000);
  await runOfficial({ db, poolText: pool, now: Date.now(), start: '2026-01-01', bank: new Set() });
  await newMember(page, 100);

  await page.goto('/official');
  await page.getByRole('button', { name: '공식전 시작' }).click();
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(hintButton(page)).toHaveCount(0);

  await page.goto('/level-test');
  await page.getByRole('button', { name: /시작/ }).first().click();
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(hintButton(page)).toHaveCount(0);
});
