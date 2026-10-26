import { expect, test } from '@playwright/test';
import {
  canLogInMembers,
  deleteE2eMembers,
  memberExists,
  newMemberEmail,
  signInByEmail,
} from './helpers/member';

/**
 * 회원 시나리오 — 실제 이메일 링크 로그인으로 (helpers/member.ts).
 *
 * 비회원 경기 → 가입 → **만 14세 확인 전에는 기록이 붙지 않음** → 확인 → 승계 →
 * 공식 경기 → 로그아웃. 그리고 만 14세 미만 답변 시 계정 삭제.
 * 15 문서 §3, 08 문서 §3 변경 기록.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!(await canLogInMembers()), '로컬 Supabase·Mailpit이 필요합니다.');
});

test.beforeEach(async ({}, testInfo) => {
  // 로그인 메일을 주고받으므로 한 화면 크기에서만 돈다.
  test.skip(testInfo.project.name !== 'sm-360', '회원 시나리오는 sm에서만 확인합니다.');
});

test.afterAll(async () => {
  await deleteE2eMembers();
});

test('가입 → 나이 확인 → 승계·공식 경기 → 로그아웃', async ({ page }) => {
  test.setTimeout(90_000);

  // 1) 비회원으로 경기를 하나 연다(체험 기록이 생긴다)
  await page.goto('/play');
  await expect(page.getByRole('group', { name: '보기' })).toBeVisible({ timeout: 15_000 });

  // 2) 가입 — 새 계정은 만 14세 확인 화면으로 간다
  const email = newMemberEmail();
  await signInByEmail(page, email, 'signup');
  await expect(page).toHaveURL(/\/welcome\/age\?returnTo=/);
  await expect(page.getByRole('heading', { level: 1, name: '만 14세 이상인가요?' })).toBeVisible();

  // 3) 확인 전에는 서버가 회원 기록을 받지 않는다 — 화면을 건너뛰어도
  const official = await page.request.post('/api/v1/play/sessions', {
    data: { mode: 'official_3' },
  });
  expect(official.status()).toBe(403);
  expect((await official.json()).error.code).toBe('AGE_CONFIRMATION_REQUIRED');
  const claim = await page.request.post('/api/v1/auth/claim-guest');
  expect(claim.status()).toBe(403);

  // 4) 확인 → 미뤄 둔 비회원 기록 승계가 일어나고 원래 가던 곳(메인)으로
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await expect(page).toHaveURL(/\/\?claimed=1$/, { timeout: 15_000 });
  await expect(page.getByText(/선수, 다시 왔군요!/)).toBeVisible();

  // 확인한 회원에게 다시 묻지 않는다
  await page.goto('/welcome/age?returnTo=%2Frankings');
  await expect(page).toHaveURL(/\/rankings$/);

  // 5) 게임 시작 = 공식 3이닝
  await page.goto('/');
  await page.getByRole('link', { name: /게임 시작/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText('공식 3이닝', { exact: true })).toBeVisible({ timeout: 15_000 });

  // 6) 로그아웃
  await page.goto('/');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('link', { name: '가입하기' })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});

test('만 14세 미만이라고 답하면 계정과 기록을 지운다', async ({ page }) => {
  test.setTimeout(60_000);
  const email = newMemberEmail();
  await signInByEmail(page, email, 'signup');
  await expect(page).toHaveURL(/\/welcome\/age/);
  expect(await memberExists(email)).toBe(true);

  await page.getByRole('button', { name: '아니요, 만 14세 미만이에요' }).click();
  await expect(page.getByRole('heading', { name: '지금은 가입할 수 없어요' })).toBeVisible();
  await page.getByRole('button', { name: '계정 지우기' }).click();
  await expect(page.getByRole('heading', { name: '계정을 지웠어요' })).toBeVisible();

  expect(await memberExists(email)).toBe(false);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});
