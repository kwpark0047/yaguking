import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { answerQuestion, clearEmulators, hasFirestore, readDoc } from './helpers';

/**
 * 5단계 — 비공식 친구 대결. 브라우저 두 개(서로 다른 비회원)로 실시간 흐름을 돈다:
 * 방 만들기 → 링크로 참가 → 방장 시작 → 각자 풀기 → 최종 순위.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await clearEmulators();
});

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** 비회원으로 방을 만든다. 방 코드를 돌려준다 */
async function createRoom(page: Page, { name, size = '2명', count = '5문제' }: { name: string; size?: string; count?: string }) {
  await page.goto('/room');
  await page.getByLabel(/방에서 쓸 이름/).fill(name);
  await page.getByLabel('정원').selectOption({ label: size });
  await page.getByLabel('문제 수').selectOption({ label: count });
  await page.getByRole('button', { name: '방 만들기' }).click();
  await expect(page.getByRole('heading', { name: '대기실' })).toBeVisible({ timeout: 15_000 });
  const code = page.url().split('/room/')[1]!;
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

async function joinByLink(page: Page, code: string, name: string) {
  await page.goto(`/room/${code}`);
  await page.getByLabel(/방에서 쓸 이름/).fill(name);
  await page.getByRole('button', { name: '참가하기' }).click();
  await expect(page.getByRole('heading', { name: '대기실' })).toBeVisible({ timeout: 15_000 });
}

async function playAll(page: Page, count: number, correct: boolean) {
  for (let index = 0; index < count; index += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answerQuestion(page, correct);
    await page.getByRole('button', { name: index < count - 1 ? '다음 문제' : '순위 보기' }).click();
  }
}

test('두 친구가 링크로 모여 실시간으로 대결하고 최종 순위를 본다', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await newPlayer(browser);
  const friend = await newPlayer(browser);

  const code = await createRoom(host, { name: '방장곰' });
  await expect(host.getByRole('button', { name: '시작하기' })).toBeDisabled();

  await joinByLink(friend, code, '친구토끼');
  // 방장 화면에 실시간으로 친구가 보인다
  const hostSeats = host.getByRole('list', { name: '참가자' });
  await expect(hostSeats.getByRole('listitem')).toHaveCount(2);
  await expect(hostSeats).toContainText('친구토끼');
  await expect(friend.getByText('방장이 시작하기를 기다리는 중…')).toBeVisible();

  await host.getByRole('button', { name: '시작하기' }).click();
  // 친구 화면도 시작 신호를 받아 첫 문제가 뜬다
  await expect(friend.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(friend.getByText(/^1 \/ 5/)).toBeVisible();

  await playAll(host, 5, true);
  await expect(host.getByRole('heading', { name: '다 풀었어요!' })).toBeVisible();
  await playAll(friend, 5, false);

  // 다 끝나면 방장 기기가 방을 끝내고, 두 화면 모두 최종 순위
  await expect(host.getByRole('heading', { name: '우승!' })).toBeVisible({ timeout: 15_000 });
  await expect(friend.getByRole('heading', { name: '최종 순위' })).toBeVisible({ timeout: 15_000 });
  const ranking = friend.getByRole('list', { name: '최종 순위' }).getByRole('listitem');
  await expect(ranking.nth(0)).toContainText('1위 방장곰');
  await expect(ranking.nth(0)).toContainText('정답 5/5');
  await expect(ranking.nth(1)).toContainText('2위 친구토끼');
  await expect(ranking.nth(1)).toContainText('0점');

  const room = await readDoc(`rooms/${code}`);
  expect(room).toHaveProperty('status.stringValue', 'finished');
});

test('정원이 차면 못 들어오고, 나가면 자리가 빈다. 방장이 닫으면 모두에게 닫힘', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser);
  const friend = await newPlayer(browser);
  const late = await newPlayer(browser);

  const code = await createRoom(host, { name: '방장' });
  await joinByLink(friend, code, '친구');

  await late.goto(`/room/${code}`);
  await expect(late.getByText('방이 꽉 찼어요.')).toBeVisible({ timeout: 15_000 });

  await friend.getByRole('button', { name: '방에서 나가기' }).click();
  await expect(friend).toHaveURL(/\/room$/);
  await expect(host.getByRole('list', { name: '참가자' }).getByRole('listitem')).toHaveCount(1);

  await joinByLink(late, code, '늦은친구');
  await host.getByRole('button', { name: '방 닫기' }).click();
  await expect(late.getByRole('heading', { name: '방이 없어요' })).toBeVisible({ timeout: 15_000 });
});

test('없는 코드·잘못된 코드', async ({ page }) => {
  await page.goto('/room');
  await page.getByLabel('방 코드 (6자)').fill('abc');
  await page.getByRole('button', { name: '들어가기' }).click();
  await expect(page.getByRole('alert')).toHaveText('방 코드는 영문·숫자 6자예요.');

  await page.getByLabel('방 코드 (6자)').fill('zzzz22');
  await page.getByRole('button', { name: '들어가기' }).click();
  await expect(page).toHaveURL(/\/room\/ZZZZ22$/);
  await expect(page.getByRole('heading', { name: '방이 없어요' })).toBeVisible({ timeout: 15_000 });
});

test('대결 화면: axe critical/serious 위반 0', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser);
  const friend = await newPlayer(browser);
  const check = async (page: Page, where: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking.map((v) => `${where} ${v.id}: ${v.help}`)).toEqual([]);
  };

  await host.goto('/room');
  await expect(host.getByRole('button', { name: '방 만들기' })).toBeEnabled({ timeout: 15_000 });
  await check(host, 'lobby');
  const code = await createRoom(host, { name: '방장' });
  await check(host, 'waiting');
  await friend.goto(`/room/${code}`);
  await expect(friend.getByRole('button', { name: '참가하기' })).toBeVisible({ timeout: 15_000 });
  await check(friend, 'join');
  await friend.getByRole('button', { name: '참가하기' }).click();
  await expect(host.getByRole('list', { name: '참가자' }).getByRole('listitem')).toHaveCount(2);
  await host.getByRole('button', { name: '시작하기' }).click();
  await expect(host.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await check(host, 'question');
  await answerQuestion(host, true);
  await check(host, 'feedback');
});
