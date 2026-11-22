import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { accounts, clearEmulators, finishOnboarding, hasFirestore, PROJECT, signUp, uniqueEmail } from './helpers';

/**
 * 친구 초대 1단계 — 내 코드·링크, 링크로 들어온 코드를 가입할 때 연결, 받은 코드 직접 넣기, 현황.
 * E2E 앱은 시작일을 앞당겨 연다(playwright.config.ts VITE_INVITE_START). 보상은 운영자 PC 작업이라 여기서는 진행 기록을 깔아 확인한다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-invite'));

async function newMember(page: Page): Promise<string> {
  const before = await accounts();
  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await finishOnboarding(page);
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible({ timeout: 15_000 });
  return (await accounts()).find((user) => !before.some((known) => known.localId === user.localId))!.localId;
}

test.beforeAll(async () => {
  await clearEmulators();
});

let inviterCode = '';
let inviterUid = '';

test('초대한 사람: 홈에서 친구 초대 → 내 코드(6자리)와 초대하기, 현황(비었다가 보상 뒤 닉네임·보너스)', async ({ page }) => {
  test.setTimeout(90_000);
  inviterUid = await newMember(page);
  await page.getByRole('link', { name: /친구 초대/ }).click();
  const code = page.getByRole('region', { name: '내 초대 코드' }).locator('p.font-cute');
  await expect(code).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
  inviterCode = (await code.textContent())!.trim();
  await expect(page.getByRole('button', { name: '초대하기' })).toBeVisible();
  await expect(page.getByText('아직 초대로 가입한 친구가 없어요.')).toBeVisible();
  expect((await db.doc(`invites/${inviterCode}`).get()).get('uid')).toBe(inviterUid);
  expect((await db.doc(`users/${inviterUid}`).get()).get('inviteCode')).toBe(inviterCode);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);

  // 다시 열어도 같은 코드
  await page.reload();
  await expect(code).toHaveText(inviterCode, { timeout: 15_000 });

  // 보상 뒤 현황(진행 기록·합계는 운영자 PC가 쓴다 — 여기서는 관리 SDK로 깔아 둔다)
  await db.doc('inviteLedger/e2e-friend').set({ inviter: inviterUid, invitee: 'e2e-friend', nickname: '초대친구', status: 'rewarded', linkedDay: '2026-12-02', inviterPoints: 200, inviteePoints: 100 });
  await db.doc(`users/${inviterUid}/meta/invites`).set({ bonus: 200, rewarded: 1, titles: [] });
  await page.reload();
  const list = page.getByRole('list', { name: '초대한 친구' });
  await expect(list).toContainText('초대친구', { timeout: 15_000 });
  await expect(list).toContainText('보상 완료 · +200P');
  await expect(page.getByText('보상받은 친구 1명 · 받은 보너스 200P')).toBeVisible();
  await db.doc('inviteLedger/e2e-friend').delete();
});

test('초대받은 사람: 링크로 들어와 가입하면 코드가 자동으로 연결되고, 주소창에서는 코드가 지워진다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/?invite=${inviterCode.toLowerCase()}&utm_source=share&utm_campaign=invite`);
  await expect(page).not.toHaveURL(/invite=/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yk_invite') ?? 'null')?.code)).toBe(inviterCode);
  const uid = await newMember(page);
  await expect.poll(async () => (await db.doc(`users/${uid}`).get()).get('invitedBy'), { timeout: 15_000 }).toBe(inviterCode);
  // 서버 쓰기가 보인 뒤 기기에서 지우기까지 아주 짧은 틈이 있다 — 기다려서 확인
  await expect.poll(() => page.evaluate(() => localStorage.getItem('yk_invite')), { timeout: 10_000 }).toBeNull();
});

test('받은 코드 직접 넣기: 내 코드·없는 코드는 안내, 맞는 코드는 한 번만', async ({ page }) => {
  test.setTimeout(90_000);
  const uid = await newMember(page);
  await page.goto('/invite');
  const input = page.getByLabel('초대 코드(6자리)');
  await expect(input).toBeVisible({ timeout: 15_000 });
  const mine = (await page.getByRole('region', { name: '내 초대 코드' }).locator('p.font-cute').textContent())!.trim();
  await input.fill(mine);
  await page.getByRole('button', { name: '넣기' }).click();
  await expect(page.getByRole('alert')).toHaveText('내 초대 코드는 넣을 수 없어요.');
  await input.fill('ZZZZZZ');
  await page.getByRole('button', { name: '넣기' }).click();
  await expect(page.getByRole('alert')).toHaveText('없는 초대 코드예요. 다시 확인해 주세요.');
  await input.fill(inviterCode);
  await page.getByRole('button', { name: '넣기' }).click();
  await expect(page.getByRole('status').filter({ hasText: `초대 코드 ${inviterCode}를 넣었어요` })).toBeVisible();
  await expect(page.getByText(`초대받은 코드 ${inviterCode}가 연결돼 있어요.`)).toBeVisible();
  await expect(input).toHaveCount(0);
  expect((await db.doc(`users/${uid}`).get()).get('invitedBy')).toBe(inviterCode);
});

test('비회원: 초대 화면은 가입 안내만', async ({ page }) => {
  await page.goto('/invite');
  await expect(page.getByText('초대는 회원만 할 수 있어요.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '가입하기' })).toHaveAttribute('href', /returnTo=%2Finvite/);
});
