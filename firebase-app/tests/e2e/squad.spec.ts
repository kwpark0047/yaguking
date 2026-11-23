import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { accounts, clearEmulators, finishOnboarding, hasFirestore, PROJECT, signUp, uniqueEmail, uniqueNickname } from './helpers';

/**
 * 팀(2단계)·팀 대항전(3단계)·보호자 동의(만 14세 미만) — 만들기·로고, 팀 링크로 합류 신청 → 감독 승인, 팀원·리그 화면, 팀 대항전 방,
 * 자녀 가입 길(보호자 메일 주소 → 동의 기다리는 화면). E2E 앱은 시작일을 앞당기고 시험용 동의 메일 주소를 넣는다(playwright.config.ts).
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-squad'));
const readDoc = async (path: string) => (await db.doc(path).get()).data() ?? null;

async function newMember(page: Page, nickname = uniqueNickname('팀원')): Promise<{ uid: string; nickname: string }> {
  const before = await accounts();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page, { nickname });
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible({ timeout: 15_000 });
  const uid = (await accounts()).find((user) => !before.some((known) => known.localId === user.localId))!.localId;
  return { uid, nickname };
}

async function memberPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.beforeAll(async () => {
  await clearEmulators();
});

let code = '';

test('감독: 홈 → 팀 만들기(이름·종류·로고) → 내 팀, 실제 구단 이름은 막는다', async ({ page }) => {
  test.setTimeout(90_000);
  await newMember(page, uniqueNickname('감독'));
  await page.getByRole('link', { name: '팀 만들기·합류' }).click();
  await page.getByRole('button', { name: '새 팀 만들기' }).click();
  const name = page.getByLabel('팀 이름(2~12자)');
  await name.fill('LG 트윈스');
  await expect(page.getByText('우리 팀만의 이름을 지어 주세요', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '팀 만들기' })).toBeDisabled();
  await name.fill('동네 직관단');
  await page.getByRole('button', { name: '호랑이' }).click();
  await page.getByRole('button', { name: '빨강' }).first().click();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  await page.getByRole('button', { name: '팀 만들기' }).click();

  await expect(page.getByRole('heading', { name: '동네 직관단' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '동네 직관단 로고' })).toBeVisible();
  const line = await page.getByText(/팀 코드/).first().textContent();
  code = line!.match(/[A-HJ-NP-Z2-9]{6}/)![0];
  const squad = await readDoc(`squads/${code}`);
  expect(squad).toMatchObject({ name: '동네 직관단', kind: 'friends', size: 1 });
  expect((squad!.logo as Record<string, unknown>).symbol).toBe('tiger');
  await expect(page.getByRole('list', { name: '팀원 목록' })).toContainText('감독');
});

test('팀원: 팀 링크로 들어와 신청 → 감독이 승인 → 팀원 목록·이번 주 리그·팀 리그 화면', async ({ browser }) => {
  test.setTimeout(150_000);
  const joiner = await memberPage(browser);
  const me = await newMember(joiner.page);
  await joiner.page.goto(`/team?join=${code}`);
  await expect(joiner.page.getByRole('region', { name: '합류할 팀' })).toContainText('동네 직관단', { timeout: 15_000 });
  await joiner.page.getByRole('button', { name: '이 팀에 합류 신청' }).click();
  await expect(joiner.page.getByText('합류 신청을 보냈어요').first()).toBeVisible({ timeout: 15_000 });
  await expect(joiner.page.getByRole('region', { name: '합류 신청한 팀' })).toBeVisible();

  // 감독이 다시 로그인해 승인(이 테스트는 새 감독을 만든다 — 앞 팀과 같은 흐름)
  const captain = await memberPage(browser);
  await newMember(captain.page, uniqueNickname('감독둘'));
  await captain.page.goto('/team');
  await captain.page.getByRole('button', { name: '새 팀 만들기' }).click();
  await captain.page.getByLabel('팀 이름(2~12자)').fill('영업팀 홈런즈');
  await captain.page.getByRole('radio', { name: /동료팀/ }).check();
  await captain.page.getByRole('button', { name: '팀 만들기' }).click();
  await expect(captain.page.getByRole('heading', { name: '영업팀 홈런즈' })).toBeVisible({ timeout: 15_000 });
  const line = await captain.page.getByText(/팀 코드/).first().textContent();
  const second = line!.match(/[A-HJ-NP-Z2-9]{6}/)![0];

  // 신청을 거두고 두 번째 팀에 신청 → 감독둘이 승인
  await joiner.page.getByRole('button', { name: '신청 거두기' }).click();
  await joiner.page.getByLabel('팀 코드(6자리)').fill(second.toLowerCase());
  await joiner.page.getByRole('button', { name: '합류 신청', exact: true }).click();
  await expect(joiner.page.getByRole('region', { name: '합류 신청한 팀' })).toContainText('영업팀 홈런즈', { timeout: 15_000 });

  await captain.page.reload();
  await expect(captain.page.getByRole('heading', { name: '합류 신청 1명' })).toBeVisible({ timeout: 15_000 });
  await captain.page.getByRole('button', { name: '승인' }).click();
  await expect(captain.page.getByRole('list', { name: '팀원 목록' })).toContainText(me.nickname, { timeout: 15_000 });
  expect(await readDoc(`squads/${second}`)).toMatchObject({ size: 2 });

  await joiner.page.reload();
  await expect(joiner.page.getByRole('heading', { name: '영업팀 홈런즈' })).toBeVisible({ timeout: 15_000 });
  await expect(joiner.page.getByRole('list', { name: '팀원 목록' })).toContainText('감독');
  await joiner.page.getByRole('link', { name: '팀 리그 순위' }).click();
  await expect(joiner.page.getByRole('heading', { name: '팀 주간 리그' })).toBeVisible();
  await expect(joiner.page.getByText(/아직 순위가 없어요|아직 점수가 있는 팀이 없어요/)).toBeVisible({ timeout: 15_000 });

  // 팀 대항전: 팀원이 방을 만들고(팀 대항전), 다른 팀 감독이 들어오면 두 팀이 보인다
  await joiner.page.goto('/room?team=1');
  await expect(joiner.page.getByRole('heading', { name: '팀 대항전 방 만들기' })).toBeVisible();
  await joiner.page.getByRole('button', { name: '방 만들기' }).click();
  await expect(joiner.page.getByRole('heading', { name: '대기실' })).toBeVisible({ timeout: 15_000 });
  const roomCode = joiner.page.url().split('/room/')[1]!;
  await expect(joiner.page.getByRole('button', { name: '시작하기' })).toBeDisabled();
  await expect(joiner.page.getByText('상대 팀 기다리는 중')).toBeVisible();

  const first = await memberPage(browser);
  // 첫 팀 감독은 앞 테스트의 계정이라 다시 로그인하는 대신, 첫 팀에 새 회원을 만들어 들이지 않고 — 팀이 없는 사람은 못 들어온다는 것만 본다
  await newMember(first.page);
  await first.page.goto(`/room/${roomCode}`);
  await expect(first.page.getByText('팀 대항전은 팀원만 들어올 수 있어요').first()).toBeVisible({ timeout: 15_000 });

  for (const item of [joiner, captain, first]) await item.context.close();
});

test('자녀 가입 길: 만 14세 미만 → 보호자 메일 주소 → 동의 기다리는 화면(동의 코드·메일 쓰기), 기록은 막힌다', async ({ page }) => {
  test.setTimeout(90_000);
  const before = await accounts();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '아니요, 만 14세 미만이에요' }).click();
  await expect(page.getByRole('heading', { name: '보호자 동의가 필요해요' })).toBeVisible();
  await page.getByRole('button', { name: '보호자 동의 받기' }).click();
  await page.getByRole('textbox', { name: '보호자 메일 주소' }).fill('mom@example.test');
  await page.getByRole('button', { name: '다음' }).click();

  await expect(page.getByRole('heading', { name: '보호자 동의 기다리는 중' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('consent@yaguking.test')).toBeVisible();
  const mailto = await page.getByRole('link', { name: '동의 메일 쓰기' }).getAttribute('href');
  expect(mailto).toMatch(/^mailto:consent@yaguking\.test\?subject=/);
  const uid = (await accounts()).find((user) => !before.some((known) => known.localId === user.localId))!.localId;
  const profile = await readDoc(`users/${uid}`);
  expect(profile?.under14At).toBeTruthy();
  expect(profile?.ageConfirmedAt).toBeUndefined();
  const guardian = await readDoc(`users/${uid}/private/guardian`);
  expect(guardian).toMatchObject({ email: 'mom@example.test' });
  expect(mailto).toContain(String(guardian!.code));

  // 동의 전에는 다른 화면으로 가도 이 화면으로 돌아온다
  await page.goto('/team');
  await expect(page).toHaveURL(/\/guardian/);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
});
