import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  accounts,
  clearEmulators,
  finishOnboarding,
  hasFirestore,
  readDoc,
  signUp,
  uniqueEmail,
  uniqueNickname,
} from './helpers';

/**
 * 3단계 프로필 — 닉네임, 최애 구단 TOP3, 최애 선수. 설정에서 바꾸기, 계정 삭제.
 * Firestore 에뮬레이터(JDK 21)가 필요하다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');

test.beforeAll(async () => {
  await clearEmulators();
});

const uidOf = async (email: string) => (await accounts()).find((user) => user.email === email)?.localId;

/** 가입하고 만 14세 확인까지 — 프로필 설정 화면에 선다 */
async function newMemberAtProfile(page: Page): Promise<string> {
  const email = uniqueEmail();
  await signUp(page, email);
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await expect(page).toHaveURL(/\/welcome\/profile/);
  return email;
}

/** Firestore REST 값에서 문자열 배열을 꺼낸다 */
const strings = (field: unknown): string[] =>
  ((field as { arrayValue?: { values?: { stringValue: string }[] } })?.arrayValue?.values ?? []).map(
    (value) => value.stringValue,
  );

test('가입 흐름: 닉네임(추천값) → 최애 구단 순위 → 선수 → 메인', async ({ page }) => {
  const email = await newMemberAtProfile(page);

  // 닉네임은 추천값이 미리 채워져 있다
  await expect(page.getByLabel(/닉네임/)).not.toHaveValue('');
  const nickname = uniqueNickname('응원단장');
  await page.getByLabel(/닉네임/).fill(nickname);
  await page.getByRole('button', { name: '다음' }).click();

  // 1위를 고르기 전에는 다음으로 못 간다
  await expect(page.getByRole('button', { name: '다음' })).toBeDisabled();
  await page.getByRole('button', { name: 'LG 트윈스', exact: true }).click();
  await page.getByRole('button', { name: 'KIA 타이거즈', exact: true }).click();
  await expect(page.getByRole('button', { name: 'LG 트윈스, 1위' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'KIA 타이거즈, 2위' })).toBeVisible();
  // 1위 구단 테마가 화면 전체에 바로 입혀진다
  await expect(page.locator('html')).toHaveAttribute('data-team', 'lg');
  await page.getByRole('button', { name: '다음' }).click();

  await page.getByLabel('최애 선수 1위').fill('  홍길동  ');
  await page.getByRole('button', { name: '시작하기' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`${nickname} 선수, 반가워요!`)).toBeVisible();

  const uid = await uidOf(email);
  const profile = await readDoc(`users/${uid}`);
  expect(profile).toHaveProperty('nickname.stringValue', nickname);
  expect(strings(profile?.favoriteTeams)).toEqual(['lg', 'kia']);
  expect(strings(profile?.favoritePlayers)).toEqual(['홍길동']);
  expect(await readDoc(`nicknames/${nickname.toLowerCase()}`)).toHaveProperty('uid.stringValue', uid);
});

test('다른 선수가 쓰는 닉네임은 대소문자가 달라도 못 쓴다', async ({ browser }) => {
  const taken = `Slug${Math.floor(Math.random() * 1e6)}`;

  const first = await browser.newPage();
  await newMemberAtProfile(first);
  await finishOnboarding(first, { nickname: taken });
  await expect(first).toHaveURL(/\/$/);
  await first.close();

  const second = await browser.newPage();
  await newMemberAtProfile(second);
  await second.getByLabel(/닉네임/).fill(taken.toLowerCase());
  await second.getByRole('button', { name: '다음' }).click();
  await expect(second.getByRole('alert')).toHaveText('이미 다른 선수가 쓰는 닉네임이에요.');
  await second.close();
});

test('설정에서 닉네임을 바꾸면 옛 닉네임을 놓아준다, 구단 순위도 바뀐다', async ({ page }) => {
  await newMemberAtProfile(page);
  const before = await finishOnboarding(page, { teams: ['두산 베어스'] });
  await expect(page.locator('html')).toHaveAttribute('data-team', 'doosan');

  await page.getByRole('link', { name: /설정/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
  const after = uniqueNickname('바뀐이름');
  await page.getByLabel(/닉네임/).first().fill(after);
  await page.getByRole('button', { name: '두산 베어스, 1위' }).click(); // 빼고
  await page.getByRole('button', { name: '한화 이글스', exact: true }).click();
  await page.getByRole('button', { name: '저장하기' }).click();
  // 가입 직후의 환영 띠(role=status)가 아직 떠 있을 수 있다 — 저장 안내만 찾는다
  await expect(page.getByRole('status').filter({ hasText: '저장했어요.' })).toHaveText('저장했어요.');

  expect(await readDoc(`nicknames/${before.toLowerCase()}`)).toBeNull();
  expect(await readDoc(`nicknames/${after.toLowerCase()}`)).not.toBeNull();
  await expect(page.locator('html')).toHaveAttribute('data-team', 'hanwha');
});

test('계정 삭제: 닉네임을 입력해야 열리고, 계정·프로필·닉네임 예약이 모두 지워진다', async ({ page }) => {
  // 가입 → 확인 → 프로필 → 설정 → 삭제까지 한 번에 도는 긴 흐름이다
  test.setTimeout(60_000);
  const email = await newMemberAtProfile(page);
  const nickname = await finishOnboarding(page);
  const uid = await uidOf(email);

  await page.getByRole('link', { name: /설정/ }).click();
  await expect(page.getByLabel(/닉네임/).first()).toHaveValue(nickname);
  const remove = page.getByRole('button', { name: '계정과 기록 모두 지우기' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('닉네임 확인').fill(nickname);
  await remove.click();

  await expect(page.getByRole('link', { name: '가입하기' })).toBeVisible({ timeout: 15_000 });
  expect(await uidOf(email)).toBeUndefined();
  expect(await readDoc(`users/${uid}`)).toBeNull();
  expect(await readDoc(`nicknames/${nickname.toLowerCase()}`)).toBeNull();
  await expect(page.locator('html')).not.toHaveAttribute('data-team', /.+/);
});

test('프로필 설정·설정 화면: axe critical/serious 위반 0, 가로 스크롤 없음', async ({ page }) => {
  await newMemberAtProfile(page);
  for (const step of ['nickname', 'teams', 'players'] as const) {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking.map((v) => `${step} ${v.id}: ${v.help}`)).toEqual([]);
    if (step === 'nickname') await page.getByRole('button', { name: '다음' }).click();
    if (step === 'teams') {
      await page.getByRole('button', { name: 'NC 다이노스', exact: true }).click();
      await page.getByRole('button', { name: '다음' }).click();
    }
  }
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `settings ${v.id}: ${v.help} ${v.nodes.map((n) => n.html.slice(0, 160)).join(" / ")}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
