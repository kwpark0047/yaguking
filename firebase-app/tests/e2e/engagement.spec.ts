import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runMonthly } from '../../ops/monthly.mjs';
import { kstDayOfMonth, kstMonthKey } from '@/lib/game/attendance';
import {
  accounts,
  answerQuestion as answer,
  becomeGuest,
  clearEmulators,
  finishOnboarding,
  hasFirestore,
  newGuestUid,
  PROJECT,
  readDoc,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * 매일 출석·월간 등수 1차(docs/engagement-plan.md). E2E 앱은 시작일을 앞당겨 연다(playwright.config.ts VITE_ENGAGEMENT_START).
 * 등수는 운영자 PC 작업(ops/monthly.mjs)을 에뮬레이터에 직접 돌려 만든다 — "내일 새벽 03:30"으로 돌려 오늘 도장을 센다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-engagement'));
const tomorrowDawn = () => {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1, 3, 30) - 9 * 3_600_000;
};
/** 운영자 PC 작업 — 오늘 도장이 "어제까지"에 들어가게. 달이 바뀌는 날이면 지난달 확정이 된다 */
const nightly = () => runMonthly({ db, now: tomorrowDawn(), start: '2026-01-01' });

test.beforeAll(async () => {
  await clearEmulators();
});

test('회원: 홈에서 출석 도장 → 달력·연속, 다시 찍을 수 없음 → 다음 날 새벽 등수에 내 닉네임, 숨기면 익명', async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  const nickname = await finishOnboarding(page);
  const today = kstDayOfMonth();

  const card = page.getByRole('region', { name: '오늘 출석' });
  await card.getByRole('button', { name: /출석 도장 찍기/ }).click();
  await expect(card.getByRole('status')).toContainText('출석!');
  await expect(card.getByRole('status')).toContainText('오늘 도장 완료');
  await expect(card.getByRole('listitem', { name: `${today}일 출석` })).toBeVisible();
  await expect(card).toContainText('연속 1일 · 이번 달 1일');

  await page.reload();
  await expect(card.getByRole('status')).toContainText('오늘은 이미 찍었어요');
  await expect(card.getByRole('button', { name: /출석 도장 찍기/ })).toHaveCount(0);

  // 다음 날 새벽 — 운영자 PC가 등수를 만든다
  expect((await nightly()).participants).toBe(1);
  // 앱은 등수 문서를 10분 기억한다(하루 한 번 바뀜) — 새로 불러와 본다
  await expect(page.getByRole('link', { name: '월간 등수 보기' })).toHaveAttribute('href', '/ranking');
  await page.goto('/ranking');
  await expect(page.getByRole('heading', { name: '월간 등수', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('내 순위 1위 / 1명');
  const standings = page.getByRole('list', { name: /상위 1명/ });
  await expect(standings.getByRole('listitem')).toHaveCount(1);
  await expect(standings).toContainText(nickname);
  await expect(standings).toContainText('LG');
  await expect(page.getByRole('region', { name: '내 이번 달' })).toContainText('출석 1일 · 출석 포인트 10점');
  await expect(page.getByLabel('이번 달 연습 목표')).toContainText('500점');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);

  // 설정에서 숨기기 → 다음 새벽부터 익명
  await page.goto('/settings');
  await page.getByLabel('등수에 내 닉네임 숨기기').check();
  await expect(page.getByRole('status')).toContainText('숨겼어요');
  await nightly();
  await page.goto('/ranking');
  await expect(page.getByRole('list', { name: /상위 1명/ })).toContainText('익명 선수');
  await expect(page.getByRole('list', { name: /상위 1명/ })).not.toContainText(nickname);
});

test('경기를 하면 이번 달 연습 점수가 쌓인다(비공식 — 등수에는 안 들어감)', async ({ page }) => {
  test.setTimeout(90_000);
  const before = await accounts();
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  // 틀려서 3아웃(찬스 이벤트가 뜨면 건너뛴다)
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
  await expect
    .poll(async () => (await readDoc(`users/${uid}/monthly/${kstMonthKey()}`))?.games)
    .toEqual({ integerValue: '1' });
});

test('비회원 홈: 출석은 가입 안내만(Firestore 읽기 없음)', async ({ page }) => {
  await becomeGuest(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: '매일 출석 · 월간 등수' });
  await expect(card.getByRole('link', { name: '가입하고 출석 도장 받기' })).toBeVisible();
  await expect(page.getByRole('button', { name: /출석 도장 찍기/ })).toHaveCount(0);
});

test('3차: 관리자가 정한 출석 2배 날·구단 대항전(팬 3명 이상)이 홈 카드와 등수에, 첫 타석은 최신 경기 문항', async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page); // 최애 구단 LG
  const today = kstDayOfMonth();
  const date = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  await db.doc('adminConfig/events').set({ doubleDays: [date] }, { merge: true });
  for (const uid of ['fan1', 'fan2', 'fan3']) {
    await db.doc(`users/${uid}`).set({ nickname: `엘지팬${uid}`, favoriteTeams: ['lg'], ageConfirmedAt: new Date() });
    await db.doc(`users/${uid}/attendance/${kstMonthKey()}`).set({ days: [today], updatedAt: new Date() });
  }
  await nightly();

  await page.goto('/');
  const card = page.getByRole('region', { name: /오늘 출석/ });
  await expect(card.getByRole('heading', { name: /오늘은 출석 2배!/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /출석 도장 찍기 \+20점/ })).toBeVisible();
  await expect(card.getByRole('listitem', { name: `${today}일, 출석 2배` })).toBeVisible();
  await expect(card).toContainText('구단 대항전: 1위 LG · 우리 LG 1위');

  await page.goto('/ranking');
  const teams = page.getByRole('list', { name: '구단 대항전 순위' });
  await expect(teams.getByRole('listitem')).toHaveCount(1);
  await expect(teams).toContainText('LG');
  await expect(teams).toContainText(/팬 [3-9]명/); // 앞 테스트의 회원(LG)도 이번 달 출석했다
  await expect(page.getByText(/이번 달 출석 2배 날:/)).toBeVisible();

  // 최신 경기 특집(기준일 2026-10-28 문항, 21일 동안) — 첫 타석
  if (date <= '2026-11-18') {
    await page.goto('/play');
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('최신 경기', { exact: true })).toBeVisible();
  }
});
