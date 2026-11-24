import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
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

test('로그인 창이 막히거나 닫히면 이유와 할 일을 알린다', async ({ page, browser }) => {
  // 막힘: 브라우저가 팝업을 막은 것처럼 window.open이 null을 돌려준다
  const blockedContext = await browser.newContext();
  const blocked = await blockedContext.newPage();
  await blocked.addInitScript(() => {
    window.open = () => null;
  });
  await blocked.goto(ADMIN);
  await blocked.getByRole('button', { name: '구글로 로그인' }).click();
  await expect(blocked.getByRole('alert')).toContainText('팝업을 "항상 허용"으로');
  await axe(blocked, 'popup-blocked');
  await blockedContext.close();

  // 닫힘: 로그인을 마치기 전에 창을 닫는다(Firebase가 닫힌 것을 알아채기까지 몇 초 걸린다)
  await page.goto(ADMIN);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.close();
  await expect(page.getByRole('alert')).toContainText('로그인을 마치기 전에 구글 로그인 창이 닫혔어요', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: '구글로 로그인' })).toBeEnabled();
});

test('관리자 2차: 화면마다 보기 하나 — 새로 만들기, 가입자·가입 확인·오늘 경기·대결 방·기록', async ({ page }) => {
  test.setTimeout(150_000);
  // 24시간 지난 대결 방 하나(정리 대상)
  const old = Timestamp.fromMillis(Date.now() - 26 * 3_600_000);
  await adminDb.doc('rooms/OLD234').set({ hostUid: 'h', status: 'finished', createdAt: old, maxPlayers: 2, playerIds: ['h'], questionIds: ['q1'], questionSeconds: 15 });
  // 운영자 PC가 매일 밤 쓴 하루 요약 두 날(어제·그제) — 오늘 기준이어야 "최근 7일" 안에 든다
  const kstDayKey = (daysAgo: number) => new Date(Date.now() + 9 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const yesterday = kstDayKey(1);
  const dayKey = (date: string) => date.replaceAll('-', '');
  await adminDb.doc(`adminDaily/${dayKey(yesterday)}`).set({ day: dayKey(yesterday), games: 5, levelTests: 1, memberGames: 3, guestGames: 2, players: 3, averageRuns: 1.2, atBats: 20, correctRate: 0.6, homeRunRate: 0.1, signups: 2, hourly: Array.from({ length: 24 }, (_, h) => (h === 20 ? 5 : 0)), questions: { q1: [6, 1] },
    // 주간 퍼널(계정 동기화가 붙임, docs/measurement-plan.md) — 출처별 1~2명은 "3명 미만"
    funnel: {
      from: dayKey(kstDayKey(7)), to: dayKey(yesterday),
      cohort: { accounts: 10, played: 6, returned: 2, signedUp: 1, ageConfirmed: 1 },
      players: { members: 1, guests: 5 },
      bySource: { instagram: { accounts: 7, played: 5, returned: 2, signedUp: 1, ageConfirmed: 1 }, none: { accounts: 3, played: 1, returned: 0, signedUp: 0, ageConfirmed: 0 } },
    } });
  await adminDb.doc(`adminDaily/${dayKey(kstDayKey(2))}`).set({ day: dayKey(kstDayKey(2)), games: 3, levelTests: 0, memberGames: 1, guestGames: 2, players: 2, averageRuns: 2, atBats: 10, correctRate: 0.5, homeRunRate: 0.2, signups: 1, hourly: [], questions: {} });
  await adminDb.doc('rooms/OLD234/players/h').set({ nickname: '옛방장', joinedAt: old, score: 120, answers: [{ choice: 'A', elapsedMs: 900, correct: true }] });

  page.on('console', (message) => {
    if (message.type() === 'error') console.log('[admin console]', message.text().slice(0, 300));
  });
  await page.goto(ADMIN);
  await expect(page.getByRole('heading', { name: '야구왕 관리자' })).toBeVisible();
  await axe(page, 'login');

  // 1) 관리자 표시 없는 구글 계정 → 거절, uid 안내 → 표시를 붙이면 "다시 확인"으로 들어온다
  await signInWithGoogle(page);
  await expect(page.getByRole('alert')).toContainText('관리자 표시가 없어요');
  const googleUser = (await accounts()).find((user) => user.email && !user.email.endsWith('@example.test'))!;
  await expect(page.getByText(googleUser.localId)).toBeVisible();
  await grantAdmin(googleUser.localId);
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });

  // 2) 대시보드: 보기가 아직 없음 → 새로 만들기(회원·경기·방 모두) → 숫자·가입 단계·살펴볼 것
  await expect(page.getByText('아직 만든 적이 없어요')).toBeVisible();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '회원', exact: true })).toContainText('2', { timeout: 20_000 });
  await expect(page.getByRole('region', { name: '오늘 경기', exact: true })).toContainText('2');
  await expect(page.getByRole('region', { name: '대결 방', exact: true })).toContainText('1');
  await expect(page.getByRole('region', { name: '비회원', exact: true })).toContainText('0');
  await expect(page.getByRole('link', { name: '정리할 지난 방 1' })).toBeVisible();
  await expect(page.getByText(/에 만든 내용/)).toBeVisible();
  // 어제·최근 7일(하루 요약) — 어제가 기본, 7일로 바꾸면 합계·날짜별 막대·많이 틀린 문항
  await expect(page.getByRole('heading', { name: `어제(${yesterday.slice(5)}) 비공식 · 매일 밤 요약` })).toBeVisible();
  const funnel = page.getByRole('region', { name: /주간 퍼널/ });
  await expect(funnel).toContainText('7일 동안 경기를 끝낸 사람 6');
  await expect(funnel.getByRole('list', { name: '단계별 사람 수' })).toContainText('첫 경기 완료6 (60%)');
  const instagram = funnel.getByRole('row', { name: /인스타그램/ });
  await expect(instagram.getByRole('cell')).toHaveText(['7', '5', '3명 미만', '3명 미만', '3명 미만']);
  await expect(funnel.getByRole('row', { name: /표시 없음/ }).getByRole('cell')).toHaveText(['3', '3명 미만', '0', '0', '0']);
  await page.getByRole('button', { name: '최근 7일' }).click();
  const period = page.getByRole('region', { name: /최근 2일/ });
  await expect(period).toBeVisible();
  await expect(page.getByRole('list', { name: '날짜별 경기 수' }).getByRole('listitem')).toHaveCount(2);
  await expect(period.getByRole('definition').first()).toHaveText('8'); // 경기 5 + 3
  await expect(page.getByText(/17% \(6번\)/)).toBeVisible();
  await axe(page, 'dashboard');

  // 3) 가입자: 보기 하나, 이메일은 가려서 — 보기를 누르면 보이고 기록, 거르기·검색, 상세
  await page.getByRole('link', { name: '가입자', exact: true }).click();
  const list = page.getByRole('list', { name: '가입자 목록' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list).toContainText('be***@example.test');
  await expect(list).not.toContainText('bear@example.test');
  await axe(page, 'members');
  await page.getByLabel('상태').selectOption({ label: '14세 미확인' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('상태').selectOption({ label: '전체' });
  await page.getByLabel('닉네임 앞글자').fill('곰');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await list.getByRole('button', { name: /이메일 보기/ }).click();
  await expect(list).toContainText('bear@example.test');
  await list.getByRole('link', { name: '곰돌이' }).click();
  await expect(page.getByRole('heading', { name: '곰돌이' })).toBeVisible();
  await expect(page.getByText('3경기', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '타임라인' })).toBeVisible();
  await page.getByRole('button', { name: /최근 경기 10개 보기/ }).click();
  await expect(page.getByText(/개인 경기 · 타석 4/)).toBeVisible();
  await axe(page, 'member-detail');

  // 4) 가입 확인: 기본은 "가입이 덜 끝남" — 만 14세 확인 전 1명
  await page.getByRole('link', { name: '가입 확인' }).click();
  await expect(page.getByRole('button', { name: /가입이 덜 끝남 1/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: '가입 점검 목록' }).getByRole('listitem')).toHaveCount(1);
  await axe(page, 'signups');

  // 5) 오늘 경기: 요약·목록·타석 상세
  await page.getByRole('link', { name: '오늘 경기' }).click();
  await expect(page.getByRole('region', { name: '경기', exact: true })).toContainText('2');
  const games = page.getByRole('list', { name: '경기 목록' });
  await expect(games.getByRole('listitem')).toHaveCount(2);
  await expect(games).toContainText('곰돌이');
  await axe(page, 'games');

  // 6) 대결 방: 24시간 지난 방 → 지금 정리 → 보기에서 사라짐
  await page.getByRole('link', { name: '대결 방' }).click();
  await page.getByRole('button', { name: /24시간 지남 1/ }).click();
  const rooms = page.getByRole('list', { name: '대결 방 목록' });
  await expect(rooms).toContainText('OLD234');
  await rooms.getByRole('button', { name: /OLD234/ }).click();
  await expect(page.getByRole('region', { name: 'OLD234 참가자' })).toContainText('옛방장');
  await axe(page, 'rooms');
  await page.getByRole('button', { name: '지난 방 1개 지금 정리' }).click();
  await expect(page.getByRole('status')).toContainText('지난 방 1개를 정리했어요');
  await expect(page.getByRole('button', { name: /24시간 지남 0/ })).toBeVisible();
  expect((await adminDb.doc('rooms/OLD234').get()).exists).toBe(false);

  // 7) 관리자 기록: 새로 만들면 열람·이메일 보기·정리가 보인다
  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  const logs = page.getByRole('region', { name: '관리자 기록', exact: true });
  for (const label of ['가입자 목록 열람', '회원 열람', '이메일 보기', '회원 경기 열람', '오늘 경기 열람', '대결 방 열람', '지난 방 정리', '화면 새로 만들기']) {
    await expect(logs).toContainText(label);
  }

  // 8) 계정 동기화 요청 → 대기 작업 1 → 운영자 PC가 처리하면 0(대시보드 새로 만들기로 확인)
  await page.getByRole('link', { name: '대시보드' }).click();
  await page.getByRole('button', { name: '계정 동기화 요청' }).click();
  await expect(page.getByRole('status')).toContainText('동기화를 요청했어요');
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '처리 대기 작업', exact: true })).toContainText('1', { timeout: 20_000 });
  await processAdminTasks({ auth: adminAuth, db: adminDb });
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '처리 대기 작업', exact: true })).toContainText('0', { timeout: 20_000 });
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

  // 관리자 기록에 공지 올림·고침(기록 화면은 보기 — 새로 만들기)
  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('공지 올림');
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('공지 고침');
});

test('이벤트: 출석 2배 날을 더해 저장하면 설정 문서와 관리자 기록에 남는다, 지난 날은 고를 수 없다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(ADMIN);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.locator('li', { hasNotText: 'Add new account' }).first().click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: '이벤트' }).click();
  await expect(page.getByRole('heading', { name: '이벤트', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: '공식전 남은 문항' })).toContainText('ops/official/pool.csv');
  const kst = (offset: number) => new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('날짜').fill(kst(-1));
  await page.getByRole('button', { name: '더하기' }).click();
  await expect(page.getByRole('alert')).toContainText('지난 날은 고를 수 없어요');
  await page.getByLabel('날짜').fill(kst(2));
  await page.getByRole('button', { name: '더하기' }).click();
  await expect(page.getByRole('list', { name: '출석 2배 날 목록' })).toContainText(kst(2));
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('status')).toContainText('저장했어요');
  await axe(page, 'events');
  expect((await adminDb.doc('adminConfig/events').get()).get('doubleDays')).toEqual([kst(2)]);

  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('출석 2배 날 저장');
});

test('최신 소식: 출처가 없으면 저장하지 않고, 쓴 글은 확인 전 → 새벽 확인 뒤 "앱에 올림"', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(ADMIN);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.locator('li', { hasNotText: 'Add new account' }).first().click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: '최신 소식' }).click();
  await page.getByLabel(/^제목/).fill('관리자에서 쓴 소식');
  await page.getByLabel(/^요약/).fill('관리자 요약');
  await page.getByLabel(/^본문/).fill('관리자 본문');
  await page.getByLabel('출처 이름').fill('야구왕');
  await page.getByLabel(/^출처 주소/).fill('');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('alert')).toContainText('https://');
  await page.getByLabel(/^출처 주소/).fill('https://yaguking.web.app/news');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('status')).toContainText('다음 0시 확인');
  const list = page.getByRole('list', { name: '소식 글 목록' });
  await expect(list).toContainText('관리자에서 쓴 소식');
  await expect(list).toContainText('아직 확인 전');
  await axe(page, 'news');

  const { runNews } = await import('../../ops/news.mjs');
  await runNews({ db: adminDb, fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch });
  await page.reload();
  await expect(page.getByRole('list', { name: '소식 글 목록' })).toContainText('앱에 올림', { timeout: 15_000 });

  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('소식 씀');
});

test('광고: 글 광고·이미지 광고 올림 → 앱 메인 맨 위·게임 중 하단에 "광고"와 광고주, 공지는 맨 아래, 숨기면 사라짐', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto(ADMIN);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.locator('li', { hasNotText: 'Add new account' }).first().click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: '광고', exact: true }).click();

  // 1) 메인 상단 이미지 광고 — 파일을 고르면 자리 크기로 줄여 미리보기
  await page.getByLabel(/^제목/).fill('오늘의 공식전 배너');
  await page.getByLabel(/^이동 주소/).fill('/official');
  await page.getByLabel('이미지 고르기', { exact: false }).setInputFiles({
    name: 'banner.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.getByText(/줄인 이미지 1200×300/)).toBeVisible();
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByRole('alert')).toContainText('대체 글');
  await page.getByLabel(/^대체 글/).fill('오늘의 공식전 5문제에 도전하세요');
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '올렸어요' })).toBeVisible();
  await axe(page, 'ads');

  // 2) 게임 중 하단 글 광고(바깥 주소)
  await page.getByLabel('위치').selectOption('play-bottom');
  await page.getByLabel(/^제목/).fill('야구왕 굿즈 출시');
  await page.getByLabel(/^문구/).fill('응원 머리띠 한정 판매');
  await page.getByLabel(/^이동 주소/).fill('https://example.com/goods');
  await page.getByLabel('광고주').fill('협찬사');
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '올렸어요' })).toBeVisible();
  await expect(page.getByRole('list', { name: '광고 목록' }).getByRole('listitem')).toHaveCount(2);
  const home = (await listDocs('public')).find((item) => item.id === 'home');
  expect(JSON.stringify(home?.fields)).toContain('야구왕 굿즈 출시');
  expect(JSON.stringify(home?.fields)).not.toContain('base64'); // 이미지는 공개 묶음에 넣지 않는다
  expect((await listDocs('public')).some((item) => item.id.startsWith('ad_'))).toBe(true);

  // 공지 하나(맨 아래 확인용)
  await patchDoc('public/home', {
    notices: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'n-bottom' }, title: { stringValue: '아래로 간 공지' }, startsAt: { integerValue: '0' }, pinned: { booleanValue: true } } } }] } },
  });

  // 이용자 앱
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  const top = visitor.locator('[data-ad-slot="home-top"]');
  await expect(top).toBeVisible();
  await expect(top).toContainText('광고');
  await expect(top).toContainText('야구왕');
  await expect(top.getByRole('img', { name: '오늘의 공식전 5문제에 도전하세요' })).toBeVisible();
  await expect(top.getByRole('link')).toHaveAttribute('href', '/official');
  const order = await visitor.evaluate(() => {
    const ad = document.querySelector('[data-ad-slot="home-top"]')!;
    const hero = document.querySelector('main.home-hero')!;
    const notice = document.querySelector('aside[aria-label="공지"]')!;
    return [ad.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING, hero.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING];
  });
  expect(order.every(Boolean)).toBe(true); // 광고 → 히어로 → … → 공지
  await axe(visitor, 'app-ad');

  await visitor.goto('/play');
  await expect(visitor.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  const bottom = visitor.locator('[data-ad-slot="play-bottom"]');
  await expect(bottom).toContainText('야구왕 굿즈 출시');
  await expect(bottom).toContainText('협찬사');
  await expect(bottom.getByRole('link')).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  await expect(bottom.getByRole('link')).toHaveAttribute('target', '_blank');

  // 숨기면 새로 연 앱에서 사라진다
  await page.getByRole('list', { name: '광고 목록' }).getByRole('listitem').filter({ hasText: '야구왕 굿즈 출시' }).getByRole('button', { name: '고치기' }).click();
  await page.getByLabel(/^숨김/).check();
  await page.getByRole('form', { name: '광고 고치기' }).getByRole('button', { name: '고치기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '고쳤어요' })).toBeVisible();
  const later = await (await browser.newContext()).newPage();
  await later.goto('/play');
  await expect(later.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(later.locator('[data-ad-slot="play-bottom"]')).toHaveCount(0);

  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await expect(page.getByRole('region', { name: '관리자 기록', exact: true })).toContainText('광고 올림');
});

test('가입자 관리: 더 보기·월간 등수 이름 숨김·계정 삭제 요청(운영자 PC 처리)·보호자 동의 승인·팀 이름 숨김', async ({ page }) => {
  test.setTimeout(150_000);
  // 보호자 동의를 기다리는 자녀 계정과 팀 하나
  const kid = await signUpMember('kid@example.test');
  await adminDb.doc(`users/${kid}`).set({ under14At: Timestamp.now(), createdAt: Timestamp.now() });
  await adminDb.doc(`users/${kid}/private/guardian`).set({ email: 'mom@example.test', code: 'KXDAB3', requestedAt: Timestamp.now() });
  const tiger = (await accounts()).find((user) => user.email === 'tiger@example.test')!.localId;
  await adminDb.doc('squads/TEAMA2').set({ name: '동네 직관단', kind: 'friends', logo: { frame: 'shield', symbol: 'tiger', primary: 'navy', secondary: 'gold', initials: 'DJ' }, captain: tiger, coach: null, size: 1, createdAt: Timestamp.now() });
  await adminDb.doc(`squads/TEAMA2/members/${tiger}`).set({ nickname: '호랑이', joinedAt: Timestamp.now(), child: false });
  await adminDb.doc(`users/${tiger}`).set({ squad: 'TEAMA2' }, { merge: true });
  await syncAccounts({ auth: adminAuth, db: adminDb });

  await page.goto(ADMIN);
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.locator('li', { hasNotText: 'Add new account' }).first().click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });

  // 1) 가입자: 새로 만들면 보호자 동의 기다림·팀 표시
  await page.getByRole('link', { name: '가입자', exact: true }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  const list = page.getByRole('list', { name: '가입자 목록' });
  await expect(list).toContainText('팀 TEAMA2', { timeout: 20_000 });
  await page.getByLabel('상태').selectOption({ label: '보호자 동의 기다림' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('상태').selectOption({ label: '전체' });

  // 2) 호랑이 상세: 더 보기 → 팀(감독), 월간 등수 이름 숨김
  await list.getByRole('link', { name: '호랑이' }).click();
  await page.getByRole('button', { name: /지갑·보너스·팀·작업 보기/ }).click();
  await expect(page.getByText('동네 직관단 (친구팀, 1명) · 감독')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '이름 숨기기' }).click();
  await expect(page.getByRole('status')).toContainText('익명 선수');
  expect((await adminDb.doc(`users/${tiger}`).get()).get('rankingHidden')).toBe(true);
  await axe(page, 'member-actions');

  // 3) 계정 삭제 요청: 닉네임을 적어야 열리고, 운영자 PC가 처리하면 계정·기록·팀 자리가 지워진다
  const remove = page.getByRole('button', { name: '계정 삭제 요청' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('사유').selectOption('본인 요청');
  await page.getByLabel(/닉네임 “호랑이”/).fill('호랑이');
  await remove.click();
  await expect(page.getByRole('status')).toContainText('계정 삭제를 요청했어요');
  const report = await processAdminTasks({ auth: adminAuth, db: adminDb });
  expect(report.results).toMatchObject({ deleteAccount: 1 });
  expect((await adminDb.doc(`users/${tiger}`).get()).exists).toBe(false);
  expect((await adminDb.doc(`squads/TEAMA2/members/${tiger}`).get()).exists).toBe(false);
  await expect(adminAuth.getUser(tiger)).rejects.toBeTruthy();

  // 4) 보호자 동의: 다른 보낸 주소는 막고, 맞으면 승인
  await page.getByRole('link', { name: '보호자 동의' }).click();
  const requests = page.getByRole('list', { name: '보호자 동의 기다림' });
  await expect(requests).toContainText('KXDAB3', { timeout: 15_000 });
  await expect(requests).toContainText('mo***@example.test');
  await axe(page, 'guardians');
  await requests.getByLabel('메일 제목의 동의 코드').fill('kxdab3');
  await requests.getByLabel('받은 메일의 보낸 주소').fill('dad@example.test');
  await expect(requests.getByRole('button', { name: '동의 승인' })).toBeDisabled();
  await requests.getByLabel('받은 메일의 보낸 주소').fill('Mom@Example.test');
  await requests.getByRole('button', { name: '동의 승인' }).click();
  await expect(page.getByText('동의를 기다리는 계정이 없어요.')).toBeVisible({ timeout: 15_000 });
  const consented = (await adminDb.doc(`users/${kid}`).get()).data()!;
  expect(consented.guardianConsentAt).toBeTruthy();
  expect(consented.guardianConsentVersion).toBe('2026-12-15');

  // 5) 팀: 이름 숨기기
  await page.getByRole('link', { name: '팀', exact: true }).click();
  const squads = page.getByRole('list', { name: '팀 목록' });
  await expect(squads).toContainText('동네 직관단', { timeout: 15_000 });
  await axe(page, 'squads');
  await squads.getByRole('button', { name: '이름 숨기기' }).click();
  await expect(squads).toContainText('(이름 숨김)', { timeout: 15_000 });
  expect((await adminDb.doc('squads/TEAMA2').get()).get('hidden')).toBe(true);

  // 6) 관리자 기록에 남았다
  await page.getByRole('link', { name: '관리자 기록' }).click();
  await page.getByRole('button', { name: '새로 만들기' }).click();
  const logs = page.getByRole('region', { name: '관리자 기록', exact: true });
  for (const label of ['회원 포인트·팀 열람', '등수 이름 숨김', '계정 삭제 요청', '계정 삭제(운영자 PC)', '보호자 동의 목록 열람', '보호자 동의 승인', '팀 이름 숨김']) {
    await expect(logs).toContainText(label, { timeout: 15_000 });
  }
});
