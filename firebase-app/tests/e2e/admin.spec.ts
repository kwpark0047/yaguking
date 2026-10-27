import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { processAdminTasks, syncAccounts } from '../../ops/admin.mjs';
import { accounts, clearEmulators, hasFirestore, listDocs, patchDoc, PROJECT } from './helpers';

/**
 * 관리자 1차(골격·공지·가입자·가입 확인) — 관리자 사이트(5175)와 이용자 앱(5174)을 함께 돈다. docs/admin-plan.md
 * 관리자 표시는 에뮬레이터 관리 API로 붙인다(운영에서는 ops/admin-cli.mjs set-admin).
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const ADMIN = 'http://localhost:5175';
const AUTH = 'http://127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const adminApp = initializeApp({ projectId: PROJECT }, 'e2e-admin');
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

async function signUpMember(email: string): Promise<string> {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'yaguking-123', returnSecureToken: true }),
  });
  return ((await response.json()) as { localId: string }).localId;
}

async function seedProfile(uid: string, nickname: string) {
  const at = { timestampValue: new Date().toISOString() };
  await patchDoc(`users/${uid}`, {
    ageConfirmedAt: at,
    createdAt: at,
    nickname: { stringValue: nickname },
    favoriteTeams: { arrayValue: { values: [{ stringValue: 'lg' }] } },
    favoritePlayers: { arrayValue: { values: [] } },
  });
  await patchDoc(`nicknames/${nickname.toLowerCase()}`, { uid: { stringValue: uid } });
  await patchDoc(`users/${uid}/summary/main`, { games: { integerValue: '3' }, h: { integerValue: '4' }, runs: { integerValue: '5' } });
  await patchDoc(`users/${uid}/games/g1`, { createdAt: at, mode: { stringValue: 'practice' }, runs: { integerValue: '2' }, pa: { integerValue: '4' } });
}

/** 구글(에뮬레이터의 가짜 구글 창)으로 로그인 */
async function signInWithGoogle(page: Page) {
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.getByText('Add new account').click();
  await popup.getByText('Auto-generate user information').click();
  await popup.getByText('Sign in with Google.com').click();
}

async function grantAdmin(uid: string) {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ admin: true }), emailVerified: true }),
  });
}

async function axe(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${where} ${v.id}: ${v.help}`)).toEqual([]);
}

test.beforeAll(async () => {
  await clearEmulators();
  const bear = await signUpMember('bear@example.test');
  const tiger = await signUpMember('tiger@example.test');
  await signUpMember('nobody@example.test'); // 가입만 하고 만 14세 확인 전
  await seedProfile(bear, '곰돌이');
  await seedProfile(tiger, '호랑이');
  await syncAccounts({ auth: adminAuth, db: adminDb });
});

test('관리자 1차: 표시 없으면 거절 → 표시 후 대시보드·가입자·가입 확인·기록', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(ADMIN);
  await expect(page.getByRole('heading', { name: '야구왕 관리자' })).toBeVisible();
  await axe(page, 'login');

  // 1) 관리자 표시 없는 구글 계정 → 거절, uid 안내
  await signInWithGoogle(page);
  await expect(page.getByRole('alert')).toContainText('관리자 표시가 없어요');
  const googleUser = (await accounts()).find((user) => user.email && !user.email.endsWith('@example.test'))!;
  await expect(page.getByText(googleUser.localId)).toBeVisible();

  // 2) 운영자가 표시를 붙이면 "다시 확인"으로 들어온다
  await grantAdmin(googleUser.localId);
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: '회원', exact: true })).toContainText('2');
  await expect(page.getByRole('region', { name: '오늘 경기', exact: true })).toContainText('2');
  await expect(page.getByRole('region', { name: '비회원', exact: true })).toContainText('0');
  await axe(page, 'dashboard');

  // 3) 가입자: 이메일은 가려서, 닉네임 검색, 열면 기록
  await page.getByRole('link', { name: '가입자' }).click();
  const table = page.getByRole('region', { name: '가입자 목록', exact: true });
  await expect(table.getByRole('row')).toHaveCount(4); // 머리줄 + 3명
  await expect(table).toContainText('be***@example.test');
  await expect(table).not.toContainText('bear@example.test');
  await axe(page, 'members');
  await page.getByLabel('닉네임 앞글자로 찾기').fill('곰');
  await page.getByRole('button', { name: '찾기' }).click();
  await expect(page.getByText('검색 결과 1명')).toBeVisible();
  await table.getByRole('link', { name: '곰돌이' }).click();
  await expect(page.getByRole('heading', { name: '곰돌이' })).toBeVisible();
  await expect(page.getByText('경기 3 ·', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '이메일 보기(기록됨)' }).click();
  await expect(page.getByText('bear@example.test')).toBeVisible();

  // 4) 가입 확인: 만 14세 확인 전 1명
  await page.getByRole('link', { name: '가입 확인' }).click();
  await expect(page.getByRole('region', { name: '만 14세 확인 안 함', exact: true })).toContainText('1');
  await page.getByRole('button', { name: /만 14세 확인 안 함 1/ }).click();
  await expect(page.getByRole('list', { name: '가입 점검 목록' }).getByRole('listitem')).toHaveCount(1);
  await axe(page, 'signups');

  // 5) 관리자 기록: 열람·이메일 보기가 남았다
  await page.getByRole('link', { name: '관리자 기록' }).click();
  const logs = page.getByRole('region', { name: '관리자 기록', exact: true });
  await expect(logs).toContainText('회원 열람');
  await expect(logs).toContainText('이메일 보기');

  // 6) 계정 동기화 요청 → 대기 작업 1 → 운영자 PC가 처리하면 0
  await page.getByRole('link', { name: '대시보드' }).click();
  await page.getByRole('button', { name: '계정 동기화 요청' }).click();
  await expect(page.getByRole('status')).toContainText('동기화를 요청했어요');
  await expect(page.getByRole('region', { name: '처리 대기 작업', exact: true })).toContainText('1');
  await processAdminTasks({ auth: adminAuth, db: adminDb });
  await page.getByRole('button', { name: '다시 세기' }).click();
  await expect(page.getByRole('region', { name: '처리 대기 작업', exact: true })).toContainText('0');
});

test('공지: 관리자가 올리면 이용자 앱 메인 띠·목록에 뜨고, 숨기면 사라진다', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto(ADMIN);
  // 앞 테스트의 관리자 계정으로 다시 로그인(같은 가짜 구글 계정 선택)
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.locator('li', { hasNotText: 'Add new account' }).first().click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: '공지사항' }).click();
  await page.getByLabel(/^제목/).fill('주말 점검 안내');
  await page.getByLabel(/^본문/).fill('10월 31일 새벽 2시~3시 점검합니다.');
  await page.getByLabel('메인 띠에 고정').check();
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByRole('status')).toContainText('올렸어요');
  await axe(page, 'notices');

  const [publicHome] = (await listDocs('public')).filter((item) => item.id === 'home');
  expect(JSON.stringify(publicHome?.fields)).toContain('주말 점검 안내');

  // 이용자 앱(로그인 안 한 새 창)
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  const banner = visitor.getByRole('complementary', { name: '공지' });
  await expect(banner).toContainText('주말 점검 안내');
  await banner.getByRole('link', { name: '자세히' }).click();
  await expect(visitor.getByText('10월 31일 새벽 2시~3시 점검합니다.')).toBeVisible();
  await axe(visitor, 'app-notices');

  // 숨기면 새로 연 앱에서는 사라진다
  await page.getByRole('button', { name: '고치기' }).first().click();
  await page.getByLabel('숨김').check();
  await page.getByRole('button', { name: '고치기' }).first().click();
  await expect(page.getByRole('status')).toContainText('고쳤어요');
  const later = await (await browser.newContext()).newPage();
  await later.goto('/');
  await expect(later.getByRole('heading', { name: '야구 상식으로 홈런 치자!' })).toBeVisible();
  await expect(later.getByRole('complementary', { name: '공지' })).toHaveCount(0);

  // 관리자 기록에 공지 올림·고침
  await page.getByRole('link', { name: '관리자 기록' }).click();
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('공지 올림');
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('공지 고침');
});
