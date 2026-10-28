import { writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  answerQuestion,
  clearEmulators,
  finishOnboarding,
  hasFirestore,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * 6단계 — 무료 한도 사용량 측정. 실제 화면 흐름을 돌며 앱의 계량기(src/lib/firebase/meter.ts)로
 * 행동마다 Firestore 읽기·쓰기를 재고, **예산을 넘으면 실패**한다(되돌아가는 것을 막는다).
 *
 * `USAGE_REPORT=경로`를 주면 측정값을 JSON으로 남긴다(npm run usage:measure → docs/usage-measured.json).
 * 보안 규칙 안의 get() 읽기는 기기가 볼 수 없어 여기 숫자에 없다(docs/usage-report.md).
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

interface Usage {
  reads: number;
  writes: number;
}
const rows: { action: string; reads: number; writes: number }[] = [];

test.beforeAll(async () => {
  await clearEmulators();
});

test.afterAll(({}, testInfo) => {
  // 화면 크기마다 같은 값이라 한 번만 남긴다
  if (process.env.USAGE_REPORT && testInfo.project.name === 'sm-360' && rows.length > 0) {
    writeFileSync(process.env.USAGE_REPORT, `${JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2)}\n`);
  }
  console.log(rows.map((row) => `${row.action}: 읽기 ${row.reads}, 쓰기 ${row.writes}`).join('\n'));
});

const meter = (page: Page) =>
  page.evaluate(() => {
    const usage = window.__ykUsage;
    return { reads: usage?.reads ?? 0, writes: usage?.writes ?? 0 };
  });

/** 행동 하나의 사용량(전후 차이)을 재고 표에 남긴다 */
async function measure(page: Page, action: string, run: () => Promise<void>): Promise<Usage> {
  const before = await meter(page);
  await run();
  const after = await meter(page);
  const used = { reads: after.reads - before.reads, writes: after.writes - before.writes };
  rows.push({ action, ...used });
  return used;
}

/** 메인이 공지 묶음(public/home)을 다 읽을 때까지 — 계량기를 재기 전에(읽기가 측정 구간에 섞이지 않게) */
async function waitForPublicHome(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.__ykUsage?.byLabel.publicHome?.reads ?? 0), { timeout: 15_000 })
    .toBe(1);
}

async function strikeOut(page: Page) {
  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answerQuestion(page, false);
    await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/오답노트에 담았어요/)).toBeVisible({ timeout: 15_000 });
}

test('비회원: 1이닝 한 판 = 읽기 2(남은 판·누적 XP), 쓰기 7 · 오답노트 열기 = 노트 수', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await waitForPublicHome(page);
  const game = await measure(page, '비회원 개인 경기 1판(3문항 틀림)', async () => {
    await page.getByRole('link', { name: /게임 시작/ }).click();
    await strikeOut(page);
  });
  expect(game.reads).toBeLessThanOrEqual(2); // 남은 판 1 + 경기 끝 누적 XP 1(비공식 레벨 승급, docs/motion-plan.md)
  expect(game.writes).toBe(7); // 경기 + 누적 + 이번 달 연습 + 카운터 + 오답 3

  const second = await measure(page, '비회원 한 판 더(같은 문항 다시 틀려도 오답은 읽지 않음)', async () => {
    await page.getByRole('button', { name: '한 판 더' }).click();
    await strikeOut(page);
  });
  expect(second.reads).toBe(1); // 누적 XP만

  const notes = await measure(page, '오답노트 열기(노트 6개 이하)', async () => {
    await page.getByRole('link', { name: '오답노트' }).click();
    await expect(page.getByRole('list', { name: '틀린 문제' }).getByRole('listitem').first()).toBeVisible();
  });
  const count = await page.getByRole('list', { name: '틀린 문제' }).getByRole('listitem').count();
  expect(notes.reads).toBe(count);
});

test('회원: 앱 열기 4읽기(출석 카드 포함), 출석 도장 쓰기 1, 개인 경기 1읽기(누적 XP), 레벨 테스트', async ({ page }) => {
  test.setTimeout(150_000);
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  const nickname = await finishOnboarding(page);
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  // 새로 연 페이지의 계량기는 0에서 시작한다 — 프로필 읽기까지 기다린다. "회원 선수, 반가워요!"는
  // 프로필을 읽기 전에도 보이므로 **닉네임**이 나올 때까지 기다린다(전에는 이 경쟁으로 0읽기가 잡혔다)
  await expect(page.getByText(`${nickname} 선수, 반가워요!`)).toBeVisible({ timeout: 15_000 });
  await waitForPublicHome(page);
  // 출석 카드(docs/engagement-plan.md)가 이번 달 출석·등수를 다 읽을 때까지
  await expect(page.getByRole('button', { name: /출석 도장 찍기/ })).toBeVisible({ timeout: 15_000 });
  const open = await meter(page);
  rows.push({ action: '회원 앱 열기(프로필 + 공지 묶음 + 출석 카드)', ...open });
  expect(open).toEqual({ reads: 4, writes: 0 }); // 프로필 1 + 공지 묶음 1 + 이번 달 출석 1 + 등수 1

  const stamp = await measure(page, '출석 도장(하루 1번)', async () => {
    await page.getByRole('button', { name: /출석 도장 찍기/ }).click();
    await expect(page.getByRole('region', { name: '오늘 출석' }).getByRole('status')).toContainText('출석!');
  });
  expect(stamp).toEqual({ reads: 0, writes: 1 });

  const game = await measure(page, '회원 개인 경기 1판(3문항 틀림)', async () => {
    await page.getByRole('link', { name: /게임 시작/ }).click();
    await strikeOut(page);
  });
  expect(game).toEqual({ reads: 1, writes: 6 }); // 경기 끝 누적 XP 1(비공식 레벨), 쓰기에 이번 달 연습 1

  await page.getByRole('link', { name: '◀ 나가기' }).click();
  const levelTest = await measure(page, '레벨 테스트(20문항, 1개 틀림)', async () => {
    await page.getByRole('link', { name: /레벨 테스트/ }).click();
    await page.getByRole('button', { name: '시작하기' }).click();
    for (let index = 0; index < 20; index += 1) {
      await expect(page.locator('#question-stem')).toBeVisible();
      await answerQuestion(page, index > 0);
      await page.getByRole('button', { name: index < 19 ? '다음 문제' : '결과 보기' }).click();
    }
    await expect(page.getByRole('heading', { name: /^Lv\.\d/ })).toBeVisible({ timeout: 15_000 });
  });
  // 경기 1 + 프로필 1 + 오답 1, 저장 뒤 프로필 다시 읽기 1
  expect(levelTest).toEqual({ reads: 1, writes: 3 });
});

async function player(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test('친구 대결 2명·5문제: 한 사람 읽기·쓰기', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await player(browser);
  const friend = await player(browser);

  await host.goto('/room');
  await host.getByLabel(/방에서 쓸 이름/).fill('방장');
  await host.getByLabel('정원').selectOption({ label: '2명' });
  await host.getByLabel('문제 수').selectOption({ label: '5문제' });
  await host.getByRole('button', { name: '방 만들기' }).click();
  await expect(host.getByRole('heading', { name: '대기실' })).toBeVisible({ timeout: 15_000 });
  const code = host.url().split('/room/')[1]!;

  await friend.goto(`/room/${code}`);
  await friend.getByLabel(/방에서 쓸 이름/).fill('친구');
  await friend.getByRole('button', { name: '참가하기' }).click();
  await expect(host.getByRole('list', { name: '참가자' }).getByRole('listitem')).toHaveCount(2);
  await host.getByRole('button', { name: '시작하기' }).click();

  for (const page of [host, friend]) {
    for (let index = 0; index < 5; index += 1) {
      await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
      await answerQuestion(page, true);
      await page.getByRole('button', { name: index < 4 ? '다음 문제' : '순위 보기' }).click();
    }
  }
  await expect(host.getByRole('heading', { name: /우승|최종 순위/ })).toBeVisible({ timeout: 15_000 });
  await expect(friend.getByRole('heading', { name: /우승|최종 순위/ })).toBeVisible({ timeout: 15_000 });

  const hostUsage = await meter(host);
  const friendUsage = await meter(friend);
  rows.push({ action: '친구 대결 2명·5문제 — 방장(만들기·시작·끝내기 포함)', ...hostUsage });
  rows.push({ action: '친구 대결 2명·5문제 — 참가자', ...friendUsage });
  // 쓰기: 방장 = 방+자리 2, 시작 1, 답 5, 끝내기 1 / 참가자 = 명단+자리 2, 답 5
  expect(hostUsage.writes).toBe(9);
  expect(friendUsage.writes).toBe(7);
  // 읽기: 답 10개(2명×5)가 두 사람 구독에 각각 1번씩 + 방 문서 변화 몇 번 → 한 사람 30 이하
  expect(hostUsage.reads).toBeLessThanOrEqual(30);
  expect(friendUsage.reads).toBeLessThanOrEqual(30);
});
