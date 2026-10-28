import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accounts, becomeGuest, clearEmulators, passAgeCheckIfAsked, signUp, uniqueEmail } from './helpers';

/**
 * 1단계 로그인 — Auth 에뮬레이터로 실제 흐름을 돈다(이메일·비밀번호 / 구글 / 익명).
 *
 * 핵심: 비회원이 **가입**하면 같은 계정(uid)에 연결되어 기록이 이어진다. 에뮬레이터의
 * 계정 목록으로 "계정이 새로 생기지 않았다"를 확인한다.
 */

test.beforeAll(async () => {
  await clearEmulators();
});

test('홈: 야구왕 엠블럼이 뜬다(이름으로 읽힘)', async ({ page }) => {
  await page.goto('/');
  const emblem = page.getByRole('img', { name: '야구왕' });
  await expect(emblem).toBeVisible();
  expect(await emblem.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('게임 시작으로 들어온 비회원은 머리줄에 비회원 표시가 뜬다', async ({ page }) => {
  await becomeGuest(page);
  await expect(page.getByRole('link', { name: '가입하기' })).toBeVisible();
});

test('비회원이 가입하면 같은 계정에 연결된다 — 기록이 이어진다', async ({ page }) => {
  await becomeGuest(page);
  const before = await accounts();

  await page.getByRole('link', { name: '가입하기' }).click();
  await expect(page.getByText(/비회원으로 쌓은 기록이 가입한 계정으로 그대로 이어져요/)).toBeVisible();
  const email = uniqueEmail();
  await signUp(page, email);
  await passAgeCheckIfAsked(page);

  const after = await accounts();
  // 계정이 새로 생기지 않고, 그 비회원 계정에 이메일이 붙었다.
  expect(after).toHaveLength(before.length);
  const linked = after.find((user) => user.email === email);
  expect(linked).toBeDefined();
  expect(before.some((user) => user.localId === linked!.localId)).toBe(true);
});

test('가입: 비밀번호가 짧거나 확인이 다르면 막는다', async ({ page }) => {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('이메일').fill(uniqueEmail());
  await page.getByLabel('비밀번호', { exact: true }).fill('short');
  await page.getByLabel(/비밀번호 확인/).fill('short');
  await page.getByRole('button', { name: '이메일로 가입하기' }).click();
  await expect(page.getByRole('alert')).toHaveText(/8자/);

  await page.getByLabel('비밀번호', { exact: true }).fill('long-enough-1');
  await page.getByLabel(/비밀번호 확인/).fill('long-enough-2');
  await page.getByRole('button', { name: '이메일로 가입하기' }).click();
  await expect(page.getByRole('alert')).toHaveText(/일치/);
});

test('로그인 실패는 이유를 구분하지 않는다, 성공하면 로그아웃까지 된다', async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await passAgeCheckIfAsked(page);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('link', { name: '로그인' })).toBeVisible();

  await page.goto('/auth?mode=login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByRole('alert')).toHaveText('이메일 또는 비밀번호가 맞지 않아요.');

  await page.getByLabel('비밀번호', { exact: true }).fill('yaguking-123');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible({ timeout: 15_000 });
});

test('구글로 계속하기 — 에뮬레이터의 가짜 구글 창으로', async ({ page, context }) => {
  await page.goto('/auth?mode=login');
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: '구글로 계속하기' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.getByText('Add new account').click();
  await popup.getByText('Auto-generate user information').click();
  await popup.getByText('Sign in with Google.com').click();
  await passAgeCheckIfAsked(page);
});

test('비밀번호 재설정은 가입 여부와 상관없이 같은 안내를 한다', async ({ page }) => {
  await page.goto('/auth/reset');
  await page.getByLabel('가입한 이메일').fill(uniqueEmail());
  await page.getByRole('button', { name: '재설정 메일 받기' }).click();
  await expect(page.getByRole('status')).toHaveText(/가입된 이메일이라면/);
});

for (const path of ['/', '/auth?mode=signup', '/auth?mode=login', '/auth/reset', '/privacy']) {
  test(`${path}: axe critical/serious 위반 0, 가로 스크롤 없음`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

test('처리방침: 시행 중인 판과 14개 항목, 개정 예고(시행일 전), 이용약관은 확정 전', async ({ page }) => {
  // 판은 날짜로 바뀐다 — 2026-11-03(관리자 열람 개정) 전에는 10-27 판 + 개정 예고, 그 뒤에는 11-03 판
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const amended = today >= '2026-11-03';
  await page.goto('/privacy');
  await expect(page.getByRole('note')).toHaveCount(0); // 초안 표시 없음
  await expect(page.getByText(`시행일: ${amended ? '2026-11-03' : '2026-10-27'}`)).toBeVisible();
  await expect(page.getByText('GitHub')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: /^\d+\. / })).toHaveCount(14);
  if (!amended) {
    await expect(page.getByRole('heading', { name: /2026-11-03부터 바뀌는 점/ })).toBeVisible();
    await page.getByRole('link', { name: '2026-11-03 시행 방침 전문 보기' }).click();
    await expect(page.getByText('시행 예정 방침 · 시행일 2026-11-03')).toBeVisible();
    await expect(page.getByText('운영자의 열람·처리 기록(접속기록)')).toBeVisible();
    await page.goto('/privacy');
  }
  // 출석·월간 등수 개정(2026-11-05) 예고
  if (today < '2026-11-05') await expect(page.getByRole('heading', { name: /2026-11-05부터 바뀌는 점/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '7. 국외 이전' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '이전받는 자' })).toBeVisible();
  await expect(page.getByText('Supabase')).toHaveCount(0);

  await page.getByRole('link', { name: '이용약관 보기' }).click();
  await expect(page.getByText('확정 전', { exact: true })).toBeVisible();
});

test('가입 칸 안내: 이메일부터 짚고 그 칸으로 초점, 첫 비밀번호 칸에 8자 규칙과 글자 수', async ({ page }) => {
  await page.goto('/auth?mode=signup');
  await page.getByRole('button', { name: '이메일로 가입하기' }).click();
  await expect(page.getByRole('alert')).toHaveText('이메일을 적어 주세요.');
  const email = page.getByLabel('이메일');
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');

  await email.fill('someone@example.test');
  const password = page.getByLabel('비밀번호', { exact: true });
  await password.fill('short');
  await expect(page.getByText('8자 이상 · 지금 5자')).toBeVisible();
  await page.getByRole('button', { name: '이메일로 가입하기' }).click();
  await expect(page.getByRole('alert')).toHaveText(/8자/);
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('aria-describedby', 'password-hint');

  await password.fill('long-enough-1');
  await expect(page.getByText('8자 이상 · 지금 13자 ✓')).toBeVisible();
  await expect(page.getByLabel('비밀번호 확인')).toBeVisible();
});

test('비회원 가입 안내 카드: 강조색 바탕으로 눈에 띄고, 접근성 위반 없음', async ({ page }) => {
  await becomeGuest(page);
  await page.goto('/auth?mode=signup');
  const card = page.getByRole('note').filter({ hasText: '그대로 이어져요' });
  await expect(card).toBeVisible();
  const colors = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, weight: style.fontWeight };
  });
  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number(colors.weight)).toBeGreaterThanOrEqual(600);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
