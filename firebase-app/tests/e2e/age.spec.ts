import { expect, test } from '@playwright/test';
import {
  accounts,
  answerQuestion,
  becomeGuest,
  clearEmulators,
  hasFirestore,
  listDocs,
  newGuestUid,
  readDoc,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * 만 14세 확인 (1단계) — Firestore 에뮬레이터에 실제로 저장되는지까지 본다.
 * Java(JDK 21)가 없어 Firestore 에뮬레이터가 없으면 건너뛴다.
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');

test.beforeAll(async () => {
  await clearEmulators();
});

const uidOf = async (email: string) => (await accounts()).find((user) => user.email === email)?.localId;

test('새 회원은 확인 화면으로 가고, 확인하면 서버 시각이 저장되고 원래 화면으로 돌아간다', async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/welcome\/age\?returnTo=/);
  await expect(page.getByRole('heading', { level: 1, name: '만 14세 이상인가요?' })).toBeVisible();

  const uid = await uidOf(email);
  expect(uid).toBeDefined();
  expect(await readDoc(`users/${uid}`)).toBeNull();

  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  // 확인 다음은 프로필 설정(3단계) — 닉네임과 최애 구단이 아직 없다
  await expect(page).toHaveURL(/\/welcome\/profile/);

  const profile = await readDoc(`users/${uid}`);
  expect(profile).not.toBeNull();
  expect(profile).toHaveProperty('ageConfirmedAt.timestampValue');
});

test('확인한 회원에게는 다시 묻지 않는다', async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  await expect(page).toHaveURL(/\/welcome\/profile/);

  await page.goto('/welcome/age?returnTo=%2Fprivacy');
  await expect(page).toHaveURL(/\/privacy$/);

  // 새로고침해도(프로필을 다시 읽어도) 확인 화면으로 가지 않는다 — 다음 단계(프로필)로 간다
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome\/profile/);
});

test('비회원에서 가입한 회원도 확인을 거친다', async ({ page }) => {
  await becomeGuest(page);

  await signUp(page, uniqueEmail());
  await expect(page).toHaveURL(/\/welcome\/age/, { timeout: 15_000 });
});

test('만 14세 미만이라고 답하면 프로필과 계정을 지운다', async ({ page }) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/welcome\/age/);
  expect(await uidOf(email)).toBeDefined();

  await page.getByRole('button', { name: '아니요, 만 14세 미만이에요' }).click();
  await expect(page.getByRole('heading', { name: '지금은 가입할 수 없어요' })).toBeVisible();
  await page.getByRole('button', { name: '계정 지우기' }).click();
  await expect(page.getByRole('heading', { name: '계정을 지웠어요' })).toBeVisible();

  expect(await uidOf(email)).toBeUndefined();
  await page.getByRole('button', { name: '메인으로' }).click();
  await expect(page.getByRole('link', { name: '가입하기' })).toBeVisible();
});

test('비회원으로 친 뒤 가입해 만 14세 미만이라고 답하면 비회원 기록까지 지운다', async ({ page }) => {
  test.setTimeout(60_000);
  const before = await accounts();
  await page.goto('/play');
  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answerQuestion(page, false);
    await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await expect(page.getByText(/오답노트에 담았어요/)).toBeVisible({ timeout: 15_000 });
  const uid = (await newGuestUid(before))!;
  expect(await listDocs(`users/${uid}/games`)).toHaveLength(1);

  await signUp(page, uniqueEmail());
  await page.getByRole('button', { name: '아니요, 만 14세 미만이에요' }).click();
  await page.getByRole('button', { name: '계정 지우기' }).click();
  await expect(page.getByRole('heading', { name: '계정을 지웠어요' })).toBeVisible({ timeout: 15_000 });

  for (const name of ['games', 'summary', 'daily', 'wrongNotes']) {
    expect(await listDocs(`users/${uid}/${name}`), name).toEqual([]);
  }
});
