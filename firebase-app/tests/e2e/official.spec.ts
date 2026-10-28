import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runMonthly } from '../../ops/monthly.mjs';
import { OFFICIAL_TOTAL, roundIdOf, roundOpensAt, runOfficial } from '../../ops/official.mjs';
import { accounts, clearEmulators, finishOnboarding, hasFirestore, PROJECT, signUp, uniqueEmail } from './helpers';

/**
 * 오늘의 공식전(docs/engagement-plan.md §5). 출제·채점은 운영자 PC 작업(ops/official.mjs)을 에뮬레이터에 직접 돌린다:
 * 어제·오늘 공식전을 만들고, 어제 것은 미리 깔아 둔 답으로 채점해 "어제 결과"를 본다. 오늘 것은 화면에서 푼다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-official'));
const DAY = 86_400_000;
const START = '2026-01-01';
const header =
  'category_slug,difficulty,record_as_of,era_year,season_scope,stem,explanation,option_a,option_b,option_c,option_d,correct_label,source_name,source_url,verified_at,rights_note';
const pool = [
  header,
  ...Array.from({ length: 20 }, (_, i) => `rules,easy,2026-11-01,,,E2E 공식전 문항 ${i}번은 무엇?,E2E 해설 ${i},가${i},나${i},다${i},라${i},A,운영자 작성,,2026-11-01,직접 씀`),
].join('\n');
const tomorrowDawn = () => {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1, 3, 30) - 9 * 3_600_000;
};

test.beforeAll(async () => {
  await clearEmulators();
  await runOfficial({ db, poolText: pool, now: Date.now() - DAY, start: START }); // 어제·오늘 공식전
});

test('회원: 어제 결과와 해설, 오늘 공식전 5문제(하나씩), 다시 풀 수 없음 → 새벽 채점 뒤 등수에 공식 점수', async ({ page }) => {
  test.setTimeout(120_000);
  const before = await accounts();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  const nickname = await finishOnboarding(page);
  const uid = (await accounts()).find((user) => !before.some((known) => known.localId === user.localId))!.localId;

  // 어제 공식전 — 다 맞힌 답을 깔고 채점
  const yesterday = roundIdOf(Date.now() - DAY);
  const key = (await db.doc(`officialKeys/${yesterday}`).get()).get('answers') as string[];
  const opens = roundOpensAt(yesterday) + 3_600_000;
  await db.doc(`officialRounds/${yesterday}/attempts/${uid}`).set({
    startedAt: Timestamp.fromMillis(opens),
    total: OFFICIAL_TOTAL,
    answers: Object.fromEntries(key.map((label, index) => [String(index), { choice: label, at: Timestamp.fromMillis(opens + (index + 1) * 2_000) }])),
  });
  expect((await runOfficial({ db, now: Date.now(), start: START })).graded).toContain(yesterday);

  await page.getByRole('link', { name: '오늘의 공식전 (5문제)' }).click();
  const past = page.getByRole('region', { name: '어제 공식전' });
  await expect(past).toContainText(`${OFFICIAL_TOTAL} / ${OFFICIAL_TOTAL}문제 정답`);
  await past.getByRole('button', { name: '어제 문제와 해설 보기' }).click();
  await expect(past.getByRole('list', { name: '어제 문제와 해설' }).getByRole('listitem')).toHaveCount(OFFICIAL_TOTAL);
  await expect(past).toContainText('E2E 해설');

  // 오늘 공식전 — 하나씩
  await page.getByRole('button', { name: '공식전 시작' }).click();
  for (let index = 0; index < OFFICIAL_TOTAL; index += 1) {
    await expect(page.getByText(`${index + 1} / ${OFFICIAL_TOTAL}`)).toBeVisible();
    await expect(page.locator('#question-stem')).toContainText('E2E 공식전 문항');
    if (index === 0) {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
    }
    await page.getByRole('group', { name: '보기' }).getByRole('button').first().click();
  }
  await expect(page.getByRole('status')).toContainText('오늘 공식전 제출 완료');
  await expect(page.getByRole('status')).toContainText(`${OFFICIAL_TOTAL} / ${OFFICIAL_TOTAL}문제에 답했어요`);

  await page.reload();
  await expect(page.getByRole('status')).toContainText('오늘 공식전 제출 완료');
  await expect(page.getByRole('button', { name: '공식전 시작' })).toHaveCount(0);

  // 새벽: 채점 → 월간 등수
  await runOfficial({ db, now: tomorrowDawn(), start: START });
  await runMonthly({ db, now: tomorrowDawn(), start: START });
  await page.goto('/ranking');
  const standings = page.getByRole('list', { name: /상위 1명/ });
  await expect(standings).toContainText(nickname);
  await expect(standings).toContainText(/공식전 [12]회/);
  await expect(page.getByRole('region', { name: '내 이번 달' })).toContainText('오늘의 공식전');
});
